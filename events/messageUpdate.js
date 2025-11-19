const { Events } = require("discord.js");

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // جلب الرسالة إذا كانت غير مكتملة
        if (newMessage.partial) {
            try { await newMessage.fetch(); } catch (e) { return; }
        }
        
        if (!newMessage.guild || !newMessage.author) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            // 1. جلب إعدادات الشجرة
            const settings = sql.prepare("SELECT treeBotID, treeChannelID, treeMessageID FROM settings WHERE guild = ?").get(newMessage.guild.id);
            
            // إذا لم يتم إعداد الشجرة، نوقف الكود
            if (!settings || !settings.treeBotID || !settings.treeChannelID) return;

            // 2. التحقق من المطابقة (هل هذا هو البوت؟ وهذه هي القناة؟)
            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (newMessage.author.id !== settings.treeBotID) return;
            
            // (اختياري) التحقق من رسالة محددة إذا تم وضعها
            if (settings.treeMessageID && newMessage.id !== settings.treeMessageID) return;

            // 3. استخراج الوصف (Description) من الـ Embed
            const content = newMessage.content || (newMessage.embeds.length > 0 ? newMessage.embeds[0].description : "");
            if (!content) return;

            // 4. البحث عن المنشن <@123456>
            // هذه الصيغة تبحث عن أي آيدي يظهر في الرسالة
            const match = content.match(/<@!?(\d+)>/);

            if (match && match[1]) {
                const userId = match[1];

                // تجاهل إذا كان المنشن للبوت نفسه
                if (userId === client.user.id || userId === settings.treeBotID) return;

                console.log(`[Tree Quest] Detected interaction for user: ${userId}`);

                // 5. زيادة نقاط الشجرة
                if (client.incrementQuestStats) {
                    await client.incrementQuestStats(userId, newMessage.guild.id, 'water_tree', 1);
                    console.log(`[Tree Quest] Added +1 water_tree for ${userId}`);
                }
            }

        } catch (err) {
            console.error("[MessageUpdate Error]", err);
        }
    },
};
