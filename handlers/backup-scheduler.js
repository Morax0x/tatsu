const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

// 🔒 إعدادات المالك والمسارات
const OWNER_ID = "1145327691772481577";

// ⚠️ تأكد أن اسم الملف يطابق الموجود عندك (mainDB.sqlite أو database.sqlite)
const DB_FILENAME = 'mainDB.sqlite'; 
const DB_PATH = path.join(process.cwd(), DB_FILENAME);

module.exports = (client) => {
    // الجدولة: كل يوم الساعة 12 منتصف الليل بتوقيت السعودية
    cron.schedule('0 0 * * *', async () => {
        console.log("[Auto-Backup] 🕛 بدأ وقت النسخ الاحتياطي التلقائي...");

        // 1. خطوة أمان: حفظ البيانات من الذاكرة للملف (WAL Checkpoint)
        // بدون هذا السطر، قد يصلك ملف فارغ أو ناقص!
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
            // نحاول إرسال رسالة خطأ للمالك
            try {
                const owner = await client.users.fetch(OWNER_ID);
                if(owner) owner.send(`🚨 **تنبيه هام:** فشل النسخ الاحتياطي لأن ملف قاعدة البيانات غير موجود!`);
            } catch(e) {}
            return;
        }

        // 3. محاولة جلب قناة النسخ (المحفوظة بأمر sss)
        let backupChannelID = null;
        try {
            // نستخدم bot_config لأنك أنشأته بأمر sss
            const row = client.sql.prepare("SELECT value FROM bot_config WHERE key = 'backup_channel'").get();
            if (row) backupChannelID = row.value;
        } catch (e) {
            console.log("[Auto-Backup] لم يتم العثور على إعداد القناة في الجدول.");
        }

        // تجهيز الملف والرسالة
        const attachment = new AttachmentBuilder(DB_PATH, { name: `Daily-${new Date().toISOString().split('T')[0]}.sqlite` });
        const timestamp = Math.floor(Date.now() / 1000);
        
        let sent = false; // متغير لتتبع هل تم الإرسال أم لا

        // 4. المحاولة الأولى: الإرسال للقناة (إذا وجدت)
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
                sent = false; // نؤكد الفشل عشان يروح للخاص
            }
        }

        // 5. المحاولة الثانية (الإجبارية): الإرسال لخاص المالك
        // يتم تنفيذ هذا الشرط إذا لم يتم تحديد قناة، أو إذا فشل الإرسال للقناة
        if (!sent) {
            console.log("[Auto-Backup] ⚠️ جاري التحويل للخاص (Fallback)...");
            try {
                const owner = await client.users.fetch(OWNER_ID);
                if (owner) {
                    await owner.send({ 
                        content: `⚠️ **تنبيه النسخ الاحتياطي**\nلم أتمكن من الإرسال للروم المحدد (أو لم يتم تحديده)، لذا أرسلت النسخة هنا لضمان عدم ضياع البيانات.\n\n📆 <t:${timestamp}:F>`, 
                        files: [attachment] 
                    });
                    console.log("[Auto-Backup] ✅ تم الإرسال لخاص المالك بنجاح.");
                }
            } catch (err) {
                console.error(`[Auto-Backup] ❌ كارثة: فشل الإرسال حتى للمالك! الخاص مقفل؟ الخطأ: ${err.message}`);
            }
        }
    }, {
        scheduled: true,
        timezone: "Asia/Riyadh" // 🇸🇦 توقيت السعودية مهم عشان الساعة 12 تكون 12 عندك مو بالسيرفر
    });
};
