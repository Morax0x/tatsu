const { Client, GatewayIntentBits, Collection, EmbedBuilder, PermissionsBitField, Events, Colors, MessageFlags, ChannelType } = require("discord.js");
const SQLite = require("better-sqlite3");
const fs = require('fs');
const path = require('path');

// 1. إعداد قاعدة البيانات
const sql = new SQLite('./mainDB.sqlite');
sql.pragma('journal_mode = WAL');

try {
    const { setupDatabase } = require("./database-setup.js");
    setupDatabase(sql);
} catch (err) {
    console.error("!!! Database Setup Fatal Error !!!");
    console.error(err);
    process.exit(1);
}

// 2. استيراد المعالجات (Handlers)
const { handleStreakMessage, calculateBuffMultiplier, checkDailyStreaks, updateNickname, calculateMoraBuff, checkDailyMediaStreaks, sendMediaStreakReminders, sendDailyMediaUpdate, sendStreakWarnings } = require("./streak-handler.js");
const { checkPermissions, checkCooldown } = require("./permission-handler.js");
const questsConfig = require('./json/quests-config.json');
// تأكد من صحة مسار المولدات
const { generateSingleAchievementAlert, generateQuestAlert } = require('./generators/achievement-generator.js'); 
const { createRandomDropGiveaway, endGiveaway, getUserWeight } = require('./handlers/giveaway-handler.js');
const { checkUnjailTask } = require('./handlers/report-handler.js'); 
const { loadRoleSettings } = require('./handlers/reaction-role-handler.js');

// 3. إعداد العميل (Client)
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

// 4. المجموعات والمتغيرات العامة
client.commands = new Collection();
client.cooldowns = new Collection();
client.talkedRecently = new Map();
const voiceXPCooldowns = new Map();
client.recentMessageTimestamps = new Collection(); 
const RECENT_MESSAGE_WINDOW = 2 * 60 * 60 * 1000; 
const botToken = process.env.DISCORD_BOT_TOKEN;

// ربط المتغيرات والمولدات بالعميل
client.EMOJI_MORA = '<:mora:1435647151349698621>';
client.EMOJI_STAR = '⭐';
client.EMOJI_WI = '<a:wi:1435572304988868769>';
client.EMOJI_WII = '<a:wii:1435572329039007889>';
client.EMOJI_FASTER = '<a:JaFaster:1435572430042042409>';
client.EMOJI_PRAY = '<:0Pray:1437067281493524502>';
client.EMOJI_COOL = '<a:NekoCool:1435572459276337245>';

// ربط المولدات (مهم جداً للصور)
client.generateSingleAchievementAlert = generateSingleAchievementAlert;
client.generateQuestAlert = generateQuestAlert;
client.sql = sql;

// تشغيل نظام الباك أب
require('./handlers/backup-scheduler.js')(client, sql);

// --- دوال مساعدة وقوالب البيانات ---
const defaultDailyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

function safeMerge(base, defaults) {
    const result = { ...base };
    for (const key in defaults) {
        if (result[key] === undefined) result[key] = defaults[key];
    }
    return result;
}

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

// ==================================================================
// 🌟🌟 دوال النظام الأساسية (Attached to Client) 🌟🌟
// ==================================================================

// 1. فحص وإعطاء رتب اللفل
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

// 2. إرسال رسالة اللفل أب
client.sendLevelUpMessage = async function(messageOrInteraction, member, newLevel, oldLevel, xpData) {
    // تم نقل منطق القناة إلى messageCreate.js ولكننا نحتفظ بهذا كاحتياط
    // الدالة في messageCreate.js هي التي تستخدم الآن بشكل أساسي
    console.log(`[LevelUp] ${member.user.tag} reached level ${newLevel}`);
}

