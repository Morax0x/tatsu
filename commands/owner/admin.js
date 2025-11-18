const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// 🔒 ايدي المالك
const OWNER_ID = "1145327691772481577";

// 📂 تحديد المسارات
const DB_DIR = path.join(__dirname, '../../'); 
const DB_PATH = path.join(DB_DIR, 'mainDB.sqlite');
const WAL_PATH = path.join(DB_DIR, 'mainDB.sqlite-wal');
const SHM_PATH = path.join(DB_DIR, 'mainDB.sqlite-shm');
const TEMP_PATH = path.join(DB_DIR, 'temp_upload.sqlite'); 

module.exports = {
    name: 'admin',
    aliases: ['do', 'up', 'sss'],
    description: 'أوامر إدارة قاعدة البيانات للمالك فقط',

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const sql = message.client.sql;
        const firstWord = message.content.split(" ")[0].toLowerCase();

        // --- [ أمر DO: تحميل القاعدة ] ---
        if (firstWord.includes('do')) {
            try {
                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ ملف قاعدة البيانات غير موجود!");

                const waitMsg = await message.reply("⏳ جاري تحضير النسخة الاحتياطية...");

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                
                await message.author.send({ 
                    content: `📦 **نسخة احتياطية يدوية**\n📆 التاريخ: <t:${Math.floor(Date.now() / 1000)}:f>`, 
                    files: [attachment] 
                });
                
                await waitMsg.delete();
                await message.react('✅');
            } catch (err) {
                console.error(err);
                message.reply(`❌ حدث خطأ أثناء إرسال القاعدة: ${err.message}`);
            }
        }

        // --- [ أمر UP: رفع واستبدال القاعدة ] ---
        else if (firstWord.includes('up')) {
            const attachment = message.attachments.first();
            if (!attachment) return message.reply("⚠️ الرجاء إرفاق ملف قاعدة البيانات الجديد.");
            if (!attachment.name.endsWith('.sqlite')) return message.reply("⚠️ يجب أن يكون الملف بصيغة `.sqlite`.");

            const msg = await message.reply("⏳ جاري تحميل الملف الجديد...");

            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, function(response) {
                response.pipe(file);

                file.on('finish', function() {
                    file.close(async () => {
                        try {
                            await msg.edit("🔄 جاري استبدال القاعدة وتنظيف الملفات المؤقتة...");

                            // 1. إغلاق الاتصال الحالي
                            if (message.client.sql && message.client.sql.open) {
                                message.client.sql.close();
                                console.log("Database connection closed.");
                            }

                            // 2. حذف ملفات الـ WAL/SHM القديمة
                            if (fs.existsSync(WAL_PATH)) fs.unlinkSync(WAL_PATH);
                            if (fs.existsSync(SHM_PATH)) fs.unlinkSync(SHM_PATH);

                            // 3. استبدال الملف الرئيسي
                            if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
                            fs.renameSync(TEMP_PATH, DB_PATH);

                            console.log("✅ Database replaced successfully.");
                            
                            // 4. 🌟 إرسال رسالة النجاح والانتظار قليلاً 🌟
                            await msg.edit("✅ **تم تحديث قاعدة البيانات بنجاح!**\n🔄 جاري إعادة تشغيل البوت الآن...");
                            
                            // انتظار ثانية واحدة لضمان وصول الرسالة لديسكورد قبل الموت
                            await new Promise(resolve => setTimeout(resolve, 1000));

                            // 5. إعادة التشغيل
                            process.exit(1); 

                        } catch (err) {
                            console.error(err);
                            msg.edit(`❌ حدث خطأ فادح أثناء الاستبدال: ${err.message}`);
                            // محاولة إعادة التشغيل للطوارئ
                            setTimeout(() => process.exit(1), 2000);
                        }
                    });
                });
            }).on('error', function(err) {
                if (fs.existsSync(TEMP_PATH)) fs.unlinkSync(TEMP_PATH);
                msg.edit(`❌ فشل التحميل: ${err.message}`);
            });
        }

        // --- [ أمر SSS: تعيين قناة النسخ ] ---
        else if (firstWord.includes('sss')) {
            const channel = message.mentions.channels.first() || message.channel;
            try {
                sql.prepare(`CREATE TABLE IF NOT EXISTS bot_config (key TEXT PRIMARY KEY, value TEXT)`).run();
                sql.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`).run('backup_channel', channel.id);
                message.reply(`✅ **تم الحفظ:** سيتم إرسال النسخة الاحتياطية يومياً في: ${channel}`);
            } catch (err) {
                console.error(err);
                message.reply("❌ حدث خطأ في قاعدة البيانات.");
            }
        }
    }
};
