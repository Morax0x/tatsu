const { Events, PermissionsBitField, MessageFlags } = require("discord.js");
const { handleStreakMessage, calculateBuffMultiplier, handleMediaStreakMessage } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");

const DISBOARD_BOT_ID = '302050872383242240'; 

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getWeekStartDateString() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); 
    const diff = now.getUTCDate() - (dayOfWeek + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

// --- (دالة تتبع الإحصائيات - تم إصلاح خطأ RangeError) ---
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

        // 1. جلب البيانات
        let dailyStats = client.getDailyStats.get(dailyStatsId);
        let weeklyStats = client.getWeeklyStats.get(weeklyStatsId);
        let totalStats = client.getTotalStats.get(totalStatsId);

        // 2. إنشاء البيانات الافتراضية إذا لم تكن موجودة
        if (!dailyStats) {
            dailyStats = { id: dailyStatsId, userID: authorID, guildID: guildID, date: dateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        }
        if (!weeklyStats) {
            weeklyStats = { id: weeklyStatsId, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        }
        if (!totalStats) {
            totalStats = { id: totalStatsId, userID: authorID, guildID: guildID, total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };
        }

        // 3. 🌟🌟🌟 التصحيح الحاسم: ملء القيم المفقودة للمستخدمين القدامى 🌟🌟🌟
        // هذا يمنع خطأ Missing named parameter
        if (dailyStats.replies_sent === undefined) dailyStats.replies_sent = 0;
        if (dailyStats.mentions_received === undefined) dailyStats.mentions_received = 0;
        if (weeklyStats.replies_sent === undefined) weeklyStats.replies_sent = 0;
        if (weeklyStats.mentions_received === undefined) weeklyStats.mentions_received = 0;
        if (totalStats.total_replies_sent === undefined) totalStats.total_replies_sent = 0;
        if (totalStats.total_mentions_received === undefined) totalStats.total_mentions_received = 0;

        // 4. التحديث
        dailyStats.messages += 1;
        weeklyStats.messages += 1;
        totalStats.total_messages += 1;

        if (message.attachments.size > 0) {
            dailyStats.images += 1;
            weeklyStats.images += 1;
            totalStats.total_images += 1;
        }
        if (message.stickers.size > 0) {
            dailyStats.stickers += 1;
            weeklyStats.stickers += 1;
            totalStats.total_stickers += 1;
        }
        if (message.reference) {
            dailyStats.replies_sent += 1;
            weeklyStats.replies_sent += 1;
            totalStats.total_replies_sent += 1;
        }

        // 5. الحفظ
        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
        client.setTotalStats.run(totalStats);

        await client.checkQuests(client, message.member, dailyStats, 'daily', dateStr);
        await client.checkQuests(client, message.member, weeklyStats, 'weekly', weekStartDateStr);
        await client.checkAchievements(client, message.member, null, totalStats);

        // 6. معالجة المنشن
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(async (mentionedUser) => {
                if (mentionedUser.bot || mentionedUser.id === authorID) return;

                const m_dailyId = `${mentionedUser.id}-${guildID}-${dateStr}`;
                const m_weeklyId = `${mentionedUser.id}-${guildID}-${weekStartDateStr}`;
                const m_totalId = `${mentionedUser.id}-${guildID}`;

                let m_daily = client.getDailyStats.get(m_dailyId) || { id: m_dailyId, userID: mentionedUser.id, guildID: guildID, date: dateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
                let m_weekly = client.getWeeklyStats.get(m_weeklyId) || { id: m_weeklyId, userID: mentionedUser.id, guildID: guildID, weekStartDate: weekStartDateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
                let m_total = client.getTotalStats.get(m_totalId) || { id: m_totalId, userID: mentionedUser.id, guildID: guildID, total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

                // تصحيح المنشن أيضاً
                if (m_daily.mentions_received === undefined) m_daily.mentions_received = 0;
                if (m_weekly.mentions_received === undefined) m_weekly.mentions_received = 0;
                if (m_total.total_mentions_received === undefined) m_total.total_mentions_received = 0;
                // (للتأكد من عدم تعطل الكود بسبب الأعمدة الأخرى)
                if (m_daily.replies_sent === undefined) m_daily.replies_sent = 0;

                m_daily.mentions_received += 1;
                m_weekly.mentions_received += 1;
                m_total.total_mentions_received += 1;

                client.setDailyStats.run(m_daily);
                client.setWeeklyStats.run(m_weekly);
                client.setTotalStats.run(m_total);

                const mentionedMember = message.guild.members.cache.get(mentionedUser.id);
                if (mentionedMember) {
                    await client.checkQuests(client, mentionedMember, m_daily, 'daily', dateStr);
                    await client.checkQuests(client, mentionedMember, m_weekly, 'weekly', weekStartDateStr);
                    await client.checkAchievements(client, mentionedMember, null, m_total);
                }
            });
        }
    } catch (err) {
        console.error("Error in trackMessageStats:", err);
    }
}

const completeDefaultLevelData = {
    xp: 0, level: 1, totalXP: 0, mora: 0, lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, lastInterest: 0, totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0, totalVCTime: 0, lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0, lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, total_meow_count: 0, boost_count: 0, lastPVP: 0
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // --- 1. التعامل مع البوتات ---
        if (message.author.bot) {
            let settings;
            try {
                settings = sql.prepare("SELECT bumpChannelID FROM settings WHERE guild = ?").get(message.guild.id);
            } catch (err) { settings = null; }
            const BUMP_CHANNEL_ID = settings ? settings.bumpChannelID : null;

            if (message.author.id === DISBOARD_BOT_ID && BUMP_CHANNEL_ID && message.channel.id === BUMP_CHANNEL_ID) {
                if (message.embeds && message.embeds.length > 0 && message.embeds[0].description) {
                    const embedDesc = message.embeds[0].description;
                    if (embedDesc.includes('Bump done!') || embedDesc.includes('Bump successful')) {
                        const match = embedDesc.match(/<@!?(\d+)>/);
                        if (!match || !match[1]) return; 
                        const userID = match[1];
                        const guildID = message.guild.id;
                        try {
                            const member = await message.guild.members.fetch(userID);
                            if (!member) return;
                            await client.incrementQuestStats(userID, guildID, 'disboard_bumps');
                            // تحديث الإحصائيات الكلية للبومب
                            const totalStatsId = `${userID}-${guildID}`;
                            let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: userID, guildID: guildID, total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };
                            totalStats.total_disboard_bumps = (totalStats.total_disboard_bumps || 0) + 1;
                            client.setTotalStats.run(totalStats);
                            const levelData = client.getLevel.get(userID, guildID);
                            await client.checkAchievements(client, member, levelData, totalStats);
                        } catch (err) {}
                    }
                }
            }
            return; 
        }

        if (!message.guild) return;

        // ====================================================
        // 🚀 نظام الاختصارات (بدون بريفكس) - الأولوية الأولى 🚀
        // ====================================================
        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase(); 
            const shortcutArgs = argsRaw.slice(1); 

            // البحث عن الاختصار
            const shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?").get(message.guild.id, message.channel.id, shortcutWord);

            if (shortcut) {
                const command = client.commands.get(shortcut.commandName);
                if (command) {
                    if (!checkPermissions(message, command)) return;
                    const cooldownMessage = checkCooldown(message, command);
                    if (cooldownMessage) {
                        if (typeof cooldownMessage === 'string') return message.reply(cooldownMessage);
                        return;
                    }
                    try {
                        // تنفيذ الأمر فوراً
                        await command.execute(message, shortcutArgs); 
                        console.log(`[Shortcut] تم تنفيذ ${command.name} عبر الاختصار "${shortcutWord}"`);
                    } catch (error) {
                        console.error(error);
                    }
                    // 🛑 توقف هنا! لا تكمل للكود الآخر (XP، ستريك، أوامر عادية)
                    return; 
                }
            }
        } catch (err) {
             // تجاهل الأخطاء البسيطة في الاختصارات
        }
        // ====================================================


        // جلب الإعدادات لباقي الكود
        let settings;
        try { settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id); } catch (err) { settings = null; }
        let reportSettings; 
        try { reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id); } catch(e) { reportSettings = null; }

        // (معالج قناة الكازينو)
        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            if (command && command.category === "Economy") {
                if (!checkPermissions(message, command)) return;
                const cooldownMessage = checkCooldown(message, command);
                if (cooldownMessage) {
                    if (typeof cooldownMessage === 'string') return message.reply(cooldownMessage);
                    return;
                }
                try { command.execute(message, args); } catch (error) { console.error(error); }
                return;
            }
        }

        // (معالج قناة البلاغات)
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get('بلاغ'); 
            if (command && (command.name === commandName || (command.aliases && command.aliases.includes(commandName)))) {
                 try {
                    const commandArgs = message.content.trim().split(/ +/).slice(1);
                    command.execute(message, commandArgs);
                } catch (error) { console.error(error); }
                return; 
            }
        }

        // (معالج الأوامر بالبريفكس العادي)
        let Prefix = "-"; 
        try {
            const prefixRow = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id);
            if (prefixRow && prefixRow.serverprefix) Prefix = prefixRow.serverprefix;
        } catch(e) { }

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            if (!command) return; // ليس أمراً، أكمل للكود التالي (XP و Streak)

            args.prefix = Prefix;

            let isAllowed = false;
            if (message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                isAllowed = true;
            } else {
                try {
                    const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.id);
                    const categoryPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.parentId);
                    if (channelPerm || categoryPerm) isAllowed = true;
                } catch (err) {}
            }
            if (!isAllowed) return;
            if (!checkPermissions(message, command)) return;
            const cooldownMessage = checkCooldown(message, command);
            if (cooldownMessage) {
                if (typeof cooldownMessage === 'string') return message.reply(cooldownMessage);
                return;
            }
            try { command.execute(message, args); } catch (error) { console.error(error); }
            return; // توقف بعد تنفيذ الأمر
        }

        // ====================================================
        // ⬇️ الكود بالأسفل ينفذ فقط للرسائل العادية (ليست أوامر) ⬇️
        // ====================================================

        // (كود البلاك ليست)
        try {
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;
        } catch (err) {}

        // (كود المهام: العد، مياو)
        try {
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                setTimeout(async () => {
                    try {
                        const fetchedMsg = await message.channel.messages.fetch(message.id);
                        if (fetchedMsg) await client.incrementQuestStats(message.author.id, message.guild.id, 'counting_channel');
                    } catch (err) {}
                }, 5000);
            }

            if (message.content.toLowerCase().includes('مياو')) {
                await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count');
                let levelData = client.getLevel.get(message.author.id, message.guild.id);
                if (!levelData) levelData = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
                levelData.total_meow_count = (levelData.total_meow_count || 0) + 1;
                client.setLevel.run(levelData);
                await client.checkAchievements(client, message.member, levelData, null);
            }
        } catch (err) {}

        // (كود ستريك الميديا)
        try {
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel) {
                const hasMedia = message.attachments.size > 0 || message.embeds.some(e => e.image || e.video);
                if (hasMedia) {
                    await handleMediaStreakMessage(message);
                    return; // ميديا ستريك فقط، لا XP ولا رسائل
                }
            }
        } catch (err) {}

        // (كود الستريك)
        try {
            await handleStreakMessage(message);
        } catch (err) {}

        // (كود تتبع الإحصائيات - الذي كان يسبب المشكلة)
        try {
            await trackMessageStats(message, client);
        } catch (err) { console.error("Error in trackMessageStats:", err); }


        // (كود الـ XP)
        let level = client.getLevel.get(message.author.id, message.guild.id);
        if (!level) level = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };

        let getXpfromDB;
        let getCooldownfromDB;

        if (!settings || !settings.customXP || !settings.customCooldown) {
            getXpfromDB = 25;
            getCooldownfromDB = 60000;
        } else {
            getXpfromDB = settings.customXP;
            getCooldownfromDB = settings.customCooldown;
        }

        const generatedXp_base = Math.floor(Math.random() * (getXpfromDB - 1 + 1)) + 1;
        const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;

        const talkedRecently = client.talkedRecently; 

        if (talkedRecently.get(message.author.id)) {
            return;
        } else {
            const buffMultiplier = calculateBuffMultiplier(message.member, sql);
            const finalXP = Math.floor(generatedXp_base * buffMultiplier);

            level.xp += finalXP;
            level.totalXP += finalXP;

            if (level.xp >= nextXP) {
                const oldLevel = level.level;
                level.xp -= nextXP;
                level.level += 1;
                const newLevel = level.level;
                await client.sendLevelUpMessage(message, message.member, newLevel, oldLevel, level);
                await client.checkAchievements(client, message.member, level, null); 
            }

            client.setLevel.run(level);
            talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
            setTimeout(() => talkedRecently.delete(message.author.id), getCooldownfromDB);
        }

        // (كود رولات اللفل)
        const lvl = level.level;
        const member = message.member;
        try {
            let Roles = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND level = ?");
            let roles = Roles.get(message.guild.id, lvl);
            if (!roles) return;
            if (lvl >= roles.level) {
                if (roles) {
                    if (member.roles.cache.has(roles.roleID)) return;
                    if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) return;
                    member.roles.add(roles.roleID);
                }
            }
        } catch (err) {}
    },
};
