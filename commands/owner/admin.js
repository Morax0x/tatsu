const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const https = require('https');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('up')
        .setDescription('رفع نسخة احتياطية لقاعدة البيانات (للمالك فقط).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addAttachmentOption(option => 
            option.setName('ملف_القاعدة')
                .setDescription('ملف mainDB.sqlite')
                .setRequired(true)),

    name: 'up',
    category: "Admin",
    description: "رفع قاعدة البيانات",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let message, attachmentUrl, client;

        if (isSlash) {
            await interactionOrMessage.deferReply({ ephemeral: true });
            client = interactionOrMessage.client;
            const attachment = interactionOrMessage.options.getAttachment('ملف_القاعدة');
            attachmentUrl = attachment.url;
        } else {
            message = interactionOrMessage;
            client = message.client;
            if (message.attachments.size === 0) return message.reply("❌ لم تقم بإرفاق ملف.");
            attachmentUrl = message.attachments.first().url;
        }

        // التحقق من المالك (أمان)
        // (ضع آيديك هنا أو اعتمد على الصلاحيات، يفضل آيديك للأمان القصوى)
        const OWNER_ID = "1145327691772481577"; 
        const authorId = isSlash ? interactionOrMessage.user.id : message.author.id;
        
        if (authorId !== OWNER_ID) {
            const msg = "❌ هذا الأمر للمالك فقط.";
            return isSlash ? interactionOrMessage.editReply(msg) : message.reply(msg);
        }

        const reply = async (msg) => isSlash ? interactionOrMessage.editReply(msg) : message.reply(msg);

        await reply("⏳ **جاري إغلاق الاتصال الآمن بقاعدة البيانات للبدء...**");

        try {
            // 1. إغلاق قاعدة البيانات لفك القفل (أهم خطوة)
            if (client.sql && client.sql.open) {
                client.sql.close();
                console.log("[Database] Connection closed for update.");
            }
        } catch (e) {
            console.error("Error closing DB:", e);
        }

        // 2. حذف الملفات المؤقتة القديمة (تنظيف WAL Mode)
        try {
            if (fs.existsSync('./mainDB.sqlite-wal')) fs.unlinkSync('./mainDB.sqlite-wal');
            if (fs.existsSync('./mainDB.sqlite-shm')) fs.unlinkSync('./mainDB.sqlite-shm');
        } catch (e) { console.error("Error cleaning WAL files:", e); }

        // 3. تحميل الملف الجديد
        const file = fs.createWriteStream('./mainDB.sqlite');
        
        https.get(attachmentUrl, function(response) {
            response.pipe(file);

            file.on('finish', async function() {
                file.close(async () => {
                    await reply("✅ **تم استبدال القاعدة بنجاح!** جاري إعادة التشغيل لتطبيق التغييرات 🔄...");
                    
                    // 4. قتل العملية لإجبار إعادة التشغيل (Railway سيعيد تشغيله بملف جديد)
                    console.log("[System] Restarting due to DB upload...");
                    process.exit(0); 
                });
            });
        }).on('error', async (err) => {
            fs.unlink('./mainDB.sqlite', () => {}); // حذف الملف التالف
            await reply(`❌ حدث خطأ أثناء التحميل: ${err.message}`);
            // إعادة التشغيل الطارئة لإعادة فتح القاعدة القديمة إذا فشل التحميل
            process.exit(1); 
        });
    },
};
