const { Events, EmbedBuilder, Colors, PermissionsBitField, ChannelType } = require("discord.js");
const { handleStreakMessage, handleMediaStreakMessage, calculateBuffMultiplier } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");
const { processReportLogic, sendReportError, getReportSettings } = require("../handlers/report-handler.js");

const DISBOARD_BOT_ID = '302050872383242240'; 

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}
function safeMerge(base, defaults) {
    const result = { ...base }; for (const key in defaults) { if (result[key] === undefined || result[key] === null) result[key] = defaults[key]; } return result;
}

const defaultDailyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultWeeklyStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
const defaultTotalStats = { total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

async function trackMessageStats(message, client) {
    const sql = client.sql;
    try {
        const guildID = message.guild.id; const authorID = message.author.id;
        const dateStr = getTodayDateString(); const weekStartDateStr = getWeekStartDateString(); 
        const dailyID = `${authorID}-${guildID}-${dateStr}`; const weeklyID = `${authorID}-${guildID}-${weekStartDateStr}`; const totalID = `${authorID}-${guildID}`;

        let daily = client.getDailyStats.get(dailyID) || { id: dailyID, userID: authorID, guildID: guildID, date: dateStr };
        let weekly = client.getWeeklyStats.get(weeklyID) || { id: weeklyID, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr };
        let total = client.getTotalStats.get(totalID) || { id: totalID, userID: authorID, guildID: guildID };

        daily = safeMerge(daily, defaultDailyStats); weekly = safeMerge(weekly, defaultWeeklyStats); total = safeMerge(total, defaultTotalStats);
        daily.messages++; weekly.messages++; total.total_messages++;
        if (message.attachments.size > 0) { daily.images++; weekly.images++; total.total_images++; }
        if (message.reference) { daily.replies_sent++; weekly.replies_sent++; total.total_replies_sent++; }
        client.setDailyStats.run(daily); client.setWeeklyStats.run(weekly);
        client.setTotalStats.run({ id: totalID, userID: authorID, guildID: guildID, total_messages: total.total_messages, total_images: total.total_images, total_stickers: total.total_stickers, total_reactions_added: total.total_reactions_added, replies_sent: total.total_replies_sent, mentions_received: total.total_mentions_received, total_vc_minutes: total.total_vc_minutes, total_disboard_bumps: total.total_disboard_bumps });
        if (client.checkQuests) { await client.checkQuests(client, message.member, daily, 'daily', dateStr); await client.checkQuests(client, message.member, weekly, 'weekly', weekStartDateStr); await client.checkAchievements(client, message.member, null, total); }
    } catch (err) {}
}

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;
        const sql = client.sql;

        // 1. Disboard
        if (message.author.bot) {
            if (message.author.id === DISBOARD_BOT_ID) {
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    const desc = message.embeds[0].description;
                    if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                        const match = desc.match(/<@!?(\d+)>/);
                        if (match && match[1]) {
                            try {
                                if (client.incrementQuestStats) await client.incrementQuestStats(match[1], message.guild.id, 'disboard_bumps');
                            } catch (err) {}
                        }
                    }
                }
            }
            return; 
        }
        if (!message.guild) return; 

        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = getReportSettings(sql, message.guild.id);

        // 2. بلاغ (بدون بريفكس)
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            // حذف الرسالة فوراً
            await message.delete().catch(() => {});

            // التحقق من محتوى الرسالة
            if (message.content.trim().startsWith("بلاغ")) {
                const args = message.content.trim().split(/ +/);
                const target = message.mentions.members.first() || message.guild.members.cache.get(args[1]); // args[0] هو كلمة "بلاغ"
                const reason = args.slice(2).join(" ");

                if (!target || !reason) {
                    return sendReportError(message, "✶ تـم تقـديـم الـبلاغ بطـريقـة غـير صحـيحـة !", "- طـريـقـة الـتـبـليـغ هـي:\n\n`بلاغ (@منشن او ID الي تبلغ عليه) سبب البلاغ`\n\n- بسبب جهلك بطريقة تقديم البلاغ تم حرمانك من تقديم البلاغات لمدة ساعتين <a:6fuckyou:1401255926807400559>");
                }

                await processReportLogic(client, message, target, reason);
            }
            return; // أي شيء آخر في قناة البلاغات يحذف ولا يتم التعامل معه
        }

        // 3. الكازينو (بدون بريفكس)
        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            const args = message.content.trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            if (command && command.category === "Economy") {
                if (checkPermissions(message, command)) {
                    try { await command.execute(message, args); } catch (error) {}
                }
            }
            return; 
        }

        // 4. الأوامر العادية
        let Prefix = "-";
        try { const row = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id); if (row) Prefix = row.serverprefix; } catch(e) {}

        if (message.content.startsWith(Prefix)) {
            const args = message.content.slice(Prefix.length).trim().split(/ +/);
            const commandName = args.shift().toLowerCase();
            const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
            if (command) {
                if (message.member.permissions.has(PermissionsBitField.Flags.ManageGuild) || checkPermissions(message, command)) {
                     try { await command.execute(message, args); } catch (error) { message.reply("Error"); }
                }
                return;
            }
        }

        // 5. التتبع
        try {
            let blacklist = sql.prepare(`SELECT id FROM blacklistTable WHERE id = ?`);
            if (blacklist.get(`${message.guild.id}-${message.author.id}`) || blacklist.get(`${message.guild.id}-${message.channel.id}`)) return;
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) { if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'counting_channel'); }
            if (message.content.toLowerCase().includes('مياو')) { if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count'); }
            
            const isMediaChannel = sql.prepare("SELECT * FROM media_streak_channels WHERE guildID = ? AND channelID = ?").get(message.guild.id, message.channel.id);
            if (isMediaChannel) {
                if (message.attachments.size > 0 || message.content.includes('http')) { await handleMediaStreakMessage(message); return; }
            }

            await handleStreakMessage(message);
            await trackMessageStats(message, client);

            // XP
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
        } catch (err) {}
    },
};
