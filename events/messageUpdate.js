const { Events } = require("discord.js");

// قائمة مؤقتة لمنع التكرار عند التعديل السريع
const treeCooldowns = new Set();

function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date(); const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff)); friday.setUTCHours(0, 0, 0, 0); return friday.toISOString().split('T')[0];
}

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.partial) try { await newMessage.fetch(); } catch (e) { return; }
        if (!newMessage.guild || !newMessage.author) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);
            // تأكد من إعداد هذه القيم في الداتابيس (treeBotID و treeChannelID)
            if (!settings || !settings.treeBotID || !settings.treeChannelID) return;

            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (newMessage.author.id !== settings.treeBotID) return;

            let content = "";
            if (newMessage.embeds.length > 0) {
                content = newMessage.embeds[0].description || "";
            } else {
                content = newMessage.content || "";
            }

            // البحث عن أول منشن في النص
            const match = content.match(/<@!?(\d+)>/);
            if (match && match[1]) {
                const userID = match[1];
                
                // 🛑 منع التكرار: إذا تم احتساب نقطة لنفس الشخص خلال الدقيقة الماضية
                if (treeCooldowns.has(userID)) return;
                if (userID === client.user.id || userID === settings.treeBotID) return;

                // إضافة للمؤقت (لمدة 60 ثانية)
                treeCooldowns.add(userID);
                setTimeout(() => treeCooldowns.delete(userID), 60000);

                const guildID = newMessage.guild.id;
                const dateStr = getTodayDateString();
                const weekStr = getWeekStartDateString();
                const dailyID = `${userID}-${guildID}-${dateStr}`;
                const weeklyID = `${userID}-${guildID}-${weekStr}`;

                sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, water_tree) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET water_tree = water_tree + 1`).run(dailyID, userID, guildID, dateStr);
                sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, water_tree) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET water_tree = water_tree + 1`).run(weeklyID, userID, guildID, weekStr);

                console.log(`[Tree] Water counted for ${userID}`);

                const member = await newMessage.guild.members.fetch(userID).catch(() => null);
                if (member && client.checkQuests) {
                    // إرسال البيانات الجديدة المحدثة للتحقق من المهام
                    const updatedDaily = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyID);
                    const updatedWeekly = sql.prepare("SELECT * FROM user_weekly_stats WHERE id = ?").get(weeklyID);
                    
                    if(updatedDaily) await client.checkQuests(client, member, updatedDaily, 'daily', dateStr);
                    if(updatedWeekly) await client.checkQuests(client, member, updatedWeekly, 'weekly', weekStr);
                }
            }
        } catch (err) { console.error(err); }
    },
};
