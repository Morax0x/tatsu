const { Events } = require("discord.js");

// الآي دي الخاص بك (المالك الحصري)
// ⚠️ استبدل الرقم أدناه بالآي دي الخاص بك إذا لم يكن مخزناً في ملف .env
const OWNER_ID = process.env.OWNER_ID || '1145327691772481577'; 

const TRASH_EMOJI = '🗑️';

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        // 1. تجاهل البوتات
        if (user.bot) return;

        // 2. التحقق من أن الرياكشن هو السلة
        if (reaction.emoji.name !== TRASH_EMOJI) return;

        // 3. التحقق الحصري: هل الفاعل هو المالك؟
        if (user.id !== OWNER_ID) return;

        // 4. التعامل مع الرسائل القديمة (Partial Messages)
        // إذا كانت الرسالة قديمة جداً (قبل تشغيل البوت)، نحتاج لجلبها أولاً
        if (reaction.message.partial) {
            try {
                await reaction.message.fetch();
            } catch (error) {
                console.error('[Reaction Delete] فشل في جلب الرسالة القديمة:', error);
                return;
            }
        }

        // 5. تنفيذ الحذف
        try {
            // حذف الرسالة
            await reaction.message.delete();
            // (اختياري) إرسال لوج بسيط في الكونسول
            console.log(`[Owner Action] تم حذف رسالة في ${reaction.message.channel.name} بواسطة المالك عبر الرياكشن.`);
        } catch (error) {
            console.error('[Reaction Delete] حدث خطأ أثناء محاولة حذف الرسالة:', error);
            // قد يحدث خطأ إذا لم يملك البوت صلاحية Manage Messages أو كانت الرسالة لشخص أعلى منه رتبة
            if (reaction.message.channel) {
                // إزالة الرياكشن فقط لإشعار المالك بالفشل (اختياري)
                reaction.users.remove(user.id).catch(() => {});
            }
        }
    },
};
