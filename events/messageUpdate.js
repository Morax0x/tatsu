const { Events } = require("discord.js");

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // 1. جلب الرسالة كاملة إذا كانت غير مكتملة
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (error) {
                return;
            }
        }
        
        if (!newMessage.guild || !newMessage.author) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            // 2. جلب الإعدادات من قاعدة البيانات
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);
            
            // إذا لم تكن الإعدادات موجودة، توقف
            if (!settings || !settings.treeBotID || !settings.treeChannelID) return;

            // 3. التأكد أن هذه هي "رسالة الشجرة" المقصودة
            // (يجب أن تكون نفس القناة، نفس البوت، ونفس آيدي الرسالة إذا تم تحديده)
            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (newMessage.author.id !== settings.treeBotID) return;
            if (settings.treeMessageID && newMessage.id !== settings.treeMessageID) return;

            // 4. البحث عن المنشن في الوصف (Description) مباشرة
            let content = "";
            if (newMessage.embeds.length > 0) {
                content = newMessage.embeds[0].description || "";
            } else {
                content = newMessage.content || "";
            }

            // استخراج الآيدي
            const match = content.match(/<@!?(\d+)>/);

            if (match && match[1]) {
                const userId = match[1];

                // تجاهل منشن البوت نفسه أو بوت الشجرة
                if (userId === client.user.id || userId === settings.treeBotID) return;

                console.log(`[Tree Quest] 🌳 تم العثور على منشن: ${userId} -> جاري حساب المهمة...`);

                // 5. زيادة النقاط فوراً (بدون أي شروط إضافية)
                if (client.incrementQuestStats) {
                    await client.incrementQuestStats(userId, newMessage.guild.id, 'water_tree', 1);
                }
            }

        } catch (err) {
            console.error("[Tree Quest Error]", err);
        }
    },
};
