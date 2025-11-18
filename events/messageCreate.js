const { Events, PermissionsBitField, ChannelType } = require("discord.js");
const { handleStreakMessage, calculateBuffMultiplier, handleMediaStreakMessage } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");

// --- الثوابت والمتغيرات ---
const DISBOARD_BOT_ID = '302050872383242240'; 

// --- كائن البيانات الافتراضية (لتجنب الأخطاء) ---
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

// --- دوال المساعدة للتواريخ ---
function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

// --- دالة تتبع الإحصائيات الشاملة ---
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

        // جلب أو إنشاء السجلات
        let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID: authorID, guildID: guildID, date: dateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: authorID, guildID: guildID, total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

        // التأكد من القيم الصفرية (Safety Check)
        if (dailyStats.replies_sent === undefined) dailyStats.replies_sent = 0;
        if (dailyStats.mentions_received === undefined) dailyStats.mentions_received = 0;
        if (weeklyStats.replies_sent === undefined) weeklyStats.replies_sent = 0;
        if (weeklyStats.mentions_received === undefined) weeklyStats.mentions_received = 0;
        if (totalStats.total_replies_sent === undefined) totalStats.total_replies_sent = 0;
        if (totalStats.total_mentions_received === undefined) totalStats.total_mentions_received = 0;

        // التحديث
        dailyStats.messages++;
        weeklyStats.messages++;
        totalStats.total_messages++;

        if (message.attachments.size > 0) {
            dailyStats.images++; weeklyStats.images++; totalStats.total_images++;
        }
        if (message.stickers.size > 0) {
            dailyStats.stickers++; weeklyStats.stickers++; totalStats.total_stickers++;
        }
        if (message.reference) {
            dailyStats.replies_sent++; weeklyStats.replies_sent++; totalStats.total_replies_sent++;
        }

        // الحفظ في القاعدة
        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
        client.setTotalStats.run(totalStats);

        // التحقق من المهام والإنجازات
        await client.checkQuests(client, message.member, dailyStats, 'daily', dateStr);
        await client.checkQuests(client, message.member, weeklyStats, 'weekly', weekStartDateStr);
        await client.checkAchievements(client, message.member, null, totalStats);

        // التعامل مع المنشن
        if (message.mentions.users.size > 0) {
            message.mentions.users.forEach(async (mentionedUser) => {
                if (mentionedUser.bot || mentionedUser.id === authorID) return;

                const m_dailyId = `${mentionedUser.id}-${guildID}-${dateStr}`;
                const m_weeklyId = `${mentionedUser.id}-${guildID}-${weekStartDateStr}`;
                const m_totalId = `${mentionedUser.id}-${guildID}`;

                let m_daily = client.getDailyStats.get(m_dailyId) || { id: m_dailyId, userID: mentionedUser.id, guildID: guildID, date: dateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
                let m_weekly = client.getWeeklyStats.get(m_weeklyId) || { id: m_weeklyId, userID: mentionedUser.id, guildID: guildID, weekStartDate: weekStartDateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
                let m_total = client.getTotalStats.get(m_totalId) || { id: m_totalId, userID: mentionedUser.id, guildID: guildID, total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

                if (m_daily.mentions_received === undefined) m_daily.mentions_received = 0;
                if (m_weekly.mentions_received === undefined) m_weekly.mentions_received = 0;
                if (m_total.total_mentions_received === undefined) m_total.total_mentions_received = 0;

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
    } catch (err) { console.error("Error in trackMessageStats:", err); }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // ====================================================
        // 1. التعامل مع البوتات (خاصة Disboard)
        // ====================================================
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
                            if (!member) return;
                            await client.incrementQuestStats(userID, message.guild.id, 'disboard_bumps');
                        } catch (err) { console.error("[Disboard Bump Error]", err); }
                    }
                }
            }
            return; // تجاهل بقية البوتات
        }

        if (!message.guild) return; // تجاهل الرسائل الخاصة

        // جلب الإعدادات العامة
        let settings;
        try { settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id); } catch (err) { settings = null; }
        
        // جلب إعدادات البلاغات
        let reportSettings;
        try { reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id); } catch(e) { reportSettings = null; }

        // ====================================================
        // 2. نظام الاختصارات (Shortcuts) - يعمل بدون بريفكس
        // ====================================================
        try {
            // فحص سريع لوجود الجدول لتجنب الأخطاء عند بدء التشغيل الأول
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
                        try {
                            await command.execute(message, shortcutArgs);
                            console.log(`[Shortcut] Executed ${command.name} via "${shortcutWord}"`);
                        } catch (error) {
                            console.error("[Shortcut Error]", error);
                            message.reply("حدث خطأ أثناء تنفيذ الاختصار!");
                        }
                        return; // إيقاف التنفيذ هنا لمنع احتساب XP أو تكرار الأوامر
                    }
                }
            }
        } catch (err) { console.error("[Shortcut System Error]", err); }

        // ====================================================
        // 3. التعامل مع القنوات الخاصة (كازينو / بلاغات)
        // ====================================================
        
        // قناة الكازينو: تقبل فقط أوامر الاقتصاد
        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            
            if (command && command.category === "Economy") {
                if (!checkPermissions(message, command)) return;
                const cooldownMessage = checkCooldown(message, command);
                if (cooldownMessage) {
                    if (typeof cooldownMessage === 'string' && cooldownMessage.length > 0) return message.reply(cooldownMessage);
                    return;
                }
                try { command.execute(message, args); } 
                catch (error) { console.error(error); message.reply("There was an error trying to execute that command!"); }
                return;
            }
            // إذا لم يكن أمر اقتصاد، يمكن تجاهله أو حذفه (حسب الرغبة)
        }

        // قناة البلاغات: تحويل أي رسالة لأمر "بلاغ"
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            const command = client.commands.get('بلاغ');
            // نتأكد أن الرسالة ليست استدعاء صريح للأمر لتجنب التكرار
            const args = message.content.trim().split(/ +/);
            const firstWord = args[0].toLowerCase();
            if (command && firstWord !== 'بلاغ' && firstWord !== '-بلاغ') {
                 try {
                    const commandArgs = message.content.trim().split(/ +/); // إرسال الرسالة كاملة كـ args
                    command.execute(message, commandArgs);
                } catch (error) { console.error("[Report Error]", error); }
                return;
            }
        }

        // ====================================================
        // 4. معالج الأوامر التقليدي (Prefix Handler)
        // ====================================================
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
                
                // التحقق من الوايت ليست للقنوات
                let isAllowed = false;
                if (message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    isAllowed = true;
                } else {
                    try {
                        const channelPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.id);
                        const categoryPerm = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ? AND channelID = ?").get(message.guild.id, command.name, message.channel.parentId);
                        if (channelPerm || categoryPerm) isAllowed = true;
                        // إذا لم يتم تعيين أذونات، فالأصل هو السماح (يمكن تغيير هذا المنطق)
                        const hasRestrictions = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ?").get(message.guild.id, command.name);
                        if (!hasRestrictions) isAllowed = true;
                    } catch (err) { console.error("[Whitelist Check Error]", err); isAllowed = true; }
                }

                if (isAllowed) {
                    if (!checkPermissions(message, command)) return;
                    const cooldownMessage = checkCooldown(message, command);
                    if (cooldownMessage) {
                        if (typeof cooldownMessage === 'string' && cooldownMessage.length > 0) return message.reply(cooldownMessage);
                        return;
                    }
                    try {
                        command.execute(message, args);
                    } catch (error) {
                        console.error(error);
                        message.reply("There was an error trying to execute that command!");
                    }
                }
                return; // إيقاف التنفيذ بعد تشغيل الأمر
            }
        }

        // ====================================================
        // 5. الأنظمة السلبية (XP, Stats, Streaks)
        // ====================================================

        // أ. التحقق من البلاك ليست
        try {
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;
        } catch (err) {}

        // ب. مهام خاصة (قناة العد، كلمة مياو)
        try {
            // قناة العد
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                setTimeout(async () => {
                    try {
                        const fetchedMsg = await message.channel.messages.fetch(message.id);
                        if (fetchedMsg) await client.incrementQuestStats(message.author.id, message.guild.id, 'counting_channel');
                    } catch (err) {}
                }, 5000);
            }
            // مياو كاونتر
            if (message.content.toLowerCase().includes('مياو')) {
                await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count');
                let levelData = client.getLevel.get(message.author.id, message.guild.id);
                if (!levelData) levelData = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
                levelData.total_meow_count = (levelData.total_meow_count || 0) + 1;
                client.setLevel.run(levelData);
                await client.checkAchievements(client, message.member, levelData, null);
            }
        } catch (err) { console.error("[Quest Message Tracker Error]", err); }

        // ج. ستريك الميديا (Media Streak)
        try {
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel) {
                const hasMedia = message.attachments.size > 0 || message.embeds.some(e => e.image || e.video) || (message.content.includes('http') && (message.content.includes('.png') || message.content.includes('.jpg') || message.content.includes('.gif') || message.content.includes('.mp4')));
                if (hasMedia) {
                    await handleMediaStreakMessage(message);
                    // في قنوات الميديا، نتوقف هنا ولا نحتسب XP شات عادي
                    return; 
                }
            }
        } catch (err) { console.error("Error checking media streak:", err); }

        // د. ستريك الشات العادي
        try {
            await handleStreakMessage(message);
        } catch (err) { console.error("Error in handleStreakMessage:", err); }

        // هـ. تتبع الإحصائيات العامة
        try {
            await trackMessageStats(message, client);
        } catch (err) { console.error("Error in trackMessageStats:", err); }

        // و. نظام اللفل (XP System)
        try {
            let level = client.getLevel.get(message.author.id, message.guild.id);
            if (!level) {
                level = { ...(client.defaultData || {}), ...completeDefaultLevelData, user: message.author.id, guild: message.guild.id };
            }
            
            const lvl = level.level;
            let getXpfromDB, getCooldownfromDB;
            let customSettings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);

            if (!customSettings || !customSettings.customXP || !customSettings.customCooldown) {
                getXpfromDB = 25;
                getCooldownfromDB = 60000;
            } else {
                getXpfromDB = customSettings.customXP;
                getCooldownfromDB = customSettings.customCooldown;
            }

            // التحقق من الكول داون الخاص بالـ XP
            if (client.talkedRecently.get(message.author.id)) {
                return;
            } else {
                const generatedXp_base = Math.floor(Math.random() * (getXpfromDB - 1 + 1)) + 1;
                const buffMultiplier = calculateBuffMultiplier(message.member, sql);
                const finalXP = Math.floor(generatedXp_base * buffMultiplier);
                const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;

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
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }

            // ز. رولات اللفل (Level Roles)
            try {
                let Roles = sql.prepare("SELECT * FROM level_roles WHERE guildID = ? AND level = ?").get(message.guild.id, lvl);
                if (Roles && lvl >= Roles.level) {
                    const member = message.member;
                    if (!member.roles.cache.has(Roles.roleID) && message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
                        member.roles.add(Roles.roleID).catch(e => {});
                    }
                }
            } catch (e) {}

        } catch (err) {
            console.error("[XP System Error]", err);
        }
    },
};
