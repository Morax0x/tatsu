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
                // في وضع WAL، نفضل عمل Checkpoint قبل النسخ لضمان أن كل البيانات داخل الملف الرئيسي
                if (sql && sql.open) {
                    try { sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
                }

                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ ملف قاعدة البيانات غير موجود!");

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                
                await message.author.send({ 
                    content: `📦 **نسخة احتياطية (WAL Checkpointed)**\n📆 التاريخ: <t:${Math.floor(Date.now() / 1000)}:f>`, 
                    files: [attachment] 
                });
                await message.react('✅');
            } catch (err) {
                console.error(err);
                message.reply(`❌ حدث خطأ: ${err.message}`);
            }
        }

        // --- [ أمر UP: رفع واستبدال القاعدة (الإصدار الآمن) ] ---
        else if (firstWord.includes('up')) {
            const attachment = message.attachments.first();
            if (!attachment) return message.reply("⚠️ أرفق ملف قاعدة البيانات.");
            if (!attachment.name.endsWith('.sqlite')) return message.reply("⚠️ الملف يجب أن ينتهي بـ .sqlite");

            const msg = await message.reply("⏳ **جاري التحميل... لا تطفئ البوت!**");

            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, function(response) {
                response.pipe(file);

                file.on('finish', function() {
                    file.close(async () => {
                        try {
                            await msg.edit("🛑 **جاري إيقاف القاعدة واستبدال الملفات...**");

                            // 1. إغلاق الاتصال بقاعدة البيانات فوراً
                            try {
                                if (message.client.sql && message.client.sql.open) {
                                    message.client.sql.close();
                                    console.log("Database Connection Closed.");
                                }
                            } catch (e) { console.log("Database already closed or error closing."); }

                            // 2. انتظار ثانية لفك قفل الملفات
                            await new Promise(r => setTimeout(r, 1000));

                            // 3. حذف الملفات القديمة والملفات المؤقتة (WAL/SHM)
                            // هذا يمنع تداخل البيانات القديمة مع الملف الجديد
                            try { if (fs.existsSync(WAL_PATH)) fs.unlinkSync(WAL_PATH); } catch(e){}
                            try { if (fs.existsSync(SHM_PATH)) fs.unlinkSync(SHM_PATH); } catch(e){}
                            try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); } catch(e){}

                            // 4. وضع الملف الجديد
                            fs.renameSync(TEMP_PATH, DB_PATH);
                            console.log("Database File Replaced.");

                            // 5. رسالة النجاح
                            await msg.edit("✅ **تم التحديث بنجاح!**\n⏳ **جاري إعادة التشغيل خلال 5 ثواني لضمان حفظ البيانات...**");

                            // 6. الانتظار 5 ثواني (مهم جداً في Replit)
                            // هذا يعطي وقتاً للنظام لكتابة الملف على القرص قبل قتل العملية
                            setTimeout(() => {
                                process.exit(1);
                            }, 5000);

                        } catch (err) {
                            console.error(err);
                            msg.edit(`❌ **كارثة:** حدث خطأ أثناء الاستبدال: ${err.message}\n*يرجى الرفع يدوياً.*`);
                        }
                    });
                });
            }).on('error', function(err) {
                if (fs.existsSync(TEMP_PATH)) fs.unlinkSync(TEMP_PATH);
                msg.edit(`❌ فشل التحميل: ${err.message}`);
            });
        }

        // --- [ أمر SSS ] ---
        else if (firstWord.includes('sss')) {
            const channel = message.mentions.channels.first() || message.channel;
            try {
                sql.prepare(`CREATE TABLE IF NOT EXISTS bot_config (key TEXT PRIMARY KEY, value TEXT)`).run();
                sql.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`).run('backup_channel', channel.id);
                message.reply(`✅ تم تعيين قناة النسخ: ${channel}`);
            } catch (err) {
                console.error(err);
            }
        }
    }
};
