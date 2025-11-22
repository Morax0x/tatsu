const { Events } = require("discord.js");
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError, getReportSettings } = require("../handlers/report-handler.js");

const DISBOARD_BOT_ID = '302050872383242240'; 

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // ---------------------------------------------------------
        // 🟢 نظام البمب (Disboard Bump) - الدقيق 100%
        // ---------------------------------------------------------
        if (message.author.id === DISBOARD_BOT_ID) {
            let bumperID = null;

            // الطريقة 1: عبر بيانات التفاعل (Interaction) - هذه الأضمن لأوامر السلاش
            if (message.interaction && message.interaction.commandName === 'bump') {
                bumperID = message.interaction.user.id;
            }
            
            // الطريقة 2: عبر وصف الإيمبد (احتياطية)
            if (!bumperID && message.embeds.length > 0) {
                const desc = message.embeds[0].description || "";
                if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                    const match = desc.match(/<@!?(\d+)>/);
                    if (match && match[1]) bumperID = match[1];
                }
            }

            if (bumperID) {
                try {
                    const guildID = message.guild.id;
                    const dateStr = getTodayDateString();
                    const weekStr = getWeekStartDateString();
                    const dailyID = `${bumperID}-${guildID}-${dateStr}`;
                    const weeklyID = `${bumperID}-${guildID}-${weekStr}`;
                    const totalID = `${bumperID}-${guildID}`;

                    sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, disboard_bumps) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = disboard_bumps + 1`).run(dailyID, bumperID, guildID, dateStr);
                    sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, disboard_bumps) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET disboard_bumps = disboard_bumps + 1`).run(weeklyID, bumperID, guildID, weekStr);
                    sql.prepare(`INSERT INTO user_total_stats (id, userID, guildID, total_disboard_bumps) VALUES (?,?,?,1) ON CONFLICT(id) DO UPDATE SET total_disboard_bumps = total_disboard_bumps + 1`).run(totalID, bumperID, guildID);

                    message.react('👊').catch(() => {});

                    // التحقق من المهام
                    const member = await message.guild.members.fetch(bumperID).catch(() => null);
                    if (member && client.checkQuests) {
                        const updatedDaily = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyID);
                        const updatedTotal = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?").get(totalID);
                        if (updatedDaily) await client.checkQuests(client, member, updatedDaily, 'daily', dateStr);
                        if (updatedTotal) await client.checkAchievements(client, member, null, updatedTotal);
                    }
                } catch (err) { console.error("Bump Error:", err); }
            }
            return; 
        }

        if (message.author.bot) return;
        if (!message.guild) return; 

        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = getReportSettings(sql, message.guild.id);

        let Prefix = "-";
        try { const row = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id); if (row && row.serverprefix) Prefix = row.serverprefix; } catch(e) {}

        try {
            const argsRaw = message.content.trim().split(/ +/);
            const shortcutWord = argsRaw[0].toLowerCase();
            const shortcut = sql.prepare("SELECT commandName FROM command_shortcuts WHERE guildID = ? AND channelID = ? AND shortcutWord = ?").get(message.guild.id, message.channel.id, shortcutWord);
            if (shortcut) {
                const cmd = client.commands.get(shortcut.commandName);
                if (cmd) {
                    try { await cmd.execute(message, argsRaw.slice(1)); } catch(e){}
                    return;
                }
            }
        } catch (err) {}

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

        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            if (message.content.trim().startsWith("بلاغ")) {
                const args = message.content.trim().split(/ +/);
                args.shift(); 
                await message.delete().catch(() => {});

                const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(message.guild.id).map(r => r.roleID);
                const hasPerm = message.member.permissions.has('Administrator') || allowedRoles.length === 0 || message.member.roles.cache.some(r => allowedRoles.includes(r.id));

                if (!hasPerm) return sendReportError(message, "❖ ليس لـديـك صلاحيـات", "ليس لديك صلاحيات التبليغ.");

                const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
                const reason = args.slice(1).join(" ");

                if (!target || !reason) return sendReportError(message, "✶ خطأ في التنسيق", "`بلاغ @user السبب`");
                await processReportLogic(client, message, target, reason);
            }
            return; 
        }

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

        try {
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;

            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, counting_channel) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET counting_channel = counting_channel + 1`).run(`${message.author.id}-${message.guild.id}-${getTodayDateString()}`, message.author.id, message.guild.id, getTodayDateString());
                sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, counting_channel) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET counting_channel = counting_channel + 1`).run(`${message.author.id}-${message.guild.id}-${getWeekStartDateString()}`, message.author.id, message.guild.id, getWeekStartDateString());
            }
            if (message.content.toLowerCase().includes('مياو')) {
                sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, meow_count) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET meow_count = meow_count + 1`).run(`${message.author.id}-${message.guild.id}-${getTodayDateString()}`, message.author.id, message.guild.id, getTodayDateString());
                let level = client.getLevel.get(message.author.id, message.guild.id);
                if (level) {
                     level.total_meow_count = (level.total_meow_count || 0) + 1;
                     client.setLevel.run(level);
                     await client.checkAchievements(client, message.member, level, null);
                }
            }

            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    await handleMediaStreakMessage(message);
                    return; 
                }
            }

            await handleStreakMessage(message);
            await trackMessageStats(message, client);
            
            let level = client.getLevel.get(message.author.id, message.guild.id);
            if (!level) level = { ...(client.defaultData || {}), xp: 0, level: 1, totalXP: 0, user: message.author.id, guild: message.guild.id };
            let getXpfromDB = settings?.customXP || 25;
            let getCooldownfromDB = settings?.customCooldown || 60000;

            if (!client.talkedRecently.get(message.author.id)) {
                const buff = calculateBuffMultiplier(message.member, sql);
                const xp = Math.floor((Math.random() * getXpfromDB + 1) * buff);
                level.xp += xp; level.totalXP += xp;
                const nextXP = 5 * (level.level ** 2) + (50 * level.level) + 100;
                if (level.xp >= nextXP) {
                    level.xp -= nextXP; level.level++;
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

        } catch (err) {}
    },
};