// 3. إعلان إنجاز المهمة (معدلة لضمان الإرسال) 🛠️
client.sendQuestAnnouncement = async function(guild, member, quest, questType = 'achievement') {
    try {
        // 1. التحقق من إعدادات المستخدم للإشعارات
        const id = `${member.id}-${guild.id}`;
        let notifSettings = sql.prepare("SELECT * FROM quest_notifications WHERE id = ?").get(id);
        if (!notifSettings) {
            notifSettings = { id: id, userID: member.id, guildID: guild.id, dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1 };
            client.setQuestNotif.run(notifSettings);
        }

        // 2. تحديد ما إذا كان يجب عمل منشن
        let sendMention = false;
        if (questType === 'daily' && notifSettings.dailyNotif === 1) sendMention = true;
        if (questType === 'weekly' && notifSettings.weeklyNotif === 1) sendMention = true;
        if (questType === 'achievement' && notifSettings.achievementsNotif === 1) sendMention = true;

        const userIdentifier = sendMention ? `${member}` : `**${member.displayName}**`;

        // 3. جلب قناة المهام من الإعدادات 🔍
        const settings = sql.prepare("SELECT questChannelID FROM settings WHERE guild = ?").get(guild.id);
        if (!settings || !settings.questChannelID) {
            // console.log("[Quest Alert] No quest channel set."); // Uncomment for debug
            return; 
        }

        const channel = guild.channels.cache.get(settings.questChannelID);
        if (!channel) return;

        // 4. التحقق من الصلاحيات
        const perms = channel.permissionsFor(guild.members.me);
        if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages)) return;

        const canAttachFiles = perms.has(PermissionsBitField.Flags.AttachFiles);
        const questName = quest.name;
        const reward = quest.reward; 
        let message = '';
        let files = []; 
        let attachmentError = false; 
        const rewardText = `${client.EMOJI_MORA} \`${reward.mora.toLocaleString()}\` | ${client.EMOJI_STAR} \`xp:${reward.xp.toLocaleString()}\``;

        // 5. محاولة توليد الصورة
        if (canAttachFiles) {
            try {
                let attachment;
                if (questType === 'achievement') {
                    attachment = await client.generateSingleAchievementAlert(member, quest);
                } else {
                    const typeForAlert = questType === 'weekly' ? 'rare' : 'daily';
                    attachment = await client.generateQuestAlert(member, quest, typeForAlert);
                }
                if (attachment) files.push(attachment);
            } catch (imgErr) { 
                console.error("[Image Gen Error]", imgErr);
                attachmentError = true; 
            }
        }

        // 6. بناء الرسالة النصية
        if (questType === 'achievement') {
            message = [
                `╭⭒★︰ ${client.EMOJI_WI} ${userIdentifier} ${client.EMOJI_WII}`,
                `✶ انـرت سمـاء الامـبراطـوريـة بإنجـازك ${client.EMOJI_FASTER}`,
                `✥ انـجـاز: **${questName}**`,
                ``,
                `- فـالتسـجل امبراطوريتـنـا اسمـك بيـن العضـمـاء ${client.EMOJI_PRAY}`,
                (attachmentError || !canAttachFiles || files.length === 0) ? `\n🎁 **الـجائـزة:** ${rewardText}` : '' 
            ].join('\n');
        } else {
            const typeText = questType === 'daily' ? 'يوميـة' : 'اسبوعيـة';
            message = [
                `╭⭒★︰ ${client.EMOJI_WI} ${userIdentifier} ${client.EMOJI_WII}`,
                `✶ اتـممـت مهمـة ${typeText}`,
                `✥ الـمهـمـة: **${questName}**`,
                ``,
                `- لقـد أثبـت انـك احـد ارـكـان الامبراطـورية ${client.EMOJI_PRAY}`,
                `- لا يُكلـف مثـلك الا بالمستحيـل ${client.EMOJI_COOL} ~`,
                ``,
                (attachmentError || !canAttachFiles || files.length === 0) ? `\n🎁 **الـجائـزة:** ${rewardText}` : ''
            ].join('\n');
        }

        // 7. الإرسال
        await channel.send({ 
            content: message, 
            files: files, 
            allowedMentions: { users: sendMention ? [member.id] : [] } 
        });

    } catch (err) { console.error("Error sending quest announcement:", err.message); }
}

