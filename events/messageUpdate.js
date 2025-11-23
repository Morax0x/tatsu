const { Events } = require("discord.js");

// تتبع التكرار (Anti-Spam)
const treeCooldowns = new Set();

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // التأكد من تحميل الرسالة كاملة
        if (newMessage.partial) try { await newMessage.fetch(); } catch (e) { return; }
        if (!newMessage.guild) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            // 1. التحقق من الإعدادات
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);
            if (!settings || !settings.treeChannelID) return;

            // 2. التحقق من القناة والبوت
            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (!newMessage.author.bot) return; // لازم يكون بوت

            // 3. تجميع المحتوى (الوصف + العنوان + المحتوى) لضمان كشف المنشن
            let fullContent = newMessage.content || "";
            if (newMessage.embeds.length > 0) {
                const embed = newMessage.embeds[0];
                fullContent += " " + (embed.description || "") + " " + (embed.title || "");
                // أحياناً المنشن يكون داخل الحقول (Fields)
                if (embed.fields && embed.fields.length > 0) {
                    embed.fields.forEach(field => {
                        fullContent += " " + field.value;
                    });
                }
            }

            // 4. كلمات مفتاحية (تأكد أن بوت الشجرة يكتب إحداها)
            // يمكنك إضافة المزيد من الكلمات هنا
            const validPhrases = [
                "watered the tree", 
                "سقى الشجرة", 
                "Watered",
                "your tree",
                "قام بسقاية",
                "level up", // أحياناً التلفيل في الشجرة يعتبر سقاية
                "tree grew"
            ];

            const isTreeMessage = validPhrases.some(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));

            if (isTreeMessage) {
                // البحث عن أول منشن لعضو (User ID)
                const match = fullContent.match(/<@!?(\d+)>/);
                
                if (match && match[1]) {
                    const userID = match[1];
                    
                    // تجاهل إذا كان المنشن للبوت نفسه
                    if (userID === client.user.id || userID === newMessage.author.id) return;

                    // 🛑 كول داون (دقيقة واحدة لكل شخص)
                    if (treeCooldowns.has(userID)) return;
                    
                    treeCooldowns.add(userID);
                    setTimeout(() => treeCooldowns.delete(userID), 60000); 

                    const guildID = newMessage.guild.id;

                    console.log(`[TREE TRACKER] ✅ تم رصد سقاية للعضو: ${userID}`);

                    // 5. الحساب باستخدام الدالة المركزية (الأضمن)
                    if (client.incrementQuestStats) {
                        await client.incrementQuestStats(userID, guildID, 'water_tree', 1);
                    } else {
                        console.error("[TREE ERROR] دالة incrementQuestStats غير موجودة في client!");
                    }
                }
            }
        } catch (err) {
            console.error("[Tree Update Error]", err);
        }
    },
};
