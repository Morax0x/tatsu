const { Client, GatewayIntentBits, Collection, EmbedBuilder, PermissionsBitField, Events, Colors, MessageFlags, ChannelType, REST, Routes } = require("discord.js");
const SQLite = require("better-sqlite3");
const fs = require('fs');
const path = require('path');

// ==================================================================
// 1. إعداد قاعدة البيانات
// ==================================================================
const sql = new SQLite('./mainDB.sqlite');
sql.pragma('journal_mode = WAL');

try {
    const { setupDatabase } = require("./database-setup.js");
    setupDatabase(sql);
} catch (err) {
    console.error("!!! Database Setup Fatal Error !!!");
    console.error(err);
}

// ضمان وجود الأعمدة الضرورية لتجنب الأخطاء
try { sql.prepare("ALTER TABLE settings ADD COLUMN casinoChannelID TEXT").run(); } catch (e) {}
try { sql.prepare("ALTER TABLE settings ADD COLUMN chatChannelID TEXT").run(); } catch (e) {}
try { sql.prepare("ALTER TABLE settings ADD COLUMN treeBotID TEXT").run(); } catch (e) {}
try { sql.prepare("ALTER TABLE settings ADD COLUMN treeChannelID TEXT").run(); } catch (e) {}
try { sql.prepare("ALTER TABLE settings ADD COLUMN countingChannelID TEXT").run(); } catch (e) {}
try { sql.prepare("ALTER TABLE settings ADD COLUMN questChannelID TEXT").run(); } catch (e) {}
try { sql.prepare("CREATE TABLE IF NOT EXISTS quest_achievement_roles (guildID TEXT, roleID TEXT, achievementID TEXT)").run(); } catch (e) {}

// ==================================================================
// 2. استيراد المعالجات والملفات
// ==================================================================
const { handleStreakMessage, calculateBuffMultiplier, checkDailyStreaks, updateNickname, calculateMoraBuff, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate, sendStreakWarnings } = require("./streak-handler.js");
const { checkPermissions, checkCooldown } = require("./permission-handler.js");
const questsConfig = require('./json/quests-config.json');

const { generateSingleAchievementAlert, generateQuestAlert } = require('./generators/achievement-generator.js'); 
const { createRandomDropGiveaway, endGiveaway, getUserWeight } = require('./handlers/giveaway-handler.js');
const { checkUnjailTask } = require('./handlers/report-handler.js'); 
const { loadRoleSettings } = require('./handlers/reaction-role-handler.js');

// ==================================================================
// 3. إعداد العميل (Client)
// ==================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// المتغيرات العامة
client.commands = new Collection();
client.cooldowns = new Collection();
client.talkedRecently = new Map();
const voiceXPCooldowns = new Map();
client.recentMessageTimestamps = new Collection(); 
const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000; 
const botToken = process.env.DISCORD_BOT_TOKEN;

// الإيموجيات والمتغيرات المساعدة
client.EMOJI_MORA = '<:mora:1435647151349698621>';
client.EMOJI_STAR = '⭐';
client.EMOJI_WI = '<a:wi:1435572304988868769>';
client.EMOJI_WII = '<a:wii:1435572329039007889>';
client.EMOJI_FASTER = '<a:JaFaster:1435572430042042409>';
client.EMOJI_PRAY = '<:0Pray:1437067281493524502>';
client.EMOJI_COOL = '<a:NekoCool:1435572459276337245>';
const EMOJI_XP_ANIM = '<a:levelup:1437805366048985290>';

client.generateSingleAchievementAlert = generateSingleAchievementAlert;
client.generateQuestAlert = generateQuestAlert;
client.sql = sql;

// تشغيل نظام النسخ الاحتياطي
require('./handlers/backup-scheduler.js')(client, sql);

// القوالب الافتراضية للإحصائيات
const defaultDailyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

client.safeMerge = function(base, defaults) {
    const result = { ...base };
    for (const key in defaults) {
        if (result[key] === undefined) result[key] = defaults[key];
    }
    return result;
};

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

// ==================================================================
// 4. دوال النظام الأساسية (Levelling, Quests)
// ==================================================================