// 4. التحقق من إنجاز المهام (يومية/أسبوعية)
client.checkQuests = async function(client, member, stats, questType, dateKey) {
    const questsToCheck = questsConfig[questType] || [];
    for (const quest of questsToCheck) {
        const currentProgress = stats[quest.stat] || 0;
        
        if (currentProgress >= quest.goal) {
            // منع التكرار
            const claimID = `${member.id}-${member.guild.id}-${quest.id}-${dateKey}`;
            const existingClaim = sql.prepare("SELECT * FROM user_quest_claims WHERE claimID = ?").get(claimID);
            
            if (!existingClaim) {
                // تسجيل الإنجاز
                sql.prepare("INSERT INTO user_quest_claims (claimID, userID, guildID, questID, dateStr) VALUES (?, ?, ?, ?, ?)").run(claimID, member.id, member.guild.id, quest.id, dateKey);
                
                // إعطاء الجوائز
                let levelData = client.getLevel.get(member.id, member.guild.id);
                if (!levelData) levelData = { ...client.defaultData, user: member.id, guild: member.guild.id };
                
                levelData.mora = (levelData.mora || 0) + quest.reward.mora;
                levelData.xp += quest.reward.xp;
                levelData.totalXP += quest.reward.xp;
                
                // التحقق من اللفل أب
                const nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                if (levelData.xp >= nextXP) {
                    const oldLevel = levelData.level;
                    levelData.xp -= nextXP;
                    levelData.level += 1;
                    const newLevel = levelData.level;
                    // استدعاء دالة اللفل أب المحلية (أو عبر messageCreate)
                   // (ملاحظة: الـ messageCreate يتعامل مع اللفل أب عادة، لكن هنا نحدث البيانات فقط)
                }
                
                client.setLevel.run(levelData);
                // إرسال التنبيه
                await client.sendQuestAnnouncement(member.guild, member, quest, questType);
            }
        }
    }
}

