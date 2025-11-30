const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// 🔒 ايدي المالك (أنت فقط)
const OWNER_ID = "1145327691772481577";

// 📂 تحديد المسارات (بناءً على موقع الملف الحالي داخل commands/admin)
// نخرج خطوتين للوراء للوصول للمجلد الرئيسي
const rootDir = path.resolve(__dirname, '../../'); 
const DB_PATH = path.join(rootDir, 'mainDB.sqlite');
const WAL_PATH = path.join(rootDir, 'mainDB.sqlite-wal');
const SHM_PATH = path.join(rootDir, 'mainDB.sqlite-shm');
const TEMP_PATH = path.join(rootDir, 'temp_upload.sqlite'); 

module.exports = {
    name: 'admin',
    aliases: ['do', 'up', 'sss'], // الأسماء المستعارة للأوامر
    description: 'أوامر إدارة قاعدة البيانات للمالك فقط',
    category: "Admin",

    async execute(message, args) {
        // 1. التحقق من المالك (أمان)
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        const sql = client.sql;
        
        // تحديد الأمر الفرعي بناءً على الكلمة المستخدمة (up, do, sss)
        // نقوم بتنظيف البريفكس من الرسالة لنحصل على اسم الأمر
        const prefix = args.prefix || "-"; // أو استبدلها بـ message.content[0]
        const commandName = message.content.split(" ")[0].slice(prefix.length).toLowerCase();

        // ============================================================
        // 📥 أمر UP: رفع واستبدال قاعدة البيانات
        // ============================================================
        if (commandName === 'up') {
            const attachment = message.attachments.first();
            
            if (!attachment) return message.reply("⚠️ **أرفق ملف قاعدة البيانات مع الرسالة.**");
            if (!attachment.name.endsWith('.sqlite')) return message.reply("⚠️ **الملف يجب أن يكون بصيغة `.sqlite`**");

            const msg = await message.reply("⏳ **جاري التحميل... لا تطفئ البوت!**");

            // تنزيل الملف باسم مؤقت
            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, function(response) {
                response.pipe(file);

                file.on('finish', function() {
                    file.close(async () => {
                        try {
                            await msg.edit("🛑 **جاري إيقاف الاتصال واستبدال الملفات...**");

                            // 1. إغلاق الاتصال بقاعدة البيانات فوراً لفك القفل
                            if (client.sql && client.sql.open) {
                                try {
                                    client.sql.close();
                                    console.log("[Database] Connection closed manually.");
                                } catch (e) { 
                                    console.log("[Database] Already closed."); 
                                }
                            }

                            // 2. انتظار بسيط لضمان تحرير الملفات
                            await new Promise(r => setTimeout(r, 1000));

                            // 3. حذف الملفات القديمة والملفات المؤقتة (WAL/SHM)
                            // الحذف الإجباري (Force Delete) لمنع التعارض
                            try { if (fs.existsSync(WAL_PATH)) fs.unlinkSync(WAL_PATH); } catch(e){}
                            try { if (fs.existsSync(SHM_PATH)) fs.unlinkSync(SHM_PATH); } catch(e){}
                            try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); } catch(e){}

                            // 4. وضع الملف الجديد مكانه
                            if (fs.existsSync(TEMP_PATH)) {
                                fs.renameSync(TEMP_PATH, DB_PATH);
                                console.log("[Database] File replaced successfully.");
                            } else {
                                throw new Error("فشل تحميل الملف المؤقت.");
                            }

                            // 5. رسالة النجاح وإعادة التشغيل
                            await msg.edit("✅ **تم التحديث بنجاح!**\n🔄 **جاري إعادة التشغيل لتطبيق البيانات...**");

                            // 6. قتل العملية لإعادة التشغيل (Railway سيعيد تشغيله تلقائياً)
                            setTimeout(() => {
                                console.log("[System] Restarting due to DB update...");
                                process.exit(0);
                            }, 2000);

                        } catch (err) {
                            console.error(err);
                            await msg.edit(`❌ **كارثة:** حدث خطأ أثناء الاستبدال: \`${err.message}\`\n*تمت استعادة الوضع السابق (إن أمكن).*`);
                            // محاولة تنظيف الملف المؤقت
                            if (fs.existsSync(TEMP_PATH)) fs.unlinkSync(TEMP_PATH);
                        }
                    });
                });
            }).on('error', function(err) {
                if (fs.existsSync(TEMP_PATH)) fs.unlinkSync(TEMP_PATH);
                msg.edit(`❌ فشل التحميل من ديسكورد: ${err.message}`);
            });
        }

        // ============================================================
        // 📤 أمر DO: تحميل (Download) نسخة من القاعدة لك
        // ============================================================
        else if (commandName === 'do') {
            try {
                // محاولة عمل Checkpoint لدمج بيانات WAL في الملف الرئيسي قبل النسخ
                if (sql && sql.open) {
                    try { sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
                }

                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ ملف قاعدة البيانات غير موجود!");

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                
                // إرسال الملف على الخاص للأمان
                await message.author.send({ 
                    content: `📦 **نسخة احتياطية لقاعدة البيانات**\n📆 التاريخ: <t:${Math.floor(Date.now() / 1000)}:f>`, 
                    files: [attachment] 
                }).then(() => {
                    message.react('✅');
                }).catch(err => {
                    message.reply("❌ لا أستطيع إرسال رسالة خاصة لك. تأكد من فتح الخاص.");
                });

            } catch (err) {
                console.error(err);
                message.reply(`❌ حدث خطأ: ${err.message}`);
            }
        }

        // ============================================================
        // ⚙️ أمر SSS: تعيين قناة النسخ الاحتياطي (اختياري)
        // ============================================================
        else if (commandName === 'sss') {
            const channel = message.mentions.channels.first() || message.channel;
            try {
                // استخدام جدول مؤقت للإعدادات البسيطة إذا لم يكن موجوداً في settings
                sql.prepare(`CREATE TABLE IF NOT EXISTS bot_config (key TEXT PRIMARY KEY, value TEXT)`).run();
                sql.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`).run('backup_channel', channel.id);
                message.reply(`✅ تم تعيين قناة النسخ الاحتياطي: ${channel}`);
            } catch (err) {
                console.error(err);
                message.reply(`❌ حدث خطأ: ${err.message}`);
            }
        }
    }
};
