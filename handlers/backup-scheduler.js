const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');

const OWNER_ID = "1145327691772481577";
const DB_PATH = path.join(__dirname, '../database.sqlite');

module.exports = (client) => {
    // الجدولة: كل يوم الساعة 12 منتصف الليل بتوقيت السيرفر (0 0 * * *)
    cron.schedule('0 0 * * *', async () => {
        console.log("[Auto-Backup] بدء عملية النسخ الاحتياطي اليومي...");

        if (!fs.existsSync(DB_PATH)) {
            console.error("[Auto-Backup] ملف القاعدة غير موجود!");
            return;
        }

        const sql = client.sql;
        // جلب قناة النسخ من القاعدة
        let backupChannelID = null;
        try {
            const row = sql.prepare("SELECT backupChannelID FROM settings WHERE guild = ?").get('GLOBAL_BACKUP');
            if (row) backupChannelID = row.backupChannelID;
        } catch (e) {
            // الجدول غير موجود بعد
        }

        const attachment = new AttachmentBuilder(DB_PATH, { name: `backup-${new Date().toISOString().split('T')[0]}.sqlite` });
        const backupMessage = `🛡️ **نسخة احتياطية تلقائية**\n📆 التاريخ: <t:${Math.floor(Date.now() / 1000)}:D>`;

        let sent = false;

        // 1. المحاولة الأولى: الإرسال للقناة المحددة
        if (backupChannelID) {
            try {
                const channel = await client.channels.fetch(backupChannelID);
                if (channel) {
                    await channel.send({ content: backupMessage, files: [attachment] });
                    console.log("[Auto-Backup] تم الإرسال للقناة المحددة.");
                    sent = true;
                }
            } catch (err) {
                console.error(`[Auto-Backup] فشل الإرسال للقناة: ${err.message}`);
            }
        }

        // 2. المحاولة الثانية (Fallback): الإرسال لخاص المالك
        if (!sent) {
            try {
                const owner = await client.users.fetch(OWNER_ID);
                if (owner) {
                    await owner.send({ content: `⚠️ **تنبيه:** لم يتم تحديد قناة أو فشل الإرسال لها.\n${backupMessage}`, files: [attachment] });
                    console.log("[Auto-Backup] تم الإرسال لخاص المالك.");
                }
            } catch (err) {
                console.error(`[Auto-Backup] فشل الإرسال لخاص المالك: ${err.message}`);
            }
        }
    });
};