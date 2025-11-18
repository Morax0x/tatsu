const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// 🔒 ايدي المالك فقط (أنت)
const OWNER_ID = "1145327691772481577";

// 📂 تحديد مسار القاعدة (يخرج مجلدين للخلف لأن الملف داخل commands/owner)
const DB_PATH = path.join(__dirname, '../../mainDB.sqlite'); 

module.exports = {
    name: 'admin',
    aliases: ['do', 'up', 'sss'], // اختصارات الأوامر
    description: 'أوامر إدارة قاعدة البيانات للمالك فقط',

    async execute(message, args) {
        // 1. الحماية: التأكد أن المرسل هو المالك
        if (message.author.id !== OWNER_ID) return;

        const sql = message.client.sql;

        // 2. اكتشاف الأمر المستخدم من الرسالة مباشرة (لضمان العمل مع أي بريفكس)
        // نأخذ أول كلمة، نحولها لصغيرة، ونتحقق مما تحتويه
        const firstWord = message.content.split(" ")[0].toLowerCase();

        // --- [ أمر DO: تحميل القاعدة ] ---
        // يتحقق إذا كانت الكلمة تحتوي على 'do' (مثل !do, #do, do)
        if (firstWord.includes('do')) {
            try {
                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ ملف قاعدة البيانات غير موجود!");

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                await message.author.send({ 
                    content: `📦 **نسخة احتياطية يدوية**\n📆 التاريخ: <t:${Math.floor(Date.now() / 1000)}:f>`, 
                    files: [attachment] 
                });
                await message.react('✅');
            } catch (err) {
                console.error(err);
                message.reply(`❌ حدث خطأ أثناء إرسال القاعدة: ${err.message}`);
            }
        }

        // --- [ أمر UP: رفع واستبدال القاعدة ] ---
        else if (firstWord.includes('up')) {
            const attachment = message.attachments.first();
            if (!attachment) return message.reply("⚠️ الرجاء إرفاق ملف قاعدة البيانات الجديد مع الأمر.");

            // تنزيل الملف
            message.reply("⏳ جاري تحميل الملف واستبدال القاعدة... سيتم إعادة التشغيل فوراً.");

            const file = fs.createWriteStream(DB_PATH);
            https.get(attachment.url, function(response) {
                response.pipe(file);
                file.on('finish', function() {
                    file.close(() => {
                        console.log("تم استبدال قاعدة البيانات بنجاح. جاري إعادة التشغيل...");
                        // هذا الأمر يقتل العملية، وسيقوم Replit أو السيرفر بإعادة تشغيل البوت تلقائياً
                        process.exit(1); 
                    });
                });
            }).on('error', function(err) {
                message.reply(`❌ فشل التحميل: ${err.message}`);
            });
        }

        // --- [ أمر SSS: تعيين قناة النسخ التلقائي ] ---
        else if (firstWord.includes('sss')) {
            const channel = message.mentions.channels.first() || message.channel;

            try {
                // إنشاء جدول إعدادات بسيط إذا لم يكن موجوداً
                sql.prepare(`CREATE TABLE IF NOT EXISTS bot_config (key TEXT PRIMARY KEY, value TEXT)`).run();

                // حفظ القناة
                sql.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`).run('backup_channel', channel.id);

                message.reply(`✅ **تم الحفظ:** سيتم إرسال النسخة الاحتياطية يومياً في: ${channel}`);
            } catch (err) {
                console.error(err);
                message.reply("❌ حدث خطأ في قاعدة البيانات.");
            }
        }
    }
};