const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// ( 1 ) تم حذف السطرين الخاصين بـ new SQLite

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('تحديد-قناة-الانجازات')
        .setDescription('يحدد القناة التي يتم إرسال إعلانات الإنجازات فيها.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('القناة')
            .setDescription('القناة التي ستستقبل الإشعارات')
            .setRequired(true)),
    // ---------------------------------

    name: 'set-achievement-channel',
    aliases: ['setachch', 'setach'],
    category: "Admin",
    description: 'يحدد القناة التي يتم إرسال إعلانات الإنجازات فيها.',

    async execute(interactionOrMessage, args) {

        // --- ( 3 ) إضافة معالج الأوامر الهجينة ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        // --- ( 4 ) إصلاح اتصال قاعدة البيانات ---
        const sql = client.sql;

        // --- ( 5 ) توحيد دوال الرد ---
        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; // جعل الرد عام
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        // ------------------------------------

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError("❌ ليس لديك صلاحيات إدارية لاستخدام هذا الأمر.");
        }

        // --- ( 6 ) توحيد جلب القناة ---
        let channel;
        if (isSlash) {
            channel = interaction.options.getChannel('القناة');
        } else {
            channel = message.mentions.channels.first() || guild.channels.cache.get(args[0]);
            if (!channel) {
                // (تحسين: منع الافتراض للقناة الحالية)
                return replyError("الاستخدام: `-setachch <#channel>`");
            }
        }
        // ------------------------------------

        try {
            // استخدام نفس عمود قاعدة البيانات (questChannelID) الذي تم إعداده بالفعل
            sql.prepare("INSERT OR REPLACE INTO settings (guild, questChannelID) VALUES (?, ?)")
               .run(guild.id, channel.id);

            await reply(`✅ تم تحديد قناة ${channel} كقناة رسمية لإعلانات الإنجازات.`);

        } catch (error) {
            console.error("خطأ في set-achievement-channel:", error);
            await replyError("❌ حدث خطأ أثناء تحديث الإعدادات.");
        }
    }
};