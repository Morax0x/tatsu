const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection } = require('@discordjs/voice');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صوت')
        .setDescription('التحكم في تواجد البوت الصوتي.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub.setName('دخول').setDescription('إدخال البوت للقناة الصوتية (24/7).'))
        .addSubcommand(sub => sub.setName('خروج').setDescription('إخراج البوت من القناة الصوتية.')),

    name: 'voice',
    category: "Admin",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;
        
        const sub = interaction.options.getSubcommand();
        const member = interaction.member;
        const guild = interaction.guild;

        if (sub === 'دخول') {
            const channel = member.voice.channel;
            if (!channel) return interaction.reply({ content: "❌ يجب أن تكون في قناة صوتية أولاً.", ephemeral: true });

            try {
                joinVoiceChannel({
                    channelId: channel.id,
                    guildId: guild.id,
                    adapterCreator: guild.voiceAdapterCreator,
                    selfDeaf: true,
                    selfMute: true
                });
                return interaction.reply({ content: `✅ تم الدخول إلى **${channel.name}**. سأبقى هنا حتى تطردني!`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: "❌ حدث خطأ في الاتصال.", ephemeral: true });
            }
        }

        if (sub === 'خروج') {
            const connection = getVoiceConnection(guild.id);
            if (!connection) return interaction.reply({ content: "❌ أنا لست في قناة صوتية.", ephemeral: true });
            connection.destroy();
            return interaction.reply({ content: "✅ تم الخروج.", ephemeral: true });
        }
    },
};
