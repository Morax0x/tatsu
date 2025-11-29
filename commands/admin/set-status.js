const { SlashCommandBuilder, ActivityType, PermissionsBitField } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تغيير-الحالة')
        .setDescription('تغيير نشاط البوت (الفقاعة) وحالة الاتصال (اللون).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addStringOption(option =>
            option.setName('النوع')
                .setDescription('نوع النشاط (الفقاعة أو يلعب...)')
                .setRequired(true)
                .addChoices(
                    { name: 'Custom (فقاعة كلام 💬)', value: 'Custom' },
                    { name: 'Playing (يلعب 🎮)', value: 'Playing' },
                    { name: 'Watching (يشاهد 📺)', value: 'Watching' },
                    { name: 'Listening (يستمع 🎧)', value: 'Listening' },
                    { name: 'Competing (يتنافس 🏆)', value: 'Competing' },
                    { name: 'Streaming (بث مباشر 🟣)', value: 'Streaming' } // (ملاحظة: البث يتطلب رابطاً)
                ))
        .addStringOption(option =>
            option.setName('النص')
                .setDescription('الكلام الذي يظهر')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('الوضع')
                .setDescription('لون الدائرة (أخضر، أصفر، أحمر)')
                .setRequired(false) // اختياري (الافتراضي أخضر)
                .addChoices(
                    { name: 'Online (متصل 🟢)', value: 'online' },
                    { name: 'Idle (خامل 🟡)', value: 'idle' },
                    { name: 'Do Not Disturb (ممنوع الإزعاج 🔴)', value: 'dnd' },
                    { name: 'Invisible (مخفي ⚫)', value: 'invisible' }
                )),

    name: 'set-status',
    category: "Admin",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;

        const typeStr = interaction.options.getString('النوع');
        const content = interaction.options.getString('النص');
        const statusStr = interaction.options.getString('الوضع') || 'online'; // الافتراضي متصل

        let activityData;

        if (typeStr === 'Custom') {
            // حالة الفقاعة
            activityData = {
                name: content, 
                type: ActivityType.Custom, 
                state: content 
            };
        } else if (typeStr === 'Streaming') {
            // حالة البث (اللون البنفسجي)
            activityData = {
                name: content,
                type: ActivityType.Streaming,
                url: "https://www.twitch.tv/discord" // رابط وهمي لتفعيل اللون
            };
        } else {
            // الحالات العادية
            let type;
            switch (typeStr) {
                case 'Playing': type = ActivityType.Playing; break;
                case 'Watching': type = ActivityType.Watching; break;
                case 'Listening': type = ActivityType.Listening; break;
                case 'Competing': type = ActivityType.Competing; break;
            }
            activityData = { name: content, type: type };
        }

        // تطبيق النشاط + اللون
        interaction.client.user.setPresence({
            activities: [activityData],
            status: statusStr
        });

        await interaction.reply({ 
            content: `✅ **تم التحديث!**\n- النشاط: **${typeStr}**\n- النص: \`${content}\`\n- اللون: **${statusStr}**`, 
            ephemeral: true 
        });
    },
};
