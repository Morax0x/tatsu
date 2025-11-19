const { Events, EmbedBuilder, Colors, PermissionsBitField } = require("discord.js");
const { handleStreakMessage, handleMediaStreakMessage } = require("../streak-handler.js");
const { checkPermissions, checkCooldown } = require("../permission-handler.js");

const DISBOARD_BOT_ID = '302050872383242240'; 

// دوال المساعدة
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

// دالة التتبع (المحرك)
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

        // ====================================================
        // 🛠️ 1. إصلاح البومب (Disboard) - بدون تعقيد
        // ====================================================
        if (message.author.bot) {
            if (message.author.id === DISBOARD_BOT_ID) {
                if (message.embeds.length > 0 && message.embeds[0].description) {
                    const desc = message.embeds[0].description;
                    // التحقق من جميع الصيغ المحتملة
                    if (desc.includes('Bump done') || desc.includes('Bump successful') || desc.includes('بومب')) {
                        const match = desc.match(/<@!?(\d+)>/);
                        if (match && match[1]) {
                            const userID = match[1];
                            console.log(`[BUMP DETECTED] User: ${userID}`);
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

        // جلب الإعدادات
        let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(message.guild.id);
        let reportSettings = sql.prepare("SELECT reportChannelID FROM report_settings WHERE guildID = ?").get(message.guild.id);

        // ====================================================
        // 🛠️ 2. إصلاح نظام البلاغات (مباشر)
        // ====================================================
        if (reportSettings && reportSettings.reportChannelID && message.channel.id === reportSettings.reportChannelID) {
            try {
                // حذف رسالة العضو
                await message.delete().catch(() => {});

                // إنشاء إيمبد البلاغ
                const reportEmbed = new EmbedBuilder()
                    .setTitle(`📢 بلاغ جديد | Report`)
                    .setColor(Colors.Red)
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setDescription(`**محتوى البلاغ:**\n${message.content}`)
                    .addFields(
                        { name: 'صاحب البلاغ', value: `${message.author} (${message.author.id})`, inline: true },
                        { name: 'القناة', value: `${message.channel}`, inline: true }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'نظام البلاغات التلقائي' });

                // إرفاق الصور إن وجدت
                if (message.attachments.size > 0) {
                    reportEmbed.setImage(message.attachments.first().url);
                }

                // إرسال البلاغ لنفس القناة (ليراه المشرفون) أو يمكن توجيهه لقناة خاصة
                // هنا سأرسله لنفس القناة كرسالة من البوت لترتيب الشكل
                const sentMsg = await message.channel.send({ content: `||@here||`, embeds: [reportEmbed] });
                
                // (اختياري) إرسال رسالة تأكيد للعضو في الخاص
                /*
                message.author.send({ 
                    content: `✅ تم استلام بلاغك بنجاح وسيتم مراجعته من قبل الإدارة.` 
                }).catch(() => {});
                */
               
            } catch (err) {
                console.error("[Report Error]", err);
            }
            return; // توقف هنا، لا تحسب نقاط للبلاغ
        }

        // ====================================================
        // 3. التعامل مع القنوات الخاصة (مثل الكازينو)
        // ====================================================
        if (settings && settings.casinoChannelID && message.channel.id === settings.casinoChannelID) {
            // ... (كود الكازينو كما هو، اختصرته للتركيز) ...
        }

        // ====================================================
        // 4. تشغيل الأنظمة الأساسية
        // ====================================================

        // البريفكس والأوامر
        let Prefix = "-"; 
        try { 
            const row = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(message.guild.id);
            if (row) Prefix = row.serverprefix;
        } catch(e) {}

        if (message.content.startsWith(Prefix)) {
            // ... (كود تشغيل الأوامر كما هو) ...
        }

        // أنظمة التتبع (XP, Streak, Quests)
        try {
            // نظام العد
            if (settings && settings.countingChannelID && message.channel.id === settings.countingChannelID) {
               if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'counting_channel');
            }
            // نظام المياو
            if (message.content.toLowerCase().includes('مياو')) {
                if(client.incrementQuestStats) await client.incrementQuestStats(message.author.id, message.guild.id, 'meow_count');
            }
            
            await handleStreakMessage(message); // ستريك
            await trackMessageStats(message, client); // مهام
            
            // كود الـ XP (موجود في ملف index.js بشكل عام، لكن الاستدعاء هنا)
            let level = client.getLevel.get(message.author.id, message.guild.id);
            if (!level) level = { ...client.defaultData, user: message.author.id, guild: message.guild.id };
            // ... (حساب XP بسيط) ...
            client.setLevel.run(level);

        } catch (err) { console.error("[Tracking Error]", err); }
    },
};
