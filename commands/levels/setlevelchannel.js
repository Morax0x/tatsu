const { PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');

module.exports = {
    name: 'setlevelchannel',
    description: 'تحديد القناة التي سيتم إرسال رسائل الترقية (Level Up) فيها.',
    aliases: ['setlvlchannel', 'setlevel-channel', 'تحديد-روم-اللفل', 'روم-اللفل'],
    category: 'Admin', // تأكد من أن هذا التصنيف صحيح

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;

        // التحقق من صلاحيات الأدمن
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ ليس لديك صلاحيات إدارية لاستخدام هذا الأمر.");
        }

        const embed = new EmbedBuilder().setColor(Colors.Green).setTimestamp();

        // الخيار 1: إعادة التعيين إلى الوضع الافتراضي (الإرسال في نفس روم الرسالة)
        if (args[0] && (args[0].toLowerCase() === 'reset' || args[0].toLowerCase() === 'default' || args[0] === 'افتراضي' || args[0] === 'تصفير')) {
            try {
                sql.prepare("INSERT OR REPLACE INTO channel (guild, channel) VALUES (?, ?)")
                   .run(message.guild.id, 'Default');

                embed.setDescription("✅ تم إعادة تعيين إعدادات قناة الترقية. سيتم الآن إرسال الرسائل في نفس القناة التي يكتب فيها العضو.");
                return message.reply({ embeds: [embed] });
            } catch (err) {
                console.error("Error resetting level channel:", err);
                return message.reply("❌ حدث خطأ أثناء محاولة إعادة تعيين الإعدادات.");
            }
        }

        // الخيار 2: تحديد قناة جديدة
        const targetChannel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);

        if (!targetChannel) {
            embed.setColor(Colors.Red)
                 .setTitle("❌ خطأ في الاستخدام")
                 .setDescription("الرجاء منشن القناة أو وضع الـ ID الخاص بها.\n\n" +
                               "**للتحديد:**\n" +
                               "`-setlevelchannel #الروم`\n\n" +
                               "**لإعادة التعيين (الإرسال في نفس القناة):**\n" +
                               "`-setlevelchannel reset`");
            return message.reply({ embeds: [embed] });
        }

        // التأكد من أن البوت يستطيع الكتابة في القناة
        const botPermissions = targetChannel.permissionsFor(message.guild.members.me);
        if (!botPermissions.has(PermissionsBitField.Flags.SendMessages) || !botPermissions.has(PermissionsBitField.Flags.EmbedLinks)) {
            embed.setColor(Colors.Red)
                 .setDescription(`❌ ليس لدي صلاحيات \`SendMessages\` و \`EmbedLinks\` في القناة ${targetChannel}. الرجاء تعديل الصلاحيات أولاً.`);
            return message.reply({ embeds: [embed] });
        }

        // حفظ الإعدادات
        try {
            sql.prepare("INSERT OR REPLACE INTO channel (guild, channel) VALUES (?, ?)")
               .run(message.guild.id, targetChannel.id);

            embed.setDescription(`✅ تم تحديد قناة ${targetChannel} كقناة رسمية لرسائل الترقية (Level Up).`);
            await message.reply({ embeds: [embed] });

        } catch (err) {
            console.error("Error setting level channel:", err);
            return message.reply("❌ حدث خطأ أثناء حفظ الإعدادات في قاعدة البيانات.");
        }
    },
};