// 5. التحقق من الإنجازات (Achievements)
client.checkAchievements = async function(client, member, levelData, totalStatsData) {
    for (const ach of questsConfig.achievements) {
        let currentProgress = 0;
        const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.id, member.guild.id);
        const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
        
        if (!totalStatsData) totalStatsData = client.getTotalStats.get(`${member.id}-${member.guild.id}`) || {};
        totalStatsData = safeMerge(totalStatsData, defaultTotalStats); 

        // تحديد مصدر البيانات بناءً على نوع الإحصائية
        if (levelData && levelData.hasOwnProperty(ach.stat)) currentProgress = levelData[ach.stat];
        else if (totalStatsData && totalStatsData.hasOwnProperty(ach.stat)) currentProgress = totalStatsData[ach.stat];
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
                
                // فحص اللفل
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

// 6. تحديث الإحصائيات (Quest Stats Increment)
// يستخدم للـ Bumps و Voice و Meow
client.incrementQuestStats = async function(userID, guildID, stat, amount = 1) {
    if (stat === 'messages') {
        // تتبع الرسائل يتم عبر trackMessageStats في messageCreate
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

        dailyStats = safeMerge(dailyStats, defaultDailyStats);
        weeklyStats = safeMerge(weeklyStats, defaultDailyStats);
        totalStats = safeMerge(totalStats, defaultTotalStats);

        if (dailyStats.hasOwnProperty(stat)) dailyStats[stat] = (dailyStats[stat] || 0) + amount;
        if (weeklyStats.hasOwnProperty(stat)) weeklyStats[stat] = (weeklyStats[stat] || 0) + amount;
        
        if (stat === 'disboard_bumps') totalStats.total_disboard_bumps = (totalStats.total_disboard_bumps || 0) + amount;
        
        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
        client.setTotalStats.run(totalStats);

        const member = client.guilds.cache.get(guildID)?.members.cache.get(userID);
        if (member) {
            await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
            await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
            if (stat === 'disboard_bumps') await client.checkAchievements(client, member, null, totalStats);
            // للمياو أيضاً، قد يكون هناك إنجازات مرتبطة بالتكرار الكلي مستقبلاً
            if (stat === 'meow_count') {
                 let levelData = client.getLevel.get(userID, guildID);
                 if (levelData) await client.checkAchievements(client, member, levelData, totalStats);
            }
        }
    } catch (err) { console.error(`[IncrementQuestStats] Error:`, err.message); }
}

// 7. التحقق من إنجازات الرتب
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

// --- عند تشغيل البوت (Ready Event) ---
client.on(Events.ClientReady, async () => { 
    console.log(`✅ Logged in as ${client.user.username} (Corrected Mode)`);
    
    // تجهيز أوامر SQL
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

    console.log("[System] Starting background tasks...");
    
    const calculateInterest = () => {};
    calculateInterest();
    setInterval(calculateInterest, 60 * 60 * 1000);

    const checkLoanPayments = async () => {};
    checkLoanPayments();
    setInterval(checkLoanPayments, 60 * 60 * 1000);

    function updateMarketPrices() {
        try {
            const allItems = sql.prepare("SELECT * FROM market_items").all();
            if (allItems.length === 0) return;
            const updateStmt = sql.prepare(`UPDATE market_items SET currentPrice = ?, lastChangePercent = ?, lastChange = ? WHERE id = ?`);
            const transaction = sql.transaction(() => {
                for (const item of allItems) {
                    const minChange = -0.05; const maxChange = 0.10; 
                    const changePercent = Math.random() * (maxChange - minChange) + minChange;
                    const oldPrice = item.currentPrice;
                    let newPrice = Math.max(10, Math.floor(oldPrice * (1 + changePercent))); 
                    const changeAmount = newPrice - oldPrice;
                    updateStmt.run(newPrice, (changePercent * 100).toFixed(2), changeAmount, item.id);
                }
            });
            transaction();
        } catch (err) { console.error("[Market] Error:", err.message); }
    }
    updateMarketPrices();
    setInterval(updateMarketPrices, 60 * 60 * 1000);

    const STAT_TICK_RATE = 60000; 
    const MINUTES_PER_TICK = 1; 
    const SECONDS_PER_TICK = 60; 
    
    // نظام Voice XP وتتبع الوقت الصوتي
    setInterval(() => {
        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString(); 
        client.guilds.cache.forEach(guild => {
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
            if (!settings) return;
            const giveVoiceXP = settings.voiceXP > 0 && settings.voiceCooldown > 0;
            const voiceXP = settings.voiceXP || 0;
            const voiceCooldown = settings.voiceCooldown || 60000;
            guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).forEach(channel => {
                channel.members.forEach(async (member) => {
                    if (member.user.bot || member.voice.channelID === guild.afkChannelId) return;
                    const dailyStatsId = `${member.id}-${guild.id}-${dateStr}`;
                    const weeklyStatsId = `${member.id}-${guild.id}-${weekStartDateStr}`;
                    const totalStatsId = `${member.id}-${guild.id}`;
                    let level = client.getLevel.get(member.id, guild.id);
                    if (!level) { level = { ...client.defaultData, user: member.id, guild: guild.id }; }
                    
                    let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID: member.id, guildID: guild.id, date: dateStr };
                    let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID: member.id, guildID: guild.id, weekStartDate: weekStartDateStr };
                    let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: member.id, guildID: guild.id };

                    dailyStats = safeMerge(dailyStats, defaultDailyStats);
                    weeklyStats = safeMerge(weeklyStats, defaultDailyStats);
                    totalStats = safeMerge(totalStats, defaultTotalStats);

                    let statsChanged = false;
                    if (!member.voice.selfMute && !member.voice.selfDeaf) {
                        dailyStats.vc_minutes += MINUTES_PER_TICK;
                        weeklyStats.vc_minutes += MINUTES_PER_TICK;
                        totalStats.total_vc_minutes += MINUTES_PER_TICK;
                        level.totalVCTime += SECONDS_PER_TICK; 
                        statsChanged = true;
                    }
                    if (member.voice.streaming) {
                        dailyStats.streaming_minutes += MINUTES_PER_TICK;
                        weeklyStats.streaming_minutes += MINUTES_PER_TICK;
                        statsChanged = true;
                    }
                    if (giveVoiceXP && !member.voice.selfMMute && !member.voice.selfDeaf) {
                        const cooldownKey = `${guild.id}-${member.id}`;
                        const now = Date.now();
                        const lastGain = voiceXPCooldowns.get(cooldownKey);
                        if (!lastGain || (now - lastGain) >= voiceCooldown) {
                            const baseXP = voiceXP;
                            const buffMultiplier = calculateBuffMultiplier(member, sql);
                            const finalXP = Math.floor(baseXP * buffMultiplier);
                            level.xp += finalXP;
                            level.totalXP += finalXP;
                            statsChanged = true;
                            voiceXPCooldowns.set(cooldownKey, now);
                        }
                    }
                    if (statsChanged) {
                        const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
                        if (level.xp >= nextXP) {
                            const oldLevel = level.level;
                            level.xp -= nextXP;
                            level.level += 1;
                            const newLevel = level.level;
                            // لاحظ: هنا لا نستدعي sendLevelUpMessage مباشرة لأنها قد تكون مكلفة في اللوب
                            // لكن إذا أردت تفعيلها للصوت أيضاً، يمكنك ذلك
                        }
                    }
                    if (statsChanged) {
                        client.setDailyStats.run(dailyStats);
                        client.setWeeklyStats.run(weeklyStats);
                        client.setTotalStats.run(totalStats);
                        client.setLevel.run(level); 
                        await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
                        await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
                        await client.checkAchievements(client, member, level, totalStats);
                    }
                });
            });
        });
    }, STAT_TICK_RATE); 

    checkDailyStreaks(client, sql);
    setInterval(() => checkDailyStreaks(client, sql), 3600000); 

    checkDailyMediaStreaks(client, sql);
    setInterval(() => checkDailyMediaStreaks(client, sql), 3600000); 

    checkUnjailTask(client); 
    setInterval(() => checkUnjailTask(client), 5 * 60 * 1000); 

    let lastReminderSentHour = -1;
    let lastUpdateSentHour = -1;
    let lastWarningSentHour = -1; 

    // تذكيرات الستريك وتحديث الميديا
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

    // نظام الهدايا العشوائية
    const lastRandomGiveawayDate = new Map();
    setInterval(async () => {
        const today = new Date().toISOString().split('T')[0];
        const now = Date.now(); 
        for (const guild of client.guilds.cache.values()) {
            const guildID = guild.id;
            if (lastRandomGiveawayDate.get(guildID) === today) continue; 
            const guildTimestamps = client.recentMessageTimestamps.get(guildID) || [];
            while (guildTimestamps.length > 0 && guildTimestamps[0] < (now - RECENT_MESSAGE_WINDOW)) { guildTimestamps.shift(); }
            const totalMessagesLast2Hours = guildTimestamps.length;
            if (totalMessagesLast2Hours < 200) continue; 
            const roll = Math.random();
            if (roll < 0.10) { 
                try {
                    const success = await createRandomDropGiveaway(client, guild);
                    if (success) {
                        lastRandomGiveawayDate.set(guildID, today);
                        console.log(`[DropGA] Success: ${guild.name}`);
                    }
                } catch (err) { console.error(`[DropGA] Error:`, err.message); }
            }
        }
    }, 30 * 60 * 1000); 
    sendDailyMediaUpdate(client, sql);
}); 



// 8. تحميل الأوامر
function loadCommands(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            loadCommands(fullPath);
        } else if (file.endsWith('.js')) {
            try {
                const command = require(fullPath);
                const commandName = command.data ? command.data.name : command.name;
                if (commandName && 'execute' in command) {
                    client.commands.set(commandName, command);
                } else { console.warn(`[CMD Warn] Skipped: ${file}`); }
            } catch (error) { console.error(`[CMD Error] ${file}:`, error); }
        }
    }
}
loadCommands(path.join(__dirname, 'commands'));
console.log("[System] Commands Loaded.");

// 9. تحميل المعالج التفاعلي والأحداث
require('./interaction-handler.js')(client, sql);

const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
for (const file of eventFiles) {
    const filePath = path.join(eventsPath, file);
    const event = require(filePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}
console.log("[System] Events Loaded.");

// 10. تسجيل الدخول
client.login(botToken);
