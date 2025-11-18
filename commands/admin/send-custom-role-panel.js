const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionsBitField,
    SlashCommandBuilder,
} = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("نشر-لوحة-الرتب-المخصصة")
        .setDescription(
            "ينشر لوحة إنشاء الرتب المخصصة بناءً على الإعدادات المحفوظة.",
        )
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    name: "send-custom-role-panel",
    aliases: ["scrp", "sendrolepanel"],
    category: "Admin",
    description: "ينشر لوحة إنشاء الرتب المخصصة.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            if (isSlash)
                return interaction.editReply({ content, ephemeral: true });
            return message.reply({ content, ephemeral: true });
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        // --- ( 🌟 تم التعديل هنا: جلب الإعدادات من قاعدة البيانات 🌟 ) ---

        const settings = sql
            .prepare("SELECT * FROM settings WHERE guild = ?")
            .get(guild.id);

        if (!settings || !settings.customRolePanelTitle) {
            return replyError(
                "❌ لا يمكن نشر اللوحة. يرجى استخدام أمر `/اعدادات-لوحة-الرتب` لتحديد العنوان والوصف أولاً.",
            );
        }

        const title = settings.customRolePanelTitle;
        const description =
            settings.customRolePanelDescription || "الرجاء استخدام الأزرار.";
        // (تحويل اللون من #HEX إلى رقم)
        const color = settings.customRolePanelColor
            ? parseInt(settings.customRolePanelColor.replace("#", ""), 16)
            : 0x5d92ff;
        const image = settings.customRolePanelImage || null;

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setImage(image);
        // --- ( 🌟 نهاية التعديل 🌟 ) ---

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("customrole_create")
                .setLabel("انـشـاء رتـبـة")
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId("customrole_change_name")
                .setLabel("تـغـييـر الاسـم")
                .setStyle(ButtonStyle.Secondary),
        );
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("customrole_change_color")
                .setLabel("تغـييـر اللـون")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId("customrole_change_icon")
                .setLabel("تغييـر الصـورة")
                .setStyle(ButtonStyle.Secondary),
        );
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId("customrole_add_self")
                .setLabel("اضـافــة")
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId("customrole_remove_self")
                .setLabel("ازالـــة")
                .setStyle(ButtonStyle.Danger),
        );

        try {
            await channel.send({
                embeds: [embed],
                components: [row1, row2, row3],
            });

            if (isSlash) {
                await interaction.editReply({
                    content: "✅ تم نشر اللوحة.",
                    ephemeral: true,
                });
            } else {
                await message.delete().catch(() => {});
            }
        } catch (e) {
            console.error(e);
            await replyError("فشل نشر اللوحة. تأكد من صلاحيات البوت.");
        }
    },
};
