const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const https = require('https');
const path = require('path');

// حدد المسار الرئيسي للمشروع
const rootDir = process.cwd();
const dbPath = path.join(rootDir, 'mainDB.sqlite');
const walPath = path.join(rootDir, 'mainDB.sqlite-wal');
const shmPath = path.join(rootDir, 'mainDB.sqlite-shm');
const tempPath = path.join(rootDir, 'temp_upload.sqlite');

// ضع الايدي الخاص بك هنا للأمان القصوى
const OWNER_ID = "1145327691772481577"; 

module.exports = {
    data: new SlashCommandBuilder()
        .setName('up')
        .setDescription('رفع واستبدال قاعدة البيانات (للمالك فقط).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addAttachmentOption(option => 
            option.setName('ملف_القاعدة')
                .setDescription('ارفع ملف mainDB.sqlite الجديد')
                .setRequired(true)),

    name: 'up',
    category: "Admin",
    description: "رفع قاعدة البيانات",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;

        // 1. التحقق من المالك
        if (interaction.user.id !== OWNER_ID) {
            return interaction.reply({ content: "❌ هذا الأمر مخصص لمالك البوت فقط.", ephemeral: true });
        }

        const attachment = interaction.options.getAttachment('ملف_القاعدة');

        // 2. التحقق من صيغة الملف
        if (!attachment.name.endsWith('.sqlite')) {
            return interaction.reply({ content: "⚠️ الملف يجب أن يكون بصيغة `.sqlite` (مثال: `mainDB.sqlite`).", ephemeral: true });
        }

        await interaction.reply({ content: "⏳ **جاري تحميل الملف الجديد...**", ephemeral: true });

        // 3. تنزيل الملف الجديد كملف مؤقت
        const file = fs.createWriteStream(tempPath);
        
        https.get(attachment.url, function(response) {
            response.pipe(file);

            file.on('finish', async function() {
                file.close(async () => {
                    
                    try {
                        await interaction.editReply("🛑 **جاري إيقاف الاتصال واستبدال الملفات...**");

                        // 4. إغلاق الاتصال الحالي بقاعدة البيانات (خطوة حرجة لفك القفل)
                        if (interaction.client.sql) {
                            try {
                                interaction.client.sql.close();
                                console.log("[Database] Connection closed manually for update.");
                            } catch (e) {
                                console.log("[Database] Connection was already closed or failed to close.");
                            }
                        }

                        // انتظار بسيط لضمان تحرير الملفات من النظام
                        await new Promise(resolve => setTimeout(resolve, 1000));

                        // 5. حذف الملفات القديمة والملفات المؤقتة (WAL/SHM)
                        // استخدام try-catch لتجنب توقف الكود إذا الملف غير موجود
                        try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath); } catch(e) {}
                        try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath); } catch(e) {}
                        try { if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); } catch(e) {}

                        // 6. وضع الملف الجديد مكانه
                        fs.renameSync(tempPath, dbPath);
                        console.log("[Database] File replaced successfully.");

                        await interaction.editReply("✅ **تم التحديث بنجاح!**\n🔄 **جاري إعادة تشغيل البوت الآن لتطبيق البيانات...**");

                        // 7. قتل العملية لإجبار الاستضافة (Railway) على إعادة التشغيل بملف نظيف
                        console.log("[System] Restarting due to DB update...");
                        process.exit(0); 

                    } catch (err) {
                        console.error(err);
                        await interaction.editReply(`❌ **حدث خطأ كارثي أثناء الاستبدال:**\n\`${err.message}\`\n*يرجى مراجعة ملفات الاستضافة يدوياً.*`);
                        // محاولة تنظيف الملف المؤقت إن وجد
                        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    }
                });
            });
        }).on('error', async (err) => {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await interaction.editReply(`❌ فشل تحميل الملف من ديسكورد: ${err.message}`);
        });
    },
};