client.checkAndAwardLevelRoles = async function(member, newLevel) {
    try {
        const guild = member.guild;
        const allLevelRoles = sql.prepare("SELECT level, roleID FROM level_roles WHERE guildID = ? ORDER BY level DESC").all(guild.id);
        if (allLevelRoles.length === 0) return; 
        const botMember = guild.members.me;
        if (!botMember.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
        let roleToAdd = null; 
        const rolesToRemove = []; 
        let highestRoleFound = false; 
        for (const row of allLevelRoles) {
            const role = guild.roles.cache.get(row.roleID);
            if (!role) continue;
            if (row.level <= newLevel && !highestRoleFound) {
                highestRoleFound = true;
                if (!member.roles.cache.has(role.id)) roleToAdd = role; 
            } else {
                if (member.roles.cache.has(role.id)) rolesToRemove.push(role);
            }
        }
        if (roleToAdd && roleToAdd.position < botMember.roles.highest.position) {
            await member.roles.add(roleToAdd);
        }
        if (rolesToRemove.length > 0) {
            try { await member.roles.remove(rolesToRemove); } catch (e) {}
        }
    } catch (err) { console.error("[Level Roles] Error:", err.message); }
}

client.sendLevelUpMessage = async function(messageOrInteraction, member, newLevel, oldLevel, xpData) {
    try {
        await client.checkAndAwardLevelRoles(member, newLevel);
        const guild = messageOrInteraction.guild;
        let channelToSend = messageOrInteraction.channel;
        try {
            let channelData = sql.prepare("SELECT channel FROM channel WHERE guild = ?").get(guild.id);
            if (channelData && channelData.channel && channelData.channel !== 'Default') {
                const fetchedChannel = guild.channels.cache.get(channelData.channel);
                if (fetchedChannel) channelToSend = fetchedChannel;
            }
        } catch(e) {}
        let customSettings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
        let levelUpContent = null;
        let embed;
        if (customSettings && customSettings.lvlUpTitle) {
            function antonymsLevelUp(string) {
                return string.replace(/{member}/gi, `${member}`).replace(/{level}/gi, `${newLevel}`).replace(/{level_old}/gi, `${oldLevel}`).replace(/{xp}/gi, `${xpData.xp}`).replace(/{totalXP}/gi, `${xpData.totalXP}`);
            }
            embed = new EmbedBuilder().setTitle(antonymsLevelUp(customSettings.lvlUpTitle)).setDescription(antonymsLevelUp(customSettings.lvlUpDesc.replace(/\\n/g, '\n'))).setColor(customSettings.lvlUpColor || "Random").setTimestamp();
            if (customSettings.lvlUpImage) { embed.setImage(antonymsLevelUp(customSettings.lvlUpImage)); }
            if (customSettings.lvlUpMention == 1) { levelUpContent = `${member}`; }
        } else {
            embed = new EmbedBuilder().setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) }).setColor("Random").setDescription(`**Congratulations** ${member}! You have now leveled up to **level ${newLevel}**`);
        }
        if (!channelToSend) return;
        const perms = channelToSend.permissionsFor(guild.members.me);
        if (perms.has(PermissionsBitField.Flags.SendMessages) && perms.has(PermissionsBitField.Flags.ViewChannel)) {
            await channelToSend.send({ content: levelUpContent, embeds: [embed] }).catch(() => {});
        }
    } catch (err) { console.error(`[LevelUp Error]: ${err.message}`); }
}

client.sendQuestAnnouncement = async function(guild, member, quest, questType = 'achievement') {
    try {
        const id = `${member.id}-${guild.id}`;
        let notifSettings = sql.prepare("SELECT * FROM quest_notifications WHERE id = ?").get(id);

        if (!notifSettings) {
            notifSettings = { id: id, userID: member.id, guildID: guild.id, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1 };
            client.setQuestNotif.run(notifSettings);
        }

        let sendMention = false;
        if (questType === 'daily' && notifSettings.dailyNotif === 1) sendMention = true;
        if (questType === 'weekly' && notifSettings.weeklyNotif === 1) sendMention = true;
        if (questType === 'achievement' && notifSettings.achievementsNotif === 1) sendMention = true;

        const userIdentifier = sendMention ? `${member}` : `**${member.displayName}**`;
         
        const settings = sql.prepare("SELECT questChannelID FROM settings WHERE guild = ?").get(guild.id);
        if (!settings || !settings.questChannelID) return; 

        const channel = guild.channels.cache.get(settings.questChannelID);
        if (!channel) return;
        const perms = channel.permissionsFor(guild.members.me);
        if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) return;

        const canAttachFiles = perms.has(PermissionsBitField.Flags.AttachFiles);
        const questName = quest.name;
        const reward = quest.reward; 
        let message = '';
        let files = []; 
        let attachmentError = false; 
         
        const rewardDetails = `\n- **حصـلـت عـلـى:**\nMora: \`${reward.mora.toLocaleString()}\` ${client.EMOJI_MORA} | XP: \`${reward.xp.toLocaleString()}\` ${EMOJI_XP_ANIM}`;

        if (canAttachFiles) {
            try {
                let attachment;
                if (questType === 'achievement') {
                    attachment = await client.generateSingleAchievementAlert(member, quest);
                } else {
                    const typeForAlert = questType === 'weekly' ? 'rare' : 'daily';
                    attachment = await client.generateQuestAlert(member, quest, typeForAlert);
                }
                if(attachment) files.push(attachment);
            } catch (imgErr) { 
                console.error("[Image Gen Fail]", imgErr);
                attachmentError = true; 
            }
        }

        if (questType === 'achievement') {
            message = [
                `╭⭒★︰ ${client.EMOJI_WI} ${userIdentifier} ${client.EMOJI_WII}`,
                `✶ انـرت سمـاء الامـبراطـوريـة بإنجـازك ${client.EMOJI_FASTER}`,
                `✥ انـجـاز: **${questName}**`,
                ``,
                `- فـالتسـجل امبراطوريتـنـا اسمـك بيـن العضـمـاء ${client.EMOJI_PRAY}`,
                rewardDetails
            ].join('\n');
        } else {
            const typeText = questType === 'daily' ? 'يوميـة' : 'اسبوعيـة';
            message = [
                `╭⭒★︰ ${client.EMOJI_WI} ${userIdentifier} ${client.EMOJI_WII}`,
                `✶ اتـممـت مهمـة ${typeText}`,
                `✥ الـمهـمـة: **${questName}**`,
                ``,
                `- لقـد أثبـت انـك احـد اركـان الامبراطـورية ${client.EMOJI_PRAY}`,
                `- لا يُكلـف مثـلك الا بالمستحيـل ${client.EMOJI_COOL} ~`,
                rewardDetails
            ].join('\n');
        }
         
        await channel.send({ content: message, files: files, allowedMentions: { users: sendMention ? [member.id] : [] } });

    } catch (err) { console.error("Error sending quest announcement:", err.message); }
}

