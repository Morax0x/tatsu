const { Events, EmbedBuilder, Colors, PermissionsBitField, ChannelType } = require("discord.js");
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");

const DISBOARD_BOT_ID = '302050872383242240'; 

// --- دوال المساعدة ---
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

// القوالب
const defaultDailyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultWeeklyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

// محرك التتبع
async function trackMessageStats(message, client) {
    const sql = client.sql;
    try {
        const guildID = message.guild.id;
        const authorID = message.author.id;
        const dateStr = getTodayDateString(); 
        const weekStartDateStr = getWeekStartDateString(); 

        const dailyID = `${authorID}-${guildID}-${dateStr}`;
        const weeklyID = `${authorID}-${guildID}-${weekStartDateStr}`;
        const totalID = `${authorID}-${guildID}`;

        let daily = client.getDailyStats.get(dailyID) || { id: dailyID, userID: authorID, guildID: guildID, date: dateStr };
        let weekly = client.getWeeklyStats.get(weeklyID) || { id: weeklyID, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr };
        let total = client.getTotalStats.get(totalID) || { id: totalID, userID: authorID, guildID: guildID };

        daily = safeMerge(daily, defaultDailyStats);
        weekly = safeMerge(weekly, defaultWeeklyStats);
        total = safeMerge(total, defaultTotalStats);

        daily.messages++; weekly.messages++; total.total_messages++;

        if (message.attachments.size > 0) {
            daily.images++; weekly.images++; total.total_images++;
        }
        if (message.reference) { 
            daily.replies_sent++; weekly.replies_sent++; total.total_replies_sent++;
        }

        client.setDailyStats.run(daily);
        client.setWeeklyStats.run(weekly);
        client.setTotalStats.run({
            id: totalID, userID: authorID, guildID: guildID,
            total_messages: total.total_messages, total_images: total.total_images, total_stickers: total.total_stickers, total_reactions_added: total.total_reactions_added,
            replies_sent: total.total_replies_sent, mentions_received: total.total_mentions_received,
            total_vc_minutes: total.total_vc_minutes, total_disboard_bumps: total.total_disboard_bumps
        });

        if (client.checkQuests) {
            await client.checkQuests(client, message.member, daily, 'daily', dateStr);
            await client.checkQuests(client, message.member, weekly, 'weekly', weekStartDateStr);
            await client.checkAchievements(client, message.member, null, total);
        }
    } catch (err) { console.error("Error in trackMessageStats:", err); }
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // 1. Disboard Bump
        if (message.author.bot) {
            if (message.author.id === DISBOARD_BOT_ID) {
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    const desc = message.embeds[0].description;
                    if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                        const match = desc.match(/<@!?(\d+)>/);
                        if (match && match[1]) {
                            const userID = match[1];
                            try {
                                if (client.incrementQuestStats) await client.incrementQuestStats(userID, message.guild.id, 'disboard_bumps');
                            } catch (err) { console.error("[Bump Error]", err); }
                        }
                    }
                }
            }
            return; 
        }

        if (!message.guild) return; 

        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id);
        
        // 2. الأوامر العادية (Prefix) - لها الأولوية
        let Prefix = "-";
        try { 
            const row = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id);
            if (row && row.serverprefix) Prefix = row.serverprefix;
        } catch(e) {}

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

            if (command) {
                let isAllowed = false;
                if (message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                    isAllowed = true;
                } else {
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
                    if (checkPermissions(message, command)) {
                        const cooldownMsg = checkCooldown(message, command);
                        if (cooldownMsg) {
                            if (typeof cooldownMsg === 'string') message.reply(cooldownMsg);
                        } else {
                            try {
                                await command.execute(message, args);
                            } catch (error) {
                                console.error(`Error executing ${command.name}:`, error);
                                message.reply("حدث خطأ أثناء تنفيذ الأمر.");
                            }
                        }
                    }
                }
                return; 
            }
        }

        // 3. الاختصارات (Shortcuts)
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

        // 4. نظام البلاغات (تم الإصلاح: بدون منشن) ✅
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            try {
                // حذف الرسالة فوراً
                await message.delete().catch(() => {});
                
                // تجهيز الإيمبد
                const reportEmbed = new EmbedBuilder()
                    .setTitle(`📢 بلاغ جديد`)
                    .setColor(Colors.Red)
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setDescription(`**محتوى البلاغ:**\n${message.content}`)
                    .addFields(
                        { name: 'صاحب البلاغ', value: `${message.author} (${message.author.id})`, inline: true },
                        { name: 'القناة', value: `${message.channel}`, inline: true }
                    )
                    .setTimestamp();

                if (message.attachments.size > 0) reportEmbed.setImage(message.attachments.first().url);
                
                // ✅ الإرسال بدون منشن (Embed Only)
                await message.channel.send({ embeds: [reportEmbed] });

            } catch (err) { console.error("[Report Error]", err); }
            return; 
        }

        // 5. القنوات الخاصة (الكازينو)
        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            return;
        }

        // 6. أنظمة التتبع (Tracking)
        try {
            // البلاك ليست
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;

            // نظام العد
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
                if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'counting_channel');
            }
            // نظام المياو
            if (message.content.toLowerCase().includes('مياو')) {
                if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count');
            }
            
            // الميديا
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) {
                    await handleMediaStreakMessage(message);
                    return; 
                }
            }

            await handleStreakMessage(message);
            await trackMessageStats(message, client);
            
            // نظام XP
            let level = client.getLevel.get(message.author.id, message.guild.id);
            if (!level) level = { ...(client.defaultData || {}), xp: 0, level: 1, totalXP: 0, user: message.author.id, guild: message.guild.id };
            
            let getXpfromDB = settings?.customXP || 25;
            let getCooldownfromDB = settings?.customCooldown || 60000;

            if (!client.talkedRecently.get(message.author.id)) {
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
                    if (client.sendLevelUpMessage) await client.sendLevelUpMessage(message, message.member, newLevel, oldLevel, level);
                }
                client.setLevel.run(level);
                client.talkedRecently.set(message.author.id, Date.now() + getCooldownfromDB);
                setTimeout(() => client.talkedRecently.delete(message.author.id), getCooldownfromDB);
            }

        } catch (err) { console.error("[Tracking Error]", err); }
    },
};
