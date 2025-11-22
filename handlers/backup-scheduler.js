const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

// 🔒 إعدادات المالك والمسارات
const OWNER_ID = "1145327691772481577";

// ⚠️ تأكد أن اسم الملف يطابق الموجود عندك
const DB_FILENAME = 'mainDB.sqlite'; 
const DB_PATH = path.join(process.cwd(), DB_FILENAME);

module.exports = (client) => {
    // الجدولة: كل يوم الساعة 12 منتصف الليل بتوقيت السعودية
    cron.schedule('0 0 * * *', async () => {
        console.log("[Auto-Backup] 🕛 بدأ وقت النسخ الاحتياطي التلقائي...");

        // 1. خطوة أمان: حفظ البيانات من الذاكرة للملف (WAL Checkpoint)
        if (client.sql && client.sql.open) {
            try {
                client.sql.pragma('wal_checkpoint(RESTART)');
                console.log("[Auto-Backup] ✅ تم عمل Checkpoint (حفظ الذاكرة).");
            } catch (e) {
                console.error("[Auto-Backup] ⚠️ تحذير Checkpoint:", e.message);
            }
        }

        // 2. التأكد من وجود الملف
        if (!fs.existsSync(DB_PATH)) {
            console.error(`[Auto-Backup] ❌ ملف القاعدة غير موجود في المسار: ${DB_PATH}`);
            return;
        }

        // 3. محاولة جلب قناة النسخ (المحفوظة بأمر sss)
        let backupChannelID = null;
        try {
            const row = client.sql.prepare("SELECT value FROM bot_config WHERE key = 'backup_channel'").get();
            if (row) backupChannelID = row.value;
        } catch (e) {
            console.log("[Auto-Backup] لم يتم العثور على إعداد القناة في الجدول.");
        }

        const attachment = new AttachmentBuilder(DB_PATH, { name: `Daily-${new Date().toISOString().split('T')[0]}.sqlite` });
        const timestamp = Math.floor(Date.now() / 1000);
        
        let sent = false; 

        // 4. المحاولة الأولى: الإرسال للقناة
        if (backupChannelID) {
            try {
                const channel = await client.channels.fetch(backupChannelID);
                if (channel) {
                    await channel.send({ 
                        content: `🛡️ **نسخة احتياطية تلقائية**\n📆 التاريخ: <t:${timestamp}:F>\n✅ الحالة: تم الحفظ بنجاح.`, 
                        files: [attachment] 
                    });
                    console.log(`[Auto-Backup] ✅ تم الإرسال للقناة: ${channel.name}`);
                    sent = true;
                }
            } catch (err) {
                console.error(`[Auto-Backup] ❌ فشل الإرسال للقناة: ${err.message}`);
                sent = false; 
            }
        }

        // 5. المحاولة الثانية (الإجبارية): الإرسال لخاص المالك
        if (!sent) {
            console.log("[Auto-Backup] ⚠️ جاري التحويل للخاص (Fallback)...");
            try {
                const owner = await client.users.fetch(OWNER_ID);
                if (owner) {
                    await owner.send({ 
                        content: `⚠️ **تنبيه النسخ الاحتياطي**\nلم أتمكن من الإرسال للروم المحدد، لذا أرسلت النسخة هنا.\n📆 <t:${timestamp}:F>`, 
                        files: [attachment] 
                    });
                    console.log("[Auto-Backup] ✅ تم الإرسال لخاص المالك بنجاح.");
                }
            } catch (err) {
                console.error(`[Auto-Backup] ❌ كارثة: فشل الإرسال حتى للمالك!`);
            }
        }
    }, {
        scheduled: true,
        timezone: "Asia/Riyadh" 
    });
};