client.checkQuests = async function(client, member, stats, questType, dateKey) {
    const questsToCheck = questsConfig[questType] || [];
    for (const quest of questsToCheck) {
        const currentProgress = stats[quest.stat] || 0;
        if (currentProgress >= quest.goal) {
            const claimID = `${member.id}-${member.guild.id}-${quest.id}-${dateKey}`;
            const existingClaim = sql.prepare("SELECT * FROM user_quest_claims WHERE claimID = ?").get(claimID);
            if (!existingClaim) {
                sql.prepare("INSERT INTO user_quest_claims (claimID, userID, guildID, questID, dateStr) VALUES (?, ?, ?, ?, ?)").run(claimID, member.id, member.guild.id, quest.id, dateKey);
                let levelData = client.getLevel.get(member.id, member.guild.id);
                if (!levelData) levelData = { ...client.defaultData, user: member.id, guild: member.guild.id };
                levelData.mora = (levelData.mora || 0) + quest.reward.mora;
                levelData.xp += quest.reward.xp;
                levelData.totalXP += quest.reward.xp;
                const nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                if (levelData.xp >= nextXP) {
                    const oldLevel = levelData.level;
                    levelData.xp -= nextXP;
                    levelData.level += 1;
                }
                client.setLevel.run(levelData);
                await client.sendQuestAnnouncement(member.guild, member, quest, questType);
            }
        }
    }
}

client.checkAchievements = async function(client, member, levelData, totalStatsData) {
    for (const ach of questsConfig.achievements) {
        let currentProgress = 0;
        const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.id, member.guild.id);
        const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
         
        if (!totalStatsData) totalStatsData = client.getTotalStats.get(`${member.id}-${member.guild.id}`) || {};
        totalStatsData = client.safeMerge(totalStatsData, defaultTotalStats); 

        if (ach.stat === 'messages') currentProgress = totalStatsData.total_messages || 0;
        else if (ach.stat === 'total_messages') currentProgress = totalStatsData.total_messages || 0; 
        else if (ach.stat === 'images') currentProgress = totalStatsData.total_images || 0;
        else if (ach.stat === 'stickers') currentProgress = totalStatsData.total_stickers || 0;
        else if (ach.stat === 'reactions_added') currentProgress = totalStatsData.total_reactions_added || 0;
        else if (ach.stat === 'total_reactions_added') currentProgress = totalStatsData.total_reactions_added || 0;
        else if (ach.stat === 'replies_sent') currentProgress = totalStatsData.total_replies_sent || 0;
        else if (ach.stat === 'vc_minutes') currentProgress = totalStatsData.total_vc_minutes || 0;
        else if (ach.stat === 'totalVCTime') currentProgress = totalStatsData.total_vc_minutes || 0;
        else if (ach.stat === 'disboard_bumps') currentProgress = totalStatsData.total_disboard_bumps || 0;
        else if (ach.stat === 'meow_count' || ach.stat === 'total_meow_count') {
             let ld = levelData || client.getLevel.get(member.id, member.guild.id);
             currentProgress = ld ? (ld.total_meow_count || 0) : 0;
        }
        else if (ach.stat === 'boost_count') {
             let ld = levelData || client.getLevel.get(member.id, member.guild.id);
             currentProgress = ld ? (ld.boost_count || 0) : 0;
        }
        else if (levelData && levelData.hasOwnProperty(ach.stat)) currentProgress = levelData[ach.stat];
        else if (totalStatsData.hasOwnProperty(ach.stat)) currentProgress = totalStatsData[ach.stat];
        else if (ach.stat === 'highestStreak' && streakData) currentProgress = streakData.highestStreak || 0;
        else if (ach.stat === 'highestMediaStreak' && mediaStreakData) currentProgress = mediaStreakData.highestStreak || 0;
        else if (streakData && streakData.hasOwnProperty(ach.stat)) currentProgress = streakData[ach.stat];
        else {
             if (['has_caesar_role', 'has_race_role', 'has_tree_role', 'has_tag_role'].includes(ach.stat)) continue;
            continue;
        }

        if (currentProgress >= ach.goal) {
            const existingAch = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?").get(member.id, member.guild.id, ach.id);
            if (!existingAch) {
                sql.prepare("INSERT INTO user_achievements (userID, guildID, achievementID, timestamp) VALUES (?, ?, ?, ?)").run(member.id, member.guild.id, ach.id, Date.now());
                let ld = levelData || client.getLevel.get(member.id, member.guild.id);
                if (!ld) ld = { ...client.defaultData, user: member.id, guild: member.guild.id };
                ld.mora = (ld.mora || 0) + ach.reward.mora;
                ld.xp += ach.reward.xp;
                ld.totalXP += ach.reward.xp;
                const nextXP = 5 * (ld.level ** 2) + (50 * ld.level) + 100;
                if (ld.xp >= nextXP) {
                    ld.xp -= nextXP;
                    ld.level += 1;
                }
                client.setLevel.run(ld);
                await client.sendQuestAnnouncement(member.guild, member, ach, 'achievement');
            }
        }
    }
}

