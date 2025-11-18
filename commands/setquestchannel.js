const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-قناة-المهام')
        .setDescription('تعيين القناة التي سيتم إرسال إشعارات المهام والإنجازات واللفل فيها.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
            .setDescription('اختر القناة')
            .setRequired(true)),

    name: 'setquestchannel',
    aliases: ['sqc', 'setach', 'تحديد-قناة'],
    category: "Admin",
    description: 'تعيين القناة التي سيتم إرسال إشعارات المهام والإنجازات فيها.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, user, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            user = interaction.user;
            channel = interaction.options.getChannel('القناة');
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            user = message.author;
            channel = message.mentions.channels.first() || guild.channels.cache.get(args[0]);
        }

        const sql = client.sql;
        const reply = async (content, embeds = []) => {
            const payload = { content: content || null, embeds: embeds, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        // 1. التحقق من الصلاحيات
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | تحتاج صلاحية `ManageGuild` لاستخدام هذا الأمر.');
        }

        // 2. التحقق من القناة
        if (!channel) return reply('❌ | يرجى تحديد قناة صحيحة.');
        if (!channel.isTextBased()) return reply('❌ | يجب أن تكون القناة نصية.');

        // 3. التحقق من صلاحيات البوت في القناة المختارة
        const botPerms = channel.permissionsFor(guild.members.me);
        if (!botPerms.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.AttachFiles])) {
            return reply(`⚠️ | ليس لدي صلاحيات كافية في ${channel}. تأكد من إعطائي: \`Send Messages\`, \`View Channel\`, \`Attach Files\`.`);
        }

        try {
            // 4. إنشاء الجدول وتحديث البيانات (Upsert)
            sql.prepare(`CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, questChannelID TEXT)`).run();
            
            // محاولة إضافة العمود إذا كان الجدول قديماً وموجوداً
            try { sql.prepare("ALTER TABLE settings ADD COLUMN questChannelID TEXT;").run(); } catch (e) {}

            // الحفظ
            sql.prepare("INSERT INTO settings (guild, questChannelID) VALUES (?, ?) ON CONFLICT(guild) DO UPDATE SET questChannelID = excluded.questChannelID").run(guild.id, channel.id);

            // 5. الرد بالنجاح
            const successEmbed = new EmbedBuilder()
                .setColor("Green")
                .setDescription(`✅ **تم إعداد قناة المهام بنجاح!**\nسيتم إرسال التنبيهات في: ${channel}`);
            
            await reply(null, [successEmbed]);

            // 6. رسالة تجريبية للقناة
            const welcomeEmbed = new EmbedBuilder()
                .setColor("Gold")
                .setTitle('🏆 قناة الإنجازات والمهام')
                .setDescription('تم تعيين هذه القناة لاستقبال إشعارات:\n- 📜 المهام اليومية والأسبوعية\n- 🎖️ الإنجازات والأوسمة\n- 🆙 ارتفاع المستوى (Level Up)')
                .setFooter({ text: `بواسطة: ${user.username}` })
                .setTimestamp();

            await channel.send({ embeds: [welcomeEmbed] });

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ في قاعدة البيانات.');
        }
    }
};
