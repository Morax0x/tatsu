const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// --- ( 💡 يرجى تعبئة هذه الحقول يدوياً 💡 ) ---

// 1. التوكن: اجلبه من نفس المكان الذي تضعه فيه (ملف .env أو secrets)
// (إذا كنت تستخدم Replit، تأكد من إضافة التوكن في Secrets باسم DISCORD_BOT_TOKEN)
const token = process.env.DISCORD_BOT_TOKEN;

// 2. ID البوت: انسخ ID البوت الخاص بك (انقر بيمين الفأرة على البوت واختر "Copy User ID")
const clientId = "1434804075484020755";

// 3. ID السيرفر: انسخ ID سيرفرك الرئيسي للتجارب
const guildId = "952732360074494003";

// -------------------------------------------

if (!token || !clientId || !guildId || guildId === "YOUR_SERVER_ID_HERE" || clientId === "YOUR_BOT_CLIENT_ID_HERE") {
    console.error("!!! خطأ فادح: يرجى فتح ملف deploy-commands.js وتعبئة (clientId) و (guildId) يدوياً قبل التشغيل.");
    console.error("!!! تأكد أيضاً من أن التوكن (DISCORD_BOT_TOKEN) موجود في Secrets أو .env");
    process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

// دالة لقراءة الملفات من جميع المجلدات الفرعية
function loadCommands(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            loadCommands(fullPath); // ادخل المجلد الفرعي
        } else if (file.endsWith('.js')) {
            try {
                const command = require(fullPath);
                if (command.data && 'execute' in command) {
                    commands.push(command.data.toJSON());
                    console.log(`[Deploy] تم العثور على الأمر: ${command.data.name}`);
                }
            } catch (error) {
                console.error(`[Deploy ERROR] فشل في تحميل ${fullPath}:`, error);
            }
        }
    }
}

// ابدأ تحميل الأوامر
loadCommands(commandsPath);

const rest = new REST().setToken(token);

(async () => {
    try {
        console.log(`بدء تسجيل ${commands.length} أمر سلاش.`);

        // هذا يسجل الأوامر للسيرفر المحدد فقط (أسرع للتجارب)
        const data = await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log(`✅ تم تسجيل ${data.length} أمر بنجاح.`);
    } catch (error) {
        console.error(error);
    }
})();