client.incrementQuestStats = async function(userID, guildID, stat, amount = 1) {
    if (stat === 'messages') {
        if (!client.recentMessageTimestamps.has(guildID)) client.recentMessageTimestamps.set(guildID, []);
        const guildTimestamps = client.recentMessageTimestamps.get(guildID);
        const now = Date.now();
        for (let i = 0; i < amount; i++) { guildTimestamps.push(now); }
        while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); }
    }
    try {
        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString();
        const dailyStatsId = `${userID}-${guildID}-${dateStr}`;
        const weeklyStatsId = `${userID}-${guildID}-${weekStartDateStr}`;
        const totalStatsId = `${userID}-${guildID}`;

        let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID, guildID, date: dateStr };
        let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID, guildID, weekStartDate: weekStartDateStr };
        let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID, guildID };

        dailyStats = client.safeMerge(dailyStats, defaultDailyStats);
        weeklyStats = client.safeMerge(weeklyStats, defaultDailyStats);
        totalStats = client.safeMerge(totalStats, defaultTotalStats);

        if (dailyStats.hasOwnProperty(stat)) dailyStats[stat] = (dailyStats[stat] || 0) + amount;
        if (weeklyStats.hasOwnProperty(stat)) weeklyStats[stat] = (weeklyStats[stat] || 0) + amount;
        if (stat === 'disboard_bumps') totalStats.total_disboard_bumps = (totalStats.total_disboard_bumps || 0) + amount;
         
        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
         
        client.setTotalStats.run({
            id: totalStatsId, userID, guildID,
            total_messages: totalStats.total_messages, total_images: totalStats.total_images, total_stickers: totalStats.total_stickers,
            total_reactions_added: totalStats.total_reactions_added, replies_sent: totalStats.total_replies_sent, mentions_received: totalStats.total_mentions_received,
            total_vc_minutes: totalStats.total_vc_minutes, total_disboard_bumps: totalStats.total_disboard_bumps
        });

        const member = client.guilds.cache.get(guildID)?.members.cache.get(userID);
        if (member) {
            await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
            await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
            if (stat === 'disboard_bumps') await client.checkAchievements(client, member, null, totalStats);
             if (stat === 'meow_count') {
                 let levelData = client.getLevel.get(userID, guildID);
                 if (levelData) await client.checkAchievements(client, member, levelData, totalStats);
            }
            if (stat === 'water_tree') {
                 let levelData = client.getLevel.get(userID, guildID);
                 if (levelData) await client.checkAchievements(client, member, levelData, totalStats);
            }
        }
    } catch (err) { console.error(`[IncrementQuestStats] Error:`, err.message); }
}

client.checkRoleAchievement = async function(member, roleId, achievementId) {
    try {
        const guildID = member.guild.id;
        const userID = member.id;
        const existingAch = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?").get(userID, guildID, achievementId);
        const ach = questsConfig.achievements.find(a => a.id === achievementId);
        if (!ach) return;
        let hasRole = false;
        if (achievementId === 'ach_race_role') {
            const raceRoles = sql.prepare("SELECT roleID FROM race_roles WHERE guildID = ?").all(guildID);
            const raceRoleIDs = raceRoles.map(r => r.roleID);
            hasRole = member.roles.cache.some(role => raceRoleIDs.includes(role.id));
        } else { hasRole = member.roles.cache.has(roleId); }
        if (hasRole) {
            if (existingAch) return; 
            sql.prepare("INSERT INTO user_achievements (userID, guildID, achievementID, timestamp) VALUES (?, ?, ?, ?)").run(userID, guildID, ach.id, Date.now());
            let ld = client.getLevel.get(userID, guildID);
            if (!ld) ld = { ...client.defaultData, user: userID, guild: guildID };
            ld.mora = (ld.mora || 0) + ach.reward.mora;
            ld.xp += ach.reward.xp;
            ld.totalXP += ach.reward.xp;
            client.setLevel.run(ld);
            await client.sendQuestAnnouncement(member.guild, member, ach, 'achievement');
        } else {
            if (existingAch) {
                sql.prepare("DELETE FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?").run(userID, guildID, achievementId);
            }
        }
    } catch (err) { console.error(`[checkRoleAchievement] Error:`, err.message); }
}



// ==================================================================
// 5. أنظمة الاقتصاد والديون (Economy Engines)
// ==================================================================

