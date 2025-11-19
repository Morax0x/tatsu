const { Events } = require("discord.js");

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // 1. التعامل مع الرسائل غير المحملة (Partial)
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (error) {
                console.error('Something went wrong when fetching the message: ', error);
                return;
            }
        }
        
        if (!newMessage.guild || !newMessage.author) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            // 2. جلب الإعدادات
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);

            // 3. التأكد من أن التعديل حصل في رسالة الشجرة المحددة
            if (settings && settings.treeBotID && settings.treeChannelID && settings.treeMessageID &&
                newMessage.author.id === settings.treeBotID &&
                newMessage.channel.id === settings.treeChannelID &&
                newMessage.id === settings.treeMessageID) {

                // 4. فحص الـ Embed
                if (newMessage.embeds && newMessage.embeds.length > 0) {
                    const embedDesc = newMessage.embeds[0].description;
                    
                    if (embedDesc) {
                        // استخراج أول منشن في الوصف
                        const match = embedDesc.match(/<@!?(\d+)>/);

                        if (match && match[1]) {
                            const userID = match[1];

                            // محاولة مقارنة المستخدم القديم بالجديد (لمنع التكرار عند تعديل البوت للرسالة لأسباب أخرى)
                            let oldUserID = null;
                            if (oldMessage && !oldMessage.partial && oldMessage.embeds.length > 0 && oldMessage.embeds[0].description) {
                                const oldEmbedDesc = oldMessage.embeds[0].description;
                                const oldMatch = oldEmbedDesc.match(/<@!?(\d+)>/);
                                if (oldMatch && oldMatch[1]) {
                                    oldUserID = oldMatch[1];
                                }
                            }

                            // إذا تغير المستخدم، أو لم يكن هناك مستخدم سابق (رسالة جديدة)
                            if (userID !== oldUserID) {
                                console.log(`[Tree Quest] New waterer detected: ${userID}`);
                                
                                // ✅ زيادة النقاط
                                if (client.incrementQuestStats) {
                                    await client.incrementQuestStats(userID, newMessage.guild.id, 'water_tree', 1);
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[Tree Quest Error]", err);
        }
    },
};
