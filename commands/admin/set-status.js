const { SlashCommandBuilder, ActivityType, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تغيير-الحالة')
        .setDescription('تغيير حالة البوت (يظهر كفقاعة أو نشاط).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option =>
            option.setName('النوع')
                .setDescription('اختر Custom لتظهر الفقاعة')
                .setRequired(true)
                .addChoices(
                    { name: 'Custom (فقاعة كلام 💬)', value: 'Custom' }, // <-- هذا هو اللي تبيه
                    { name: 'Playing (يلعب)', value: 'Playing' },
                    { name: 'Watching (يشاهد)', value: 'Watching' },
                    { name: 'Listening (يستمع)', value: 'Listening' },
                    { name: 'Competing (يتنافس)', value: 'Competing' }
                ))
        .addStringOption(option =>
            option.setName('النص')
                .setDescription('الكلام اللي يظهر داخل الفقاعة')
                .setRequired(true)),

    name: 'set-status',
    category: "Admin",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;

        const typeStr = interaction.options.getString('النوع');
        const content = interaction.options.getString('النص');

        let activityData;

        if (typeStr === 'Custom') {
            // ( 🌟 هذا الكود هو اللي يطلع الفقاعة 🌟 )
            activityData = {
                name: content, 
                type: ActivityType.Custom, 
                state: content // (مهم جداً: النص لازم يكون هنا عشان يطلع فقاعة)
            };
        } else {
            // (للأنواع الثانية العادية)
            let type;
            switch (typeStr) {
                case 'Playing': type = ActivityType.Playing; break;
                case 'Watching': type = ActivityType.Watching; break;
                case 'Listening': type = ActivityType.Listening; break;
                case 'Competing': type = ActivityType.Competing; break;
            }
            activityData = { name: content, type: type };
        }

        // تطبيق الحالة
        interaction.client.user.setPresence({
            activities: [activityData],
            status: 'online',
        });

        await interaction.reply({ content: `✅ تم تغيير الحالة إلى: **${typeStr}**\n💬 النص: \`${content}\``, ephemeral: true });
    },
};
