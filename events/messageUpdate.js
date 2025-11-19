const { Events } = require("discord.js");

// دوال مساعدة للتواريخ
function getTodayDateString() { return new Date().toISOString().split('T')[0]; }
function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.partial) {
            try { await newMessage.fetch(); } catch (e) { return; }
        }
        
        if (!newMessage.guild || !newMessage.author) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            // 1. جلب الإعدادات
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);
            
            if (!settings || !settings.treeBotID || !settings.treeChannelID) return;

            // 2. التحقق من البوت والقناة فقط (تم إزالة شرط treeMessageID لضمان العمل) ✅
            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (newMessage.author.id !== settings.treeBotID) return;

            // 3. استخراج المنشن
            let content = "";
            if (newMessage.embeds.length > 0) {
                content = newMessage.embeds[0].description || "";
            } else {
                content = newMessage.content || "";
            }

            const match = content.match(/<@!?(\d+)>/);

            if (match && match[1]) {
                const userID = match[1];

                // تجاهل البوتات
                if (userID === client.user.id || userID === settings.treeBotID) return;

                console.log(`[Tree Quest] 🌳 تم رصد سقاية من: ${userID}`);

                // 4. إدخال مباشر في الداتا بيس
                const guildID = newMessage.guild.id;
                const dateStr = getTodayDateString();
                const weekStr = getWeekStartDateString();
                
                const dailyID = `${userID}-${guildID}-${dateStr}`;
                const weeklyID = `${userID}-${guildID}-${weekStr}`;

                // زيادة اليومي
                sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, water_tree) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET water_tree = water_tree + 1`).run(dailyID, userID, guildID, dateStr);
                
                // زيادة الأسبوعي
                sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, water_tree) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET water_tree = water_tree + 1`).run(weeklyID, userID, guildID, weekStr);

                // 5. فحص المهام
                const member = await newMessage.guild.members.fetch(userID).catch(() => null);
                if (member && client.checkQuests) {
                    await client.checkQuests(client, member, { water_tree: 1000 }, 'daily', dateStr);
                    await client.checkQuests(client, member, { water_tree: 1000 }, 'weekly', weekStr);
                }
            }

        } catch (err) {
            console.error("[Tree Quest Error]", err);
        }
    },
};
