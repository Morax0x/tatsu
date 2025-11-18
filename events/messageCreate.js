const { Events, PermissionsBitField, MessageFlags } = require("discord.js");
const { handleStreakMessage, calculateBuffMultiplier, handleMediaStreakMessage } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");

const DISBOARD_BOT_ID = '302050872383242240';

// --- دوال المساعدة ---
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

// --- قوالب البيانات الكاملة (لمنع نقص البيانات) ---
const defaultDailyStats = {
    messages: 0, images: 0, stickers: 0, reactions_added: 0,
    replies_sent: 0, mentions_received: 0, // 👈 الأعمدة الجديدة
    vc_minutes: 0, water_tree: 0, counting_channel: 0,
    meow_count: 0, streaming_minutes: 0, disboard_bumps: 0
};

const defaultTotalStats = {
    total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0,
    total_replies_sent: 0, total_mentions_received: 0, // 👈 الأعمدة الجديدة
    total_vc_minutes: 0, total_disboard_bumps: 0
};

// دالة لدمج البيانات القديمة مع القوالب الجديدة لضمان عدم نقص أي مفتاح
function safeMerge(base, defaults) {
    const result = { ...base };
    for (const key in defaults) {
        if (result[key] === undefined) {
            result[key] = defaults[key];
        }
    }
    return result;
}

