const { Events, PermissionsBitField, ChannelType } = require("discord.js");
const { handleStreakMessage, calculateBuffMultiplier, handleMediaStreakMessage } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");

// --- الثوابت ---
const DISBOARD_BOT_ID = '302050872383242240'; 

// --- القوالب الافتراضية ---
const completeDefaultLevelData = {
    xp: 0, level: 1, totalXP: 0, mora: 0,
    lastWork: 0, lastDaily: 0, dailyStreak: 0, 
    bank: 0, lastInterest: 0, totalInterestEarned: 0, 
    hasGuard: 0, guardExpires: 0, lastCollected: 0, 
    totalVCTime: 0, lastRob: 0, lastGuess: 0, 
    lastRPS: 0, lastRoulette: 0, lastTransfer: 0, 
    lastDeposit: 0, shop_purchases: 0, total_meow_count: 0, 
    boost_count: 0, lastPVP: 0
};

const defaultDailyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultWeeklyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }

function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

function safeMerge(base, defaults) {
    const result = { ...base };
    for (const key in defaults) {
        if (result[key] === undefined || result[key] === null) result[key] = defaults[key];
    }
    return result;
}

async function trackMessageStats(message, client) {
    const sql = client.sql;
    try {
        const guildID = message.guild.id;
        const authorID = message.author.id;
        const dateStr = getTodayDateString(); 
        const weekStartDateStr = getWeekStartDateString(); 

        const dailyStatsId = `${authorID}-${guildID}-${dateStr}`;
        const weeklyStatsId = `${authorID}-${guildID}-${weekStartDateStr}`;
        const totalStatsId = `${authorID}-${guildID}`;

        let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID: authorID, guildID: guildID, date: dateStr };
        let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr };
        let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: authorID, guildID: guildID };

        dailyStats = safeMerge(dailyStats, defaultDailyStats);
        weeklyStats = safeMerge(weeklyStats, defaultWeeklyStats);
        totalStats = safeMerge(totalStats, defaultTotalStats);

        // --- الرسائل ---
        dailyStats.messages++;
        weeklyStats.messages++; 
        totalStats.total_messages++;

        // --- المرفقات والصور ---
        if (message.attachments.size > 0) {
            dailyStats.images++; 
            weeklyStats.images++; 
            totalStats.total_images++;
        }
        
        // --- الستيكرات ---
        if (message.stickers.size > 0) {
            dailyStats.stickers++; 
            weeklyStats.stickers++; 
            totalStats.total_stickers++;
        }
        
        // --- الردود ---
        if (message.reference) { 
            dailyStats.replies_sent++; 
            weeklyStats.replies_sent++; 
            totalStats.total_replies_sent++;
        }

        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
        
        // ⚠️⚠️⚠️ التصحيح الأهم هنا: تمرير كائن يحتوي على المفاتيح الصحيحة التي ينتظرها أمر SQL ⚠️⚠️⚠️
        client.setTotalStats.run({
            id: totalStatsId,
            userID: authorID,
            guildID: guildID,
            total_messages: totalStats.total_messages,
            total_images: totalStats.total_images,
            total_stickers: totalStats.total_stickers,
            total_reactions_added: totalStats.total_reactions_added,
            replies_sent: totalStats.total_replies_sent, // هنا يتم تمرير القيمة للمتغير @replies_sent في الـ prepared statement
            mentions_received: totalStats.total_mentions_received,
            total_vc_minutes: totalStats.total_vc_minutes,
            total_disboard_bumps: totalStats.total_disboard_bumps
        });

        if (client.checkQuests) {
            await client.checkQuests(client, message.member, dailyStats, 'daily', dateStr);
            await client.checkQuests(client, message.member, weeklyStats, 'weekly', weekStartDateStr);
            await client.checkAchievements(client, message.member, null, totalStats);
        }

        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(async (mentionedUser) => {
                if (mentionedUser.bot || mentionedUser.id === authorID) return;

                const m_dailyId = `${mentionedUser.id}-${guildID}-${dateStr}`;
                const m_weeklyId = `${mentionedUser.id}-${guildID}-${weekStartDateStr}`;
                const m_totalId = `${mentionedUser.id}-${guildID}`;

                let m_daily = client.getDailyStats.get(m_dailyId) || { id: m_dailyId, userID: mentionedUser.id, guildID: guildID, date: dateStr };
                let m_weekly = client.getWeeklyStats.get(m_weeklyId) || { id: m_weeklyId, userID: mentionedUser.id, guildID: guildID, weekStartDate: weekStartDateStr };
                let m_total = client.getTotalStats.get(m_totalId) || { id: m_totalId, userID: mentionedUser.id, guildID: guildID };

                m_daily = safeMerge(m_daily, defaultDailyStats);
                m_weekly = safeMerge(m_weekly, defaultWeeklyStats);
                m_total = safeMerge(m_total, defaultTotalStats);

                m_daily.mentions_received++;
                m_weekly.mentions_received++;
                m_total.total_mentions_received++;

                client.setDailyStats.run(m_daily);
                client.setWeeklyStats.run(m_weekly);
                
                client.setTotalStats.run({
                    id: m_totalId,
                    userID: mentionedUser.id,
                    guildID: guildID,
                    total_messages: m_total.total_messages,
                    total_images: m_total.total_images,
                    total_stickers: m_total.total_stickers,
                    total_reactions_added: m_total.total_reactions_added,
                    replies_sent: m_total.total_replies_sent,
                    mentions_received: m_total.total_mentions_received,
                    total_vc_minutes: m_total.total_vc_minutes,
                    total_disboard_bumps: m_total.total_disboard_bumps
                });

                const mentionedMember = message.guild.members.cache.get(mentionedUser.id);
                if (mentionedMember && client.checkQuests) {
                    await client.checkQuests(client, mentionedMember, m_daily, 'daily', dateStr);
                    await client.checkQuests(client, mentionedMember, m_weekly, 'weekly', weekStartDateStr);
                    await client.checkAchievements(client, mentionedMember, null, m_total);
                }
            });
        }
    } catch (err) { console.error("Error in trackMessageStats:", err); }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        if (message.author.bot) {
            let settings;
            try { settings = sql.prepare("SELECT bumpChannelID FROM settings WHERE guild = ?").get(message.guild.id); } catch (err) { settings = null; }
            const BUMP_CHANNEL_ID = settings ? settings.bumpChannelID : null;

            if (message.author.id === DISBOARD_BOT_ID && BUMP_CHANNEL_ID && message.channel.id === BUMP_CHANNEL_ID) {
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    const embedDesc = message.embeds[0].description;
                    if (embedDesc.includes('Bump done!') || embedDesc.includes('Bump successful')) {
                        const match = embedDesc.match(/<@!?(\d+)>/);
                        if (!match || !match[1]) return;
                        const userID = match[1];
                        try {
                            const member = await message.guild.members.fetch(userID);
                            if (member && client.incrementQuestStats) await client.incrementQuestStats(userID, message.guild.id, 'disboard_bumps');
                        } catch (err) { console.error("[Disboard Bump Error]", err); }
                    }
                }
            }
            return; 
        }

        if (!message.guild) return; 

        let settings;
        try { settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id); } catch (err) { settings = null; }
        let reportSettings;
        try { reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id); } catch(e) { reportSettings = null; }

        try {
            const tableCheck = sql.prepare("SELECT count(*) FROM sqlite_master WHERE type='table' AND name='command_shortcuts';").get();
            if (tableCheck['count(*)'] > 0) {
                const argsRaw = message.content.trim().split(/ +/);
                const shortcutWord = argsRaw[0].toLowerCase();
                const shortcutArgs = argsRaw.slice(1);
                const shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?").get(message.guild.id, message.channel.id, shortcutWord);

                if (shortcut) {
                    const command = client.commands.get(shortcut.commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(shortcut.commandName));
                    if (command) {
                        if (!checkPermissions(message, command)) return;
                        const cooldownMessage = checkCooldown(message, command);
                        if (cooldownMessage) {
                            if (typeof cooldownMessage === 'string' && cooldownMessage.length > 0) return message.reply(cooldownMessage);
                            return;
                        }
                        try { await command.execute(message, shortcutArgs); } 
                        catch (error) { console.error(error); message.reply("حدث خطأ أثناء تنفيذ الاختصار."); }
                        return; 
                    }
                }
            }
        } catch (err) {}

        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            if (command && command.category === "Economy") {
                if (!checkPermissions(message, command)) return;
                try { command.execute(message, args); } catch (error) { console.error(error); }
                return;
            }
        }
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            const command = client.commands.get('بلاغ');
            const args = message.content.trim().split(/ +/);
            if (command && args[0].toLowerCase() !== 'بلاغ') {
                 try { command.execute(message, args); } catch (error) { console.error(error); }
                return;
            }
        }

        let Prefix = "-";
        try {
            const prefixRow = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id);
            if (prefixRow && prefixRow.serverprefix) Prefix = prefixRow.serverprefix;
        } catch(e) {}

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

            if (command) {
                args.prefix = Prefix;
                let isAllowed = false;
                if (message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) isAllowed = true;
                else {
                    try {
                        const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.id);
                        const categoryPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.parentId);
                        if (channelPerm || categoryPerm) isAllowed = true;
                        else {
                           const hasRestrictions = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ?").get(message.guild.id, command.name);
                           if (!hasRestrictions) isAllowed = true;
                        }
                    } catch (err) { isAllowed = true; }
                }

                if (isAllowed) {
                    if (!checkPermissions(message, command)) return;
                    const cooldownMessage = checkCooldown(message, command);
                    if (cooldownMessage) {
                        if (typeof cooldownMessage === 'string' && cooldownMessage.length > 0) return message.reply(cooldownMessage);
                        return;
                    }
                    try { command.execute(message, args); } catch (error) { console.error(error); message.reply("Error!"); }
                }
                return;
            }
        }

        try {
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;
        } catch (err) {}

        try {
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                setTimeout(async () => {
                    try {
                        const fetchedMsg = await message.channel.messages.fetch(message.id);
                        if (fetchedMsg && client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'counting_channel');
                    } catch (err) {}
                }, 5000);
            }
            if (message.content.toLowerCase().includes('مياو')) {
                if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count');
            }
        } catch (err) { console.error("[Quest Message Tracker Error]", err); }

        try {
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel) {
                const hasMedia = message.attachments.size > 0 || message.embeds.some(e => e.image || e.video);
                if (hasMedia) {
                    await handleMediaStreakMessage(message);
                    return; 
                }
            }
        } catch (err) {}

        try { await handleStreakMessage(message); } catch (err) {}
        try { await trackMessageStats(message, client); } catch (err) {}

        try {
            let level = client.getLevel.get(message.author.id, message.guild.id);
            if (!level) level = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
            
            let customSettings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
            let getXpfromDB = customSettings?.customXP || 25;
            let getCooldownfromDB = customSettings?.customCooldown || 60000;

            if (client.talkedRecently.get(message.author.id)) return;
            else {
                const generatedXp_base = Math.floor(Math.random() * (getXpfromDB - 1 + 1)) + 1;
                const buffMultiplier = calculateBuffMultiplier(message.member, sql);
                const finalXP = Math.floor(generatedXp_base * buffMultiplier);
                
                level.xp += finalXP;
                level.totalXP += finalXP;
                
                const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
                if (level.xp >= nextXP) {
                    const oldLevel = level.level;
                    level.xp -= nextXP;
                    level.level += 1;
                    const newLevel = level.level;
                    
                    await client.sendLevelUpMessage(message, message.member, newLevel, oldLevel, level);
                }
                client.setLevel.run(level);
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }

            try {
                let Roles = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND level = ?").get(message.guild.id, level.level);
                if (Roles && message.member && !message.member.roles.cache.has(Roles.roleID)) {
                    message.member.roles.add(Roles.roleID).catch(e => {});
                }
            } catch (e) {}

        } catch (err) { console.error("[XP Error]", err); }
    },
};
