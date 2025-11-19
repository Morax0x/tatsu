const { Events } = require("discord.js");

// قائمة مؤقتة لتخزين من تم حسابهم (لمنع التكرار)
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
            if (!settings || !settings.treeBotID || !settings.treeChannelID) return;

            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (newMessage.author.id !== settings.treeBotID) return;

            let content = "";
            if (newMessage.embeds.length > 0) {
                content = newMessage.embeds[0].description || "";
            } else {
                content = newMessage.content || "";
            }

            const match = content.match(/<@!?(\d+)>/);
            if (match && match[1]) {
                const userID = match[1];
                
                // 🛑 الفلتر الجديد: إذا كان الشخص حسبنا له قبل شوي، نطلع
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

                console.log(`[Tree] Water counted for ${userID} (Cooldown started)`);

                const member = await newMessage.guild.members.fetch(userID).catch(() => null);
                if (member && client.checkQuests) {
                    await client.checkQuests(client, member, { water_tree: 1000 }, 'daily', dateStr);
                    await client.checkQuests(client, member, { water_tree: 1000 }, 'weekly', weekStr);
                }
            }
        } catch (err) { console.error(err); }
    },
};