// --- دالة تتبع الإحصائيات ---
async function trackMessageStats(message, client) {
    try {
        const guildID = message.guild.id;
        const authorID = message.author.id;
        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString();

        const dailyStatsId = `${authorID}-${guildID}-${dateStr}`;
        const weeklyStatsId = `${authorID}-${guildID}-${weekStartDateStr}`;
        const totalStatsId = `${authorID}-${guildID}`;

        // 1. جلب البيانات أو إنشاء أساس
        let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID: authorID, guildID: guildID, date: dateStr };
        let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr };
        let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: authorID, guildID: guildID };

        // 2. 🌟 الدمج الآمن (يملأ أي فراغات بالصفر) 🌟
        dailyStats = safeMerge(dailyStats, defaultDailyStats);
        weeklyStats = safeMerge(weeklyStats, defaultDailyStats); // الأسبوعي نفس هيكل اليومي
        totalStats = safeMerge(totalStats, defaultTotalStats);

        // 3. التحديث
        dailyStats.messages++;
        weeklyStats.messages++;
        totalStats.total_messages++;

        if (message.attachments.size > 0) {
            dailyStats.images++;
            weeklyStats.images++;
            totalStats.total_images++;
        }
        if (message.stickers.size > 0) {
            dailyStats.stickers++;
            weeklyStats.stickers++;
            totalStats.total_stickers++;
        }
        if (message.reference) {
            dailyStats.replies_sent++;
            weeklyStats.replies_sent++;
            totalStats.total_replies_sent++;
        }

        // 4. الحفظ (الآن مضمون 100% أن الكائن يحتوي على replies_sent)
        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
        client.setTotalStats.run(totalStats);

        await client.checkQuests(client, message.member, dailyStats, 'daily', dateStr);
        await client.checkQuests(client, message.member, weeklyStats, 'weekly', weekStartDateStr);
        await client.checkAchievements(client, message.member, null, totalStats);

        // 5. معالجة المنشن
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(async (mentionedUser) => {
                if (mentionedUser.bot || mentionedUser.id === authorID) return;

                const m_dailyId = `${mentionedUser.id}-${guildID}-${dateStr}`;
                const m_weeklyId = `${mentionedUser.id}-${guildID}-${weekStartDateStr}`;
                const m_totalId = `${mentionedUser.id}-${guildID}`;

                let m_daily = client.getDailyStats.get(m_dailyId) || { id: m_dailyId, userID: mentionedUser.id, guildID: guildID, date: dateStr };
                let m_weekly = client.getWeeklyStats.get(m_weeklyId) || { id: m_weeklyId, userID: mentionedUser.id, guildID: guildID, weekStartDate: weekStartDateStr };
                let m_total = client.getTotalStats.get(m_totalId) || { id: m_totalId, userID: mentionedUser.id, guildID: guildID };

                // الدمج الآمن للمنشن أيضاً
                m_daily = safeMerge(m_daily, defaultDailyStats);
                m_weekly = safeMerge(m_weekly, defaultDailyStats);
                m_total = safeMerge(m_total, defaultTotalStats);

                m_daily.mentions_received++;
                m_weekly.mentions_received++;
                m_total.total_mentions_received++;

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
    xp: 0, level: 1, totalXP: 0, mora: 0,
    lastWork: 0, lastDaily: 0, dailyStreak: 0, bank: 0, lastInterest: 0,
    totalInterestEarned: 0, hasGuard: 0, guardExpires: 0, lastCollected: 0,
    totalVCTime: 0, lastRob: 0, lastGuess: 0, lastRPS: 0, lastRoulette: 0,
    lastTransfer: 0, lastDeposit: 0, shop_purchases: 0, total_meow_count: 0,
    boost_count: 0, lastPVP: 0
};

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // --- 1. نظام الاختصارات (الأولوية القصوى - بدون بريفكس) ---
        if (!message.author.bot && message.guild) {
            try {
                const argsRaw = message.content.trim().split(/ +/);
                const shortcutWord = argsRaw[0].toLowerCase();
                const shortcutArgs = argsRaw.slice(1);

                // البحث عن الاختصار في قاعدة البيانات
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
                            await command.execute(message, shortcutArgs);
                            console.log(`[Shortcut] Executed ${command.name} via "${shortcutWord}"`);
                        } catch (error) {
                            console.error(error);
                        }
                        return; // 🛑 توقف هنا، لا تكمل باقي الكود
                    }
                }
            } catch (err) { /* تجاهل */ }
        }


        // --- 2. التعامل مع البوتات (ديسبورد فقط) ---
        if (message.author.bot) {
            if (message.author.id === DISBOARD_BOT_ID) {
                // (نفس كود البومب السابق)
                let settings;
                try { settings = sql.prepare("SELECT bumpChannelID FROM settings WHERE guild = ?").get(message.guild.id); } catch (e) { settings = null; }
                if (settings && settings.bumpChannelID && message.channel.id === settings.bumpChannelID) {
                    if (message.embeds.length > 0 && message.embeds[0].description && (message.embeds[0].description.includes('Bump done!') || message.embeds[0].description.includes('Bump successful'))) {
                        const match = message.embeds[0].description.match(/<@!?(\d+)>/);
                        if (match && match[1]) {
                            try {
                                const userID = match[1];
                                await client.incrementQuestStats(userID, message.guild.id, 'disboard_bumps');
                                // تحديث التوتال
                                const totalStatsId = `${userID}-${message.guild.id}`;
                                let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID, guildID: message.guild.id };
                                totalStats = safeMerge(totalStats, defaultTotalStats); // دمج آمن
                                totalStats.total_disboard_bumps++;
                                client.setTotalStats.run(totalStats);
                            } catch (e) {}
                        }
                    }
                }
            }
            return; // تجاهل باقي البوتات
        }

        if (!message.guild) return;

        // --- 3. إعدادات السيرفر ---
        let settings;
        try { settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id); } catch (err) { settings = null; }
        
        // معالج قناة الكازينو
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
                try { command.execute(message, args); } catch (e) { console.error(e); }
                return;
            }
        }

        // معالج البريفكس
        let Prefix = "-";
        let prefixRow;
        try { prefixRow = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id); } catch(e){}
        if (prefixRow && prefixRow.serverprefix) Prefix = prefixRow.serverprefix;

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            
            if (command) {
                let isAllowed = false;
                if (message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) isAllowed = true;
                else {
                    try {
                        const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.id);
                        const categoryPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.parentId);
                        if (channelPerm || categoryPerm) isAllowed = true;
                    } catch (e) {}
                }

                if (isAllowed) {
                    if (!checkPermissions(message, command)) return;
                    const cooldownMessage = checkCooldown(message, command);
                    if (cooldownMessage) {
                        if (typeof cooldownMessage === 'string') return message.reply(cooldownMessage);
                        return;
                    }
                    try { await command.execute(message, args); } catch (e) { console.error(e); }
                    return;
                }
            }
        }

        // --- 4. الأنظمة التلقائية (ستريك، XP، مهام) ---

        // مهام خاصة (مياو، عد)
        try {
             if (message.content.toLowerCase().includes('مياو')) {
                await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count');
                let levelData = client.getLevel.get(message.author.id, message.guild.id) || { ...client.defaultData, ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
                levelData.total_meow_count = (levelData.total_meow_count || 0) + 1;
                client.setLevel.run(levelData);
                await client.checkAchievements(client, message.member, levelData, null);
             }
             if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                 // ... (كود العد كما هو)
             }
        } catch (e) {}

        // ستريك الميديا
        try {
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel && (message.attachments.size > 0 || message.embeds.some(e => e.image || e.video))) {
                await handleMediaStreakMessage(message);
                return;
            }
        } catch (e) {}

        // ستريك يومي
        try { await handleStreakMessage(message); } catch (e) {}

        // تتبع الإحصائيات (الذي تم إصلاحه)
        try { await trackMessageStats(message, client); } catch (e) { console.error(e); }

        // نظام XP
        let level = client.getLevel.get(message.author.id, message.guild.id);
        if (!level) level = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };

        let getXpfromDB = settings?.customXP || 25;
        let getCooldownfromDB = settings?.customCooldown || 60000;

        if (!client.talkedRecently.get(message.author.id)) {
            const buffMultiplier = calculateBuffMultiplier(message.member, sql);
            const finalXP = Math.floor((Math.floor(Math.random() * getXpfromDB) + 1) * buffMultiplier);
            
            level.xp += finalXP;
            level.totalXP += finalXP;
            
            const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
            if (level.xp >= nextXP) {
                const oldLevel = level.level;
                level.xp -= nextXP;
                level.level += 1;
                await client.sendLevelUpMessage(message, message.member, level.level, oldLevel, level);
                await client.checkAchievements(client, message.member, level, null);
            }
            client.setLevel.run(level);
            
            client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
            setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
        }

        // رولات اللفل
        try {
            let roles = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND level = ?").get(message.guild.id, level.level);
            if (roles && !message.member.roles.cache.has(roles.roleID)) {
                 if (message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                     message.member.roles.add(roles.roleID);
                 }
            }
        } catch(e) {}
    },
};