// 5.1 نظام السوق (Balanced Market + 1000 Resistance)
function updateMarketPrices() {
    try {
        const allItems = sql.prepare("SELECT * FROM market_items").all();
        if (allItems.length === 0) return;

        const updateStmt = sql.prepare(`UPDATE market_items SET currentPrice = ?, lastChangePercent = ?, lastChange = ? WHERE id = ?`);

        const transaction = sql.transaction(() => {
            for (const item of allItems) {
                const oldPrice = item.currentPrice;
                let changePercent = 0;
                
                // 1. توليد نسبة عشوائية متماثلة (Symmetric Volatility)
                // النطاق: من -15% إلى +15%
                // Math.random() يعطي من 0 لـ 1
                // (Math.random() * 0.30) يعطي من 0 لـ 0.30
                // ثم نطرح 0.15، لتصبح النتيجة النهائية من -0.15 لـ +0.15
                changePercent = (Math.random() * 0.30) - 0.15;

                // 2. تطبيق المقاومة الصعبة عند تجاوز 1000
                if (oldPrice > 1000) {
                    if (changePercent > 0) {
                        // إذا كان السوق يحاول الصعود فوق 1000، نقسم قوة الصعود على 5
                        // (يصبح الصعود صعب جداً)
                        changePercent = changePercent / 5; 
                    }
                    // إذا كان نزول (سالب)، نتركه كما هو بقوته الكاملة (سهولة الهبوط)
                }

                // 3. حساب السعر الجديد وتطبيق الحدود القصوى والدنيا
                let newPrice = Math.floor(oldPrice * (1 + changePercent));

                if (newPrice > 10000) newPrice = 10000; 
                if (newPrice < 50) newPrice = 50;        

                const changeAmount = newPrice - oldPrice;
                const finalPercent = ((changeAmount / oldPrice) * 100).toFixed(2);

                updateStmt.run(newPrice, finalPercent, changeAmount, item.id);
            }
        });
        
        transaction();
        console.log(`[Market] Prices updated with Soft Cap logic.`);
        
    } catch (err) {
        console.error("[Market] Error updating prices:", err.message);
    }
}

