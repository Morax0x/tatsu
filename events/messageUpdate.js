const { Events } = require("discord.js");

// قائمة مؤقتة لتخزين من تم حسابهم (لمنع التكرار في نفس الدقيقة)
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
        if (!newMessage.guild) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            // جلب إعدادات السيرفر
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);
            
            // ⚠️ شرط أساسي: يجب أن تكون قد حددت قناة الشجرة بالأمر -sqc treechannel
            if (!settings || !settings.treeChannelID) return;

            // التأكد أن التعديل حصل في قناة الشجرة
            if (newMessage.channel.id !== settings.treeChannelID) return;

            // ⚠️ إلغاء شرط آيدي البوت مؤقتاً لضمان العمل، الاعتماد الآن على القناة + المحتوى
            if (!newMessage.author.bot) return; // لازم يكون بوت

            let content = "";
            if (newMessage.embeds.length > 0) {
                content = newMessage.embeds[0].description || "";
            } else {
                content = newMessage.content || "";
            }

            // طباعة المحتوى للتشخيص
            // console.log(`[Tree Debug] Message updated in tree channel: ${content}`);

            // كلمات مفتاحية (تأكد أن بوت الشجرة يكتب إحداها)
            const validPhrases = [
                "watered the tree", 
                "سقى الشجرة", 
                "Watered",
                "your tree" 
            ];

            const isTreeMessage = validPhrases.some(phrase => content.toLowerCase().includes(phrase.toLowerCase()));

            if (isTreeMessage) {
                const match = content.match(/<@!?(\d+)>/);
                if (match && match[1]) {
                    const userID = match[1];
                    
                    // 🛑 فلتر التكرار
                    if (treeCooldowns.has(userID)) return;
                    
                    treeCooldowns.add(userID);
                    setTimeout(() => treeCooldowns.delete(userID), 60000); // كول داون دقيقة

                    const guildID = newMessage.guild.id;
                    const dateStr = getTodayDateString();
                    const weekStr = getWeekStartDateString();
                    const dailyID = `${userID}-${guildID}-${dateStr}`;
                    const weeklyID = `${userID}-${guildID}-${weekStr}`;

                    console.log(`[TREE SUCCESS] تم احتساب سقاية للعضو: ${userID}`);

                    sql.prepare(`INSERT INTO user_daily_stats (id, userID, guildID, date, water_tree) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET water_tree = water_tree + 1`).run(dailyID, userID, guildID, dateStr);
                    sql.prepare(`INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, water_tree) VALUES (?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET water_tree = water_tree + 1`).run(weeklyID, userID, guildID, weekStr);

                    const member = await newMessage.guild.members.fetch(userID).catch(() => null);
                    if (member && client.checkQuests) {
                        const updatedDaily = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyID);
                        if (updatedDaily) {
                            await client.checkQuests(client, member, updatedDaily, 'daily', dateStr);
                            await client.checkQuests(client, member, updatedDaily, 'weekly', weekStr);
                        }
                    }
                }
            }
        } catch (err) { console.error("[Tree Error]", err); }
    },
};
