const { Events, PermissionsBitField } = require("discord.js");
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError } = require("../handlers/report-handler.js");

const DISBOARD_BOT_ID = '302050872383242240'; 

// --- ( دالة تنظيف النص العربي ) ---
function normalizeArabic(text) {
    if (!text) return "";
    return text
        .replace(/[أإآ]/g, 'ا')   // توحيد الألف
        .replace(/ى/g, 'ي')       // توحيد الياء
        .replace(/ة/g, 'ه')       // توحيد التاء المربوطة
        .replace(/[\u064B-\u065F]/g, '') // إزالة التشكيل
        .replace(/[\u200B-\u200D\uFEFF]/g, '') // إزالة الرموز المخفية
        .trim()
        .toLowerCase();
}
// --------------------------------

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}

async function recordBump(client, guildID, userID) {
    const sql = client.sql;
    const dateStr = getTodayDateString();
    const weekStr = getWeekStartDateString();
    const dailyID = `${userID}-${guildID}-${dateStr}`;
    const weeklyID = `${userID}-${guildID}-${weekStr}`;
    const totalID = `${userID}-${guildID}`;

    sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, disboard_bumps) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = disboard_bumps + 1`).run(dailyID, userID, guildID, dateStr);
    sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, disboard_bumps) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = disboard_bumps + 1`).run(weeklyID, userID, guildID, weekStr);
    sql.prepare(`INSERT INTO user_total_stats (id, userID, guildID, total_disboard_bumps) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET total_disboard_bumps = total_disboard_bumps + 1`).run(totalID, userID, guildID);

    const member = await client.guilds.cache.get(guildID)?.members.fetch(userID).catch(() => null);
    if (member && client.checkQuests) {
        const updatedDaily = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyID);
        const updatedTotal = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?").get(totalID);
        if (updatedDaily) await client.checkQuests(client, member, updatedDaily, 'daily', dateStr);
        if (updatedTotal) await client.checkAchievements(client, member, null, updatedTotal);
    }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // 1. كشف البومب
        if (message.author.id === DISBOARD_BOT_ID) {
            let bumperID = null;
            if (message.interaction && message.interaction.commandName === 'bump') {
                bumperID = message.interaction.user.id;
            } else if (message.embeds.length > 0) {
                const desc = message.embeds[0].description || "";
                if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                    const match = desc.match(/<@!?(\d+)>/); 
                    if (match && match[1]) bumperID = match[1];
                }
            }
            if (bumperID) {
                await recordBump(client, message.guild.id, bumperID);
                await message.react('👊').catch(() => {});
            }
            return; 
        }

        if (message.author.bot) return;
        if (!message.guild) return; 

        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id);
        
        // --- ( 🌟 2. معالج الاختصارات الذكي 🌟 ) ---
        try {
            // تنظيف الكلمة القادمة من الرسالة
            const rawContent = message.content.trim();
            const firstWordRaw = rawContent.split(/ +/)[0];
            const cleanInput = normalizeArabic(firstWordRaw);

            // جلب جميع الاختصارات المسجلة لهذه القناة
            const allShortcuts = sql.prepare("SELECT shortcutWord, commandName FROM command_shortcuts WHERE guildID = ? AND channelID = ?").all(message.guild.id, message.channel.id);
            
            // البحث عن تطابق "ذكي" (بعد تنظيف الكلمات المسجلة أيضاً)
            const matchedShortcut = allShortcuts.find(s => normalizeArabic(s.shortcutWord) === cleanInput);
            
            if (matchedShortcut) {
                const cmd = client.commands.get(matchedShortcut.commandName);
                if (cmd) {
                    if (checkPermissions(message, cmd)) {
                        const cooldownMsg = checkCooldown(message, cmd);
                        if (cooldownMsg) {
                             if (typeof cooldownMsg === 'string') message.reply(cooldownMsg);
                             return;
                        }
                        try {
                            // تمرير باقي الرسالة كـ args
                            const args = rawContent.split(/ +/).slice(1);
                            await cmd.execute(message, args); 
                        } catch (e) { console.error(e); }
                    }
                    return; // (توقف هنا)
                }
            }
        } catch (err) { console.error("[Shortcut Error]", err); }
        // ------------------------------------------------------------

        // 3. معالج البريفكس العادي
        let Prefix = "-";
        try { const row = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id); if (row && row.serverprefix) Prefix = row.serverprefix; } catch(e) {}

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
                        else { const hasRestrictions = sql.prepare("SELECT 1 FROM command_permissions WHERE guildID = ? AND commandName = ?").get(message.guild.id, command.name); if (!hasRestrictions) isAllowed = true; }
                    } catch (err) { isAllowed = true; }
                }
                if (isAllowed) {
                    if (checkPermissions(message, command)) {
                        const cooldownMsg = checkCooldown(message, command);
                        if (cooldownMsg) { if (typeof cooldownMsg === 'string') message.reply(cooldownMsg); } 
                        else { try { await command.execute(message, args); } catch (error) { console.error(error); message.reply("Error"); } }
                    }
                }
                return;
            }
        }

        // 4. البلاغات
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            if (message.content.trim().startsWith("بلاغ")) {
                const args = message.content.trim().split(/ +/); args.shift(); await message.delete().catch(() => {});
                const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(message.guild.id).map(r => r.roleID);
                const hasPerm = message.member.permissions.has(PermissionsBitField.Flags.Administrator) || allowedRoles.length === 0 || message.member.roles.cache.some(r => allowedRoles.includes(r.id));
                if (!hasPerm) return sendReportError(message, "❖ ليس لـديـك صلاحيـات", "ليس لديك صلاحيات التبليغ.");
                const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
                const reason = args.slice(1).join(" ");
                if (!target || !reason) return sendReportError(message, "✶ خطأ في التنسيق", "`بلاغ @user السبب`");
                await processReportLogic(client, message, target, reason);
            }
            return; 
        }

        // 5. الكازينو
        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            if (command && command.category === "Economy") {
                if (!checkPermissions(message, command)) return;
                try { await command.execute(message, args); } catch (error) {}
            }
            return;
        }

        // 6. البلاك ليست
        try {
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;
        } catch (e) {}

        // 7. تتبع المهام والإحصائيات
        try {
            const userID = message.author.id;
            const guildID = message.guild.id;

            if (client.incrementQuestStats) {
                await client.incrementQuestStats(userID, guildID, 'messages', 1);
                if (message.attachments.size > 0) await client.incrementQuestStats(userID, guildID, 'images', 1);
            }

            if (message.mentions.users.size > 0) {
                message.mentions.users.forEach(async (user) => {
                    if (user.id !== message.author.id && !user.bot) {
                        if (client.incrementQuestStats) await client.incrementQuestStats(user.id, guildID, 'mentions_received', 1);
                    }
                });
            }

            if (message.reference && message.reference.messageId) {
                try {
                    const repliedMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    if (repliedMsg && repliedMsg.author.id !== message.author.id) {
                        if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'replies_sent', 1);
                    }
                } catch(e) {}
            }

            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                if (!isNaN(message.content.trim())) {
                    if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'counting_channel', 1);
                }
            }

            if (message.content.toLowerCase().includes('مياو') || message.content.toLowerCase().includes('meow')) {
                if (client.incrementQuestStats) await client.incrementQuestStats(userID, guildID, 'meow_count', 1);
                let level = client.getLevel.get(userID, guildID);
                if (level) {
                     level.total_meow_count = (level.total_meow_count || 0) + 1;
                     client.setLevel.run(level);
                     if (client.checkAchievements) await client.checkAchievements(client, message.member, level, null);
                }
            }

            if (settings && settings.treeChannelID && message.channel.id === settings.treeChannelID) {
                const content = message.content.toLowerCase();
                if (content.includes('سقاية') || content.includes('water') || content.includes('سقي')) {
                    if (client.incrementQuestStats) {
                        await client.incrementQuestStats(userID, guildID, 'water_tree', 1);
                        message.react('💧').catch(() => {});
                    }
                }
            }

            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(guildID, message.channel.id);
            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    await handleMediaStreakMessage(message);
                    return; 
                }
            }

        } catch (err) { console.error("[Stats Tracker Error]:", err); }

        // 8. نظام XP والستريك
        await handleStreakMessage(message);
        
        let level = client.getLevel.get(message.author.id, message.guild.id);
        if (!level) level = { ...(client.defaultData || {}), xp: 0, level: 1, totalXP: 0, user: message.author.id, guild: message.guild.id };
        
        let getXpfromDB = settings?.customXP || 25;
        let getCooldownfromDB = settings?.customCooldown || 60000;

        if (!client.talkedRecently.get(message.author.id)) {
            const buff = calculateBuffMultiplier(message.member, sql);
            const xp = Math.floor((Math.random() * getXpfromDB + 1) * buff);
            
            level.xp += xp; 
            level.totalXP += xp;
            
            const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
            
            if (level.xp >= nextXP) {
                level.xp -= nextXP; 
                level.level++;
                if(client.sendLevelUpMessage) await client.sendLevelUpMessage(message, message.member, level.level, level.level-1, level);
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
    },
};