// 5.2 نظام تحصيل الديون (Ruthless Debt Collectors)
const checkLoanPayments = async () => {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const activeLoans = sql.prepare("SELECT * FROM user_loans WHERE remainingAmount > 0 AND (lastPaymentDate + ?) <= ?").all(ONE_DAY, now);

    if (activeLoans.length === 0) return;

    for (const loan of activeLoans) {
        try {
            const guild = client.guilds.cache.get(loan.guildID);
            if (!guild) continue;

            let userData = client.getLevel.get(loan.userID, loan.guildID);
            if (!userData) continue;

            const paymentAmount = Math.min(loan.dailyPayment, loan.remainingAmount);
            let remainingToPay = paymentAmount;
            let logDetails = [];
            
            // 1. سحب الكاش
            if (userData.mora > 0) {
                const takeMora = Math.min(userData.mora, remainingToPay);
                userData.mora -= takeMora;
                remainingToPay -= takeMora;
                logDetails.push(`💰 مورا: ${takeMora.toLocaleString()}`);
            }

            // 2. سحب الأسهم
            if (remainingToPay > 0) {
                try {
                    const userStocks = sql.prepare("SELECT * FROM user_stocks WHERE userID = ? AND guildID = ? AND count > 0").all(loan.userID, loan.guildID);
                    for (const stock of userStocks) {
                        if (remainingToPay <= 0) break;
                        
                        const stockInfo = sql.prepare("SELECT currentPrice FROM market_items WHERE id = ?").get(stock.stockID);
                        const currentPrice = stockInfo ? stockInfo.currentPrice : 0;

                        if (currentPrice > 0) {
                            const stocksNeeded = Math.ceil(remainingToPay / currentPrice);
                            const stocksToSell = Math.min(stock.count, stocksNeeded);
                            const valueObtained = stocksToSell * currentPrice;

                            if (stocksToSell === stock.count) {
                                sql.prepare("DELETE FROM user_stocks WHERE userID = ? AND guildID = ? AND stockID = ?").run(loan.userID, loan.guildID, stock.stockID);
                            } else {
                                sql.prepare("UPDATE user_stocks SET count = count - ? WHERE userID = ? AND guildID = ? AND stockID = ?").run(stocksToSell, loan.userID, loan.guildID, stock.stockID);
                            }

                            remainingToPay -= valueObtained;
                            logDetails.push(`📉 أسهم (${stock.stockID}): ${stocksToSell} سهم بقيمة ${valueObtained}`);
                        }
                    }
                } catch (e) {}
            }

            // 3. سحب المزرعة
            if (remainingToPay > 0) {
                try {
                    const userCrops = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ?").all(loan.userID, loan.guildID);
                    for (const item of userCrops) {
                        if (remainingToPay <= 0) break;
                        const estimatedPrice = 50; 
                        const itemsNeeded = Math.ceil(remainingToPay / estimatedPrice);
                        const itemsToSell = Math.min(item.count, itemsNeeded);
                        const valueObtained = itemsToSell * estimatedPrice;

                        if (itemsToSell === item.count) {
                            sql.prepare("DELETE FROM user_inventory WHERE userID = ? AND guildID = ? AND itemID = ?").run(loan.userID, loan.guildID, item.itemID);
                        } else {
                            sql.prepare("UPDATE user_inventory SET count = count - ? WHERE userID = ? AND guildID = ? AND itemID = ?").run(itemsToSell, loan.userID, loan.guildID, item.itemID);
                        }
                        
                        remainingToPay -= valueObtained;
                        logDetails.push(`🌾 مزرعة (${item.itemID}): ${itemsToSell} بقيمة ${valueObtained}`);
                    }
                } catch (e) {}
            }

            // 4. سحب XP (عقوبة)
            if (remainingToPay > 0) {
                const xpPenalty = Math.floor(remainingToPay * 2);
                if (userData.xp >= xpPenalty) {
                    userData.xp -= xpPenalty;
                } else {
                    userData.xp = 0; 
                    if (userData.level > 1) userData.level -= 1;
                }
                logDetails.push(`✨ خبرة (عقوبة): خصم ${xpPenalty} XP`);
                remainingToPay = 0; 
            }

            client.setLevel.run(userData);

            loan.remainingAmount -= paymentAmount;
            loan.lastPaymentDate = now;

            if (loan.remainingAmount <= 0) {
                loan.remainingAmount = 0;
                sql.prepare("DELETE FROM user_loans WHERE userID = ? AND guildID = ?").run(loan.userID, loan.guildID);
                logDetails.push("🎉 **تم سداد القرض بالكامل!**");
            } else {
                sql.prepare("UPDATE user_loans SET remainingAmount = ?, lastPaymentDate = ? WHERE userID = ? AND guildID = ?").run(loan.remainingAmount, now, loan.userID, loan.guildID);
            }

            // 5. إرسال التقرير (كازينو فقط)
            let settings;
            try { settings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?").get(loan.guildID); } catch (e) {}

            if (settings && settings.casinoChannelID) {
                const channel = guild.channels.cache.get(settings.casinoChannelID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle('❖ محـصـلي الديـون وصـلـوا !')
                        .setColor(Colors.DarkRed)
                        .setDescription([
                            `👤 **العميل:** <@${loan.userID}>`,
                            `📅 **القسط اليومي:** ${paymentAmount.toLocaleString()} ${client.EMOJI_MORA}`,
                            `💰 **المتبقي من القرض:** ${loan.remainingAmount.toLocaleString()} ${client.EMOJI_MORA}`,
                            `📉 **إجراءات التحصيل:**`,
                            logDetails.length > 0 ? logDetails.map(l => `- ${l}`).join('\n') : "- تم الخصم من الرصيد البنكي مباشرة."
                        ].join('\n'))
                        .setThumbnail('https://i.postimg.cc/GmQN2JWF/bank.gif')
                        .setFooter({ text: 'نظام البنك الإمبراطوري', iconURL: guild.iconURL() });

                    await channel.send({ content: `<@${loan.userID}>`, embeds: [embed] });
                }
            } else {
                try { 
                    const member = await guild.members.fetch(loan.userID);
                    member.send(`⚠️ **تنبيه بنكي:** تم خصم قسط القرض (${paymentAmount}) من حسابك/ممتلكاتك.`).catch(() => {});
                } catch (e) {}
            }

        } catch (err) { console.error(err); }
    }
};

// أمر إصلاح الأسعار (للمطور فقط)
client.on('messageCreate', async (message) => {
    if (message.content === '!fixprices' && message.author.id === '1145327691772481577') {
        try {
            sql.prepare("UPDATE market_items SET currentPrice = 500").run();
            message.reply("✅ **تم تصفير جميع أسعار الأسهم إلى 500.** سيبدأ النظام الجديد بالعمل الآن.");
        } catch (e) { message.reply("❌ حدث خطأ: " + e.message); }
    }
});

// ==================================================================
// 6. تشغيل البوت والمجدولات (Main Loop)
// ==================================================================
client.on(Events.ClientReady, async () => { 
    console.log(`✅ Logged in as ${client.user.username} (Final Fixes)`);
    
    const rest = new REST({ version: '10' }).setToken(botToken);
    const commands = [];
    function getFiles(dir) {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        let commandFiles = [];
        for (const file of files) {
            if (file.isDirectory()) commandFiles = [...commandFiles, ...getFiles(path.join(dir, file.name))];
            else if (file.name.endsWith('.js')) commandFiles.push(path.join(dir, file.name));
        }
        return commandFiles;
    }
    const commandFiles = getFiles(path.join(__dirname, 'commands'));
    for (const file of commandFiles) {
        const command = require(file);
        if (command.data) { commands.push(command.data.toJSON()); client.commands.set(command.data.name, command); }
        if (command.name) { client.commands.set(command.name, command); }
    }
    
    try { 
        const CLIENT_ID = client.user.id;
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands }); 
        console.log(`Successfully reloaded application (/) commands.`); 
    } catch (error) { console.error(error); }

    client.getLevel = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?");
    client.setLevel = sql.prepare("INSERT OR REPLACE INTO levels (user, guild, xp, level, totalXP, mora, lastWork, lastDaily, dailyStreak, bank, lastInterest, totalInterestEarned, hasGuard, guardExpires, lastCollected, totalVCTime, lastRob, lastGuess, lastRPS, lastRoulette, lastTransfer, lastDeposit, shop_purchases, total_meow_count, boost_count, lastPVP) VALUES (@user, @guild, @xp, @level, @totalXP, @mora, @lastWork, @lastDaily, @dailyStreak, @bank, @lastInterest, @totalInterestEarned, @hasGuard, @guardExpires, @lastCollected, @totalVCTime, @lastRob, @lastGuess, @lastRPS, @lastRoulette, @lastTransfer, @lastDeposit, @shop_purchases, @total_meow_count, @boost_count, @lastPVP);");
    client.defaultData = { user: null, guild: null, xp: 0, level: 1, totalXP: 0, mora: 0, lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, lastInterest: 0, totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0, totalVCTime: 0, lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0, lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, total_meow_count: 0, boost_count: 0, lastPVP: 0 };
    client.getDailyStats = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?");
    client.setDailyStats = sql.prepare("INSERT OR REPLACE INTO user_daily_stats (id, userID, guildID, date, messages, images, stickers, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps) VALUES (@id, @userID, @guildID, @date, @messages, @images, @stickers, @reactions_added, @replies_sent, @mentions_received, @vc_minutes, @water_tree, @counting_channel, @meow_count, @streaming_minutes, @disboard_bumps);");
    client.getWeeklyStats = sql.prepare("SELECT * FROM user_weekly_stats WHERE id = ?");
    client.setWeeklyStats = sql.prepare("INSERT OR REPLACE INTO user_weekly_stats (id, userID, guildID, weekStartDate, messages, images, stickers, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps) VALUES (@id, @userID, @guildID, @weekStartDate, @messages, @images, @stickers, @reactions_added, @replies_sent, @mentions_received, @vc_minutes, @water_tree, @counting_channel, @meow_count, @streaming_minutes, @disboard_bumps);");
    client.getTotalStats = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?");
    client.setTotalStats = sql.prepare("INSERT OR REPLACE INTO user_total_stats (id, userID, guildID, total_messages, total_images, total_stickers, total_reactions_added, total_replies_sent, total_mentions_received, total_vc_minutes, total_disboard_bumps) VALUES (@id, @userID, @guildID, @total_messages, @total_images, @total_stickers, @total_reactions_added, @replies_sent, @mentions_received, @total_vc_minutes, @total_disboard_bumps);");
    client.getQuestNotif = sql.prepare("SELECT * FROM quest_notifications WHERE id = ?");
    client.setQuestNotif = sql.prepare("INSERT OR REPLACE INTO quest_notifications (id, userID, guildID, dailyNotif, weeklyNotif, achievementsNotif, levelNotif) VALUES (@id, @userID, @guildID, @dailyNotif, @weeklyNotif, @achievementsNotif, @levelNotif);");
    client.antiRolesCache = new Map();
    await loadRoleSettings(sql, client.antiRolesCache);

    // 5.3 نظام فوائد البنك (مع التحقق من النشاط)
    const calculateInterest = () => {
        const now = Date.now();
        const INTEREST_RATE = 0.0005; 
        const COOLDOWN = 24 * 60 * 60 * 1000; 
        const INACTIVITY_LIMIT = 7 * 24 * 60 * 60 * 1000; 

        const allUsers = sql.prepare("SELECT * FROM levels WHERE bank > 0").all();
        
        for (const user of allUsers) {
            if ((now - user.lastInterest) >= COOLDOWN) {
                // التحقق من النشاط
                const timeSinceDaily = now - (user.lastDaily || 0);
                const timeSinceWork = now - (user.lastWork || 0);

                if (timeSinceDaily > INACTIVITY_LIMIT && timeSinceWork > INACTIVITY_LIMIT) {
                    // خامل: لا فائدة، فقط تحديث الوقت
                    sql.prepare("UPDATE levels SET lastInterest = ? WHERE user = ? AND guild = ?").run(now, user.user, user.guild);
                    continue; 
                }

                const interestAmount = Math.floor(user.bank * INTEREST_RATE);
                if (interestAmount > 0) {
                    sql.prepare("UPDATE levels SET bank = bank + ?, lastInterest = ?, totalInterestEarned = totalInterestEarned + ? WHERE user = ? AND guild = ?").run(interestAmount, now, interestAmount, user.user, user.guild);
                    console.log(`[Bank] Added ${interestAmount} interest to ${user.user}`);
                } else {
                    sql.prepare("UPDATE levels SET lastInterest = ? WHERE user = ? AND guild = ?").run(now, user.user, user.guild);
                }
            }
        }
    };
    setInterval(calculateInterest, 60 * 60 * 1000);
    calculateInterest();
    
    // تشغيل المجدولات الرئيسية
    updateMarketPrices(); 
    setInterval(updateMarketPrices, 60 * 60 * 1000);

    setInterval(checkLoanPayments, 60 * 60 * 1000);

    const STAT_TICK_RATE = 60000; const MINUTES_PER_TICK = 1; const SECONDS_PER_TICK = 60; 
    setInterval(() => { const dateStr = getTodayDateString(); const weekStartDateStr = getWeekStartDateString(); client.guilds.cache.forEach(guild => { const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id); if (!settings) return; const giveVoiceXP = settings.voiceXP > 0 && settings.voiceCooldown > 0; const voiceXP = settings.voiceXP || 0; const voiceCooldown = settings.voiceCooldown || 60000; guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).forEach(channel => { channel.members.forEach(async (member) => { if (member.user.bot || member.voice.channelID === guild.afkChannelId) return; const dailyStatsId = `${member.id}-${guild.id}-${dateStr}`; const weeklyStatsId = `${member.id}-${guild.id}-${weekStartDateStr}`; const totalStatsId = `${member.id}-${guild.id}`; let level = client.getLevel.get(member.id, guild.id); if (!level) { level = { ...client.defaultData, user: member.id, guild: guild.id }; } let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID: member.id, guildID: guild.id, date: dateStr }; let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID: member.id, guildID: guild.id, weekStartDate: weekStartDateStr }; let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: member.id, guildID: guild.id }; dailyStats = client.safeMerge(dailyStats, defaultDailyStats); weeklyStats = client.safeMerge(weeklyStats, defaultDailyStats); totalStats = client.safeMerge(totalStats, defaultTotalStats); let statsChanged = false; if (!member.voice.selfMute && !member.voice.selfDeaf) { dailyStats.vc_minutes += MINUTES_PER_TICK; weeklyStats.vc_minutes += MINUTES_PER_TICK; totalStats.total_vc_minutes += MINUTES_PER_TICK; level.totalVCTime += SECONDS_PER_TICK; statsChanged = true; } if (member.voice.streaming) { dailyStats.streaming_minutes += MINUTES_PER_TICK; weeklyStats.streaming_minutes += MINUTES_PER_TICK; statsChanged = true; } if (giveVoiceXP && !member.voice.selfMMute && !member.voice.selfDeaf) { const cooldownKey = `${guild.id}-${member.id}`; const now = Date.now(); const lastGain = voiceXPCooldowns.get(cooldownKey); if (!lastGain || (now - lastGain) >= voiceCooldown) { const baseXP = voiceXP; const buffMultiplier = calculateBuffMultiplier(member, sql); const finalXP = Math.floor(baseXP * buffMultiplier); level.xp += finalXP; level.totalXP += finalXP; statsChanged = true; voiceXPCooldowns.set(cooldownKey, now); } } if (statsChanged) { const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100; if (level.xp >= nextXP) { const oldLevel = level.level; level.xp -= nextXP; level.level += 1; const newLevel = level.level; client.sendLevelUpMessage(null, member, newLevel, oldLevel, level).catch(console.error); } } if (statsChanged) { client.setDailyStats.run(dailyStats); client.setWeeklyStats.run(weeklyStats); client.setTotalStats.run({ id: totalStatsId, userID: member.id, guildID: guild.id, total_messages: totalStats.total_messages, total_images: totalStats.total_images, total_stickers: totalStats.total_stickers, total_reactions_added: totalStats.total_reactions_added, replies_sent: totalStats.total_replies_sent, mentions_received: totalStats.total_mentions_received, total_vc_minutes: totalStats.total_vc_minutes, total_disboard_bumps: totalStats.total_disboard_bumps }); client.setLevel.run(level); await client.checkQuests(client, member, dailyStats, 'daily', dateStr); await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr); await client.checkAchievements(client, member, level, totalStats); } }); }); }); }, STAT_TICK_RATE); 
    
    checkDailyStreaks(client, sql); setInterval(() => checkDailyStreaks(client, sql), 3600000); 
    checkDailyMediaStreaks(client, sql); setInterval(() => checkDailyMediaStreaks(client, sql), 3600000); 
    checkUnjailTask(client); setInterval(() => checkUnjailTask(client), 5 * 60 * 1000); 
    
    let lastReminderSentHour = -1; let lastUpdateSentHour = -1; let lastWarningSentHour = -1; 
    setInterval(() => { 
        const KSA_TIMEZONE = 'Asia/Riyadh'; 
        const nowKSA = new Date().toLocaleString('en-US', { timeZone: KSA_TIMEZONE }); 
        const ksaDate = new Date(nowKSA); 
        const ksaHour = ksaDate.getHours(); 
        if (ksaHour === 0 && lastUpdateSentHour !== ksaHour) { 
            sendDailyMediaUpdate(client, sql); 
            lastUpdateSentHour = ksaHour; 
        } else if (ksaHour !== 0) lastUpdateSentHour = -1; 
        if (ksaHour === 12 && lastWarningSentHour !== ksaHour) { 
            sendStreakWarnings(client, sql); 
            lastWarningSentHour = ksaHour; 
        } else if (ksaHour !== 12) lastWarningSentHour = -1; 
        if (ksaHour === 15 && lastReminderSentHour !== ksaHour) { 
            sendMediaStreakReminders(client, sql); 
            lastReminderSentHour = ksaHour; 
        } else if (ksaHour !== 15) lastReminderSentHour = -1; 
    }, 60000); 
    
    const lastRandomGiveawayDate = new Map(); setInterval(async () => { const today = new Date().toISOString().split('T')[0]; const now = Date.now(); for (const guild of client.guilds.cache.values()) { const guildID = guild.id; if (lastRandomGiveawayDate.get(guildID) === today) continue; const guildTimestamps = client.recentMessageTimestamps.get(guildID) || []; while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); } const totalMessagesLast2Hours = guildTimestamps.length; if (totalMessagesLast2Hours < 200) continue; const roll = Math.random(); if (roll < 0.10) { try { const success = await createRandomDropGiveaway(client, guild); if (success) { lastRandomGiveawayDate.set(guildID, today); console.log(`[DropGA] Success: ${guild.name}`); } } catch (err) { console.error(`[DropGA] Error:`, err.message); } } } }, 30 * 60 * 1000); 
    
    sendDailyMediaUpdate(client, sql);
}); 

// ==================================================================
// 7. تحميل الأوامر والأحداث
// ==================================================================
function loadCommands(dir) { const files = fs.readdirSync(dir); for (const file of files) { const fullPath = path.join(dir, file); const stat = fs.statSync(fullPath); if (stat.isDirectory()) { loadCommands(fullPath); } else if (file.endsWith('.js')) { try { const command = require(fullPath); const commandName = command.data ? command.data.name : command.name; if (commandName && 'execute' in command) { client.commands.set(commandName, command); } else { console.warn(`[CMD Warn] Skipped: ${file}`); } } catch (error) { console.error(`[CMD Error] ${file}:`, error); } } } }
loadCommands(path.join(__dirname, 'commands')); console.log("[System] Commands Loaded.");

require('./interaction-handler.js')(client, sql);

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) { const filePath = path.join(eventsPath, file); const event = require(filePath); if (event.once) { client.once(event.name, (...args) => event.execute(...args)); } else { client.on(event.name, (...args) => event.execute(...args)); } }
console.log("[System] Events Loaded.");

client.login(botToken);
