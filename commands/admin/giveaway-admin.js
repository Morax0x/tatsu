const { PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('قيفاواي')
        .setDescription('إرسال لوحة تحكم إنشاء قيفاواي جديد.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    name: 'giveaway',
    aliases: ['g-admin'],
    description: 'إرسال لوحة تحكم إنشاء قيفاواي جديد.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, channel;
        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            channel = interaction.channel;
        } else {
            message = interactionOrMessage;
            member = message.member;
            channel = message.channel;
        }

        const reply = async (payload) => {
            if (isSlash) {
                // أوامر السلاش لا تحتاج لـ ephemeral هنا لأنها لوحة تحكم
                return interaction.reply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            const errorPayload = { content: "❌ ليس لديك صلاحيات.", ephemeral: true };
            if (isSlash) {
                return interaction.reply(errorPayload);
            } else {
                return message.reply(errorPayload.content);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("✥ لوحة إنشاء قيفاواي ✥")
            .setDescription("قم بإدخال البيانات باستخدام الأزرار أدناه. الحقول الإجبارية (*) يجب تعبئتها قبل الإرسال.")
            .setColor("Grey")
            .addFields([
                { name: "الجائزة (*)", value: "لم تحدد", inline: true },
                { name: "المدة (*)", value: "لم تحدد", inline: true },
                { name: "الفائزون (*)", value: "لم تحدد", inline: true },
                { name: "الوصف", value: "لم يحدد", inline: true },
                { name: "القناة", value: "القناة الحالية", inline: true },
                { name: "المكافآت", value: "لا يوجد", inline: true },
            ]);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('g_builder_content')
                .setLabel('إعداد المحتوى (1)')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('g_builder_visuals')
                .setLabel('إعداد الشكل (2)')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('g_builder_send')
                .setLabel('إرسال القيفاواي')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true) // نبدأ وهو معطل
        );

        // إذا كان الأمر سلاش، الرد يكون مخفي (ephemeral)
        await reply({
            embeds: [embed],
            components: [row],
            ephemeral: isSlash 
        });
    }
};