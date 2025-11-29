const { SlashCommandBuilder, ActivityType, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تغيير-الحالة')
        .setDescription('تغيير حالة البوت (الفقاعة).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option =>
            option.setName('النوع')
                .setDescription('نوع الحالة')
                .setRequired(true)
                .addChoices(
                    { name: 'Custom (فقاعة كلام 💬)', value: 'Custom' },
                    { name: 'Playing (يلعب)', value: 'Playing' },
                    { name: 'Watching (يشاهد)', value: 'Watching' },
                    { name: 'Listening (يستمع)', value: 'Listening' },
                    { name: 'Competing (يتنافس)', value: 'Competing' }
                ))
        .addStringOption(option =>
            option.setName('النص')
                .setDescription('اكتب الإيموجي (العادي) والنص هنا')
                .setRequired(true)),

    name: 'set-status',
    category: "Admin",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;

        const typeStr = interaction.options.getString('النوع');
        const content = interaction.options.getString('النص');

        let activityData;

        if (typeStr === 'Custom') {
            activityData = {
                name: content, 
                type: ActivityType.Custom, 
                state: content // (هنا يظهر النص والإيموجي داخل الفقاعة)
            };
        } else {
            let type;
            switch (typeStr) {
                case 'Playing': type = ActivityType.Playing; break;
                case 'Watching': type = ActivityType.Watching; break;
                case 'Listening': type = ActivityType.Listening; break;
                case 'Competing': type = ActivityType.Competing; break;
            }
            activityData = { name: content, type: type };
        }

        interaction.client.user.setPresence({
            activities: [activityData],
            status: 'online',
        });

        await interaction.reply({ content: `✅ تم التحديث!\nالنوع: **${typeStr}**\nالمحتوى: \`${content}\``, ephemeral: true });
    },
};
