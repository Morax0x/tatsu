const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, ChannelType, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('نشر-لوحة-المهام')
        .setDescription('إرسال لوحة المهام الدائمة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('الثيم')
            .setDescription('اختر الثيم (empire أو kingdom)')
            .setRequired(false)
            .addChoices(
                { name: 'Empire (امبراطورية)', value: 'empire' },
                { name: 'Kingdom (مملكة)', value: 'kingdom' }
            )),

    name: 'setup-quest-panel',
    aliases: ['sqp', 'لوحة-المهام'],
    category: "Admin",
    description: 'إرسال لوحة المهام الدائمة.',
    usage: '-setup-quest-panel [empire | kingdom]',
    permissions: ['ManageGuild'],

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;
        let theme;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            theme = interaction.options.getString('الثيم') || 'empire';
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
            theme = args[0] === 'kingdom' ? 'kingdom' : 'empire';
        }

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError('❌ ليس لديك صلاحية `إدارة السيرفر` لاستخدام هذا الأمر!');
        }

        if (channel.type !== ChannelType.GuildText) {
            return replyError('❌ يجب أن تكون القناة نصية.');
        }

        let description;

        if (theme === 'kingdom') {
            description = [
                "- في رحاب المملكة، لا يعلو شأن الفرد إلا بما يقدّمه من جهد ويثبته من أثــر  <a:NekoCool:1435572459276337245>",
                "",
                "ومن أجل ذلك أُقيم نظام الإنجازات ليكون سجلًا يُخلّد أعمال الرعايـا ويُظهر مراتبهم بين صفوف الممالك",
                "",
                "- افتح القـائمـة المنسدلـة لولوج القاعـة"
            ].join('\n');
        } else {
            description = [
                "- في رحاب الإمبراطورية، لا يعلو شأن الفرد إلا بما يقدّمه من جهد ويثبته من أثــر <a:NekoCool:1435572459276337245>",
                "",
                "ومن أجل ذلك أُقيم نظام الإنجازات ليكون سجلًا يُخلّد أعمال الرعايـا ويُظهر مراتبهم بين صفوف الإمبراطورية ",
                "",
                "- افتح القـائمـة المنسدلـة لولوج القاعـة"
            ].join('\n');
        }

        const embed = new EmbedBuilder()
            .setColor(0xC8A2C8) 
            .setTitle('✥ قـاعـة الانـجـازات')
            .setDescription(description)
            .setImage('https://i.postimg.cc/9F51dXXz/ambratwryt-alanmy.jpg');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`quest_panel_menu_${theme}`) 
            .setPlaceholder('- قـاعـة الانـجـازات ...')
            .addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('الانجـازات')
                    .setDescription('عرض جميع الإنجازات المتاحة في السيرفر.')
                    .setValue('panel_achievements')
                    .setEmoji('1435572459276337245'), 
                new StringSelectMenuOptionBuilder()
                    .setLabel('المـهـام اليـوميـة')
                    .setDescription('عرض المهام اليومية الخاصة بك وتقدمك فيها.')
                    .setValue('panel_daily_quests')
                    .setEmoji('1435658634750201876'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('المـهـام الاسبوعية')
                    .setDescription('عرض المهام الأسبوعية الخاصة بك وتقدمك فيها.')
                    .setValue('panel_weekly_quests')
                    .setEmoji('1435572430042042409'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('لـوحـة الـصدارة')
                    .setDescription('عرض أعلى الأعضاء في إكمال الإنجازات.')
                    .setValue('panel_top_achievements')
                    .setEmoji('1435572391190204447'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('انـجـازاتـي')
                    .setDescription('عرض الإنجازات التي قمت بإكمالها فقط.')
                    .setValue('panel_my_achievements')
                    .setEmoji('1437129108806176768'),
                new StringSelectMenuOptionBuilder()
                    .setLabel('الاشـعـارات')
                    .setDescription('التحكم في إشعارات المهام والإنجازات.')
                    .setValue('panel_notifications')
                    .setEmoji('🔔')
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        try {
            await channel.send({ embeds: [embed], components: [row] });

            if (isSlash) {
                await interaction.editReply({ content: '✅ تم نشر لوحة المهام.', ephemeral: true });
            } else {
                await message.delete().catch(console.error);
            }

        } catch (err) {
            console.error(err);
            await replyError('❌ حدث خطأ أثناء محاولة إرسال اللوحة.');
        }
    }
};