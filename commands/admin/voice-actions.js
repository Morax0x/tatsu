const { SlashCommandBuilder, PermissionsBitField, ActivityType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صوت')
        .setDescription('التحكم في تواجد البوت الصوتي.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('دخول').setDescription('إدخال البوت للقناة الصوتية (24/7) بوضع البث.'))
        .addSubcommand(sub => sub.setName('خروج').setDescription('إخراج البوت من القناة الصوتية.')),

    name: 'voice',
    category: "Admin",
    description: "التحكم في البوت الصوتي",

    async execute(interaction) {
        // دعم هجين (سلاش وبريفكس)
        const isSlash = !!interaction.isChatInputCommand;
        let member, guild, client;

        if (isSlash) {
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            await interaction.deferReply({ ephemeral: true });
        } else {
            return; 
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'دخول') {
            const channel = member.voice.channel;
            if (!channel) return interaction.editReply("❌ يجب أن تكون في قناة صوتية أولاً.");

            try {
                // 1. الانضمام للقناة
                const connection = joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: false, // ( 🌟 إلغاء الديفن - يسمع )
                    selfMute: false  // ( 🌟 إلغاء الميوت - المايك مفتوح )
                });

                // 2. تغيير حالة البوت إلى "Streaming" (خدعة البث)
                client.user.setPresence({
                    activities: [{ 
                        name: "سيرفر الامبراطورية", // الاسم اللي يظهر في البث
                        type: ActivityType.Streaming, 
                        url: "https://www.twitch.tv/discord" // رابط وهمي لتفعيل اللون البنفسجي
                    }],
                    status: 'online'
                });

                return interaction.editReply(`✅ **تم الدخول!**\n- القناة: ${channel.name}\n- المايك: مفتوح 🎙️\n- السماعة: مفتوحة 🔊\n- الحالة: بث مباشر 🟣`);
            
            } catch (error) {
                console.error(error);
                return interaction.editReply("❌ حدث خطأ في الاتصال.");
            }
        }

        if (sub === 'خروج') {
            const connection = getVoiceConnection(guild.id);
            if (!connection) return interaction.editReply("❌ أنا لست في قناة صوتية.");
            
            connection.destroy();
            
            // إرجاع الحالة إلى طبيعتها
            client.user.setPresence({
                activities: [],
                status: 'online'
            });

            return interaction.editReply("✅ تم الخروج وإلغاء وضع البث.");
        }
    },
};
