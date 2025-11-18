const { REST, Routes } = require('discord.js');

// --- ( 💡 انسخ نفس البيانات من ملف deploy-commands.js 💡 ) ---

// 1. التوكن
const token = process.env.DISCORD_BOT_TOKEN;

// 2. ID البوت (يجب أن يكون مطابقاً للملف deploy-commands.js)
const clientId = "1434804075484020755";

// 3. ID السيرفر (يجب أن يكون مطابقاً للملف deploy-commands.js)
const guildId = "952732360074494003";

// -------------------------------------------

if (!token || !clientId || !guildId || guildId === "YOUR_SERVER_ID_HERE" || clientId === "YOUR_BOT_CLIENT_ID_HERE") {
    console.error("!!! خطأ فادح: يرجى فتح ملف clear-commands.js وتعبئة (clientId) و (guildId) يدوياً.");
    process.exit(1);
}

const rest = new REST().setToken(token);

(async () => {
    try {
        console.log('بدء حذف أوامر السيرفر (Guild)...');
        // حذف أوامر السيرفر (التي سجلناها للتجربة)
        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: [] }, // إرسال قائمة فارغة
        );
        console.log('✅ تم حذف أوامر السيرفر (Guild) بنجاح.');

        console.log('بدء حذف الأوامر العالمية (Global)...');
        // حذف الأوامر العالمية (القديمة)
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: [] }, // إرسال قائمة فارغة
        );
        console.log('✅ تم حذف الأوامر العالمية (Global) بنجاح.');

        console.log('--- ✅ اكتمل التنظيف ---');

    } catch (error) {
        console.error('حدث خطأ أثناء حذف الأوامر:', error);
    }
})();