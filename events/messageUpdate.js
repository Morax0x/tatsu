const { Events } = require("discord.js");

// تتبع التكرار (Anti-Spam) - يمنع نفس الشخص من أخذ نقاط مرتين في الدقيقة
const treeCooldowns = new Set();

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // 1. التأكد من تحميل الرسالة كاملة (إذا كانت قديمة)
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (e) {
                return; 
            }
        }
        if (!newMessage.guild) return;

        // 2. جلب الاتصال بقاعدة البيانات
        const client = newMessage.client;
        const sql = client.sql;
        if (!sql) return; // أمان

        try {
            // 3. جلب إعدادات السيرفر
            const settings = sql.prepare("SELECT treeChannelID, treeBotID FROM settings WHERE guild = ?").get(newMessage.guild.id);
            
            // إذا لم يتم تفعيل النظام (لم يحدد قناة)، نخرج
            if (!settings || !settings.treeChannelID) return;

            // 4. التحقق من القناة والبوت
            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (!newMessage.author.bot) return; // لازم الرسالة تكون من بوت

            // (اختياري: إذا حددنا بوت معين، نتأكد منه)
            if (settings.treeBotID && newMessage.author.id !== settings.treeBotID) return;


            // 5. تجميع المحتوى (الوصف + العنوان + المحتوى + الحقول) لضمان كشف المنشن
            let fullContent = (newMessage.content || "") + " ";
            
            if (newMessage.embeds.length > 0) {
                const embed = newMessage.embeds[0];
                fullContent += (embed.description || "") + " ";
                fullContent += (embed.title || "") + " ";
                
                // أحياناً المنشن يكون داخل الحقول (Fields)
                if (embed.fields && embed.fields.length > 0) {
                    embed.fields.forEach(field => {
                        fullContent += (field.value || "") + " ";
                    });
                }
            }

            // 6. كلمات مفتاحية (تأكد أن بوت الشجرة يكتب إحداها)
            const validPhrases = [
                "watered the tree", 
                "سقى الشجرة", 
                "Watered",
                "your tree",
                "قام بسقاية",
                "level up", // أحياناً التلفيل في الشجرة يعتبر سقاية
                "tree grew",
                "has watered"
            ];

            const isTreeMessage = validPhrases.some(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));

            if (isTreeMessage) {
                // 7. البحث عن أول منشن لعضو (User ID)
                // الترتيب: <@!123> أو <@123>
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

                    // 8. الحساب باستخدام الدالة المركزية (الأضمن)
                    if (client.incrementQuestStats) {
                        // الرقم 1 يعني سقاية واحدة
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
