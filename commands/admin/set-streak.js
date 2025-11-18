const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
const { updateNickname } = require("../../streak-handler.js"); // <-- تم التصحيح هنا

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-الستريك')
        .setDescription('يحدد ستريك مستخدم معين يدوياً.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد تعديل الستريك له')
            .setRequired(true))
        .addIntegerOption(option =>
            option.setName('العدد')
            .setDescription('العدد الجديد للستريك')
            .setRequired(true)
            .setMinValue(0)),

    name: 'set-streak',
    aliases: ['setstreak'],
    category: "Admin",
    description: "يحدد ستريك مستخدم معين يدوياً.",

    async execute(interactionOrMessage, args) {

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

        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; 
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        let user; 
        let count;

        if (isSlash) {
            user = interaction.options.getMember('المستخدم');
            count = interaction.options.getInteger('العدد');
        } else {
            user = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
            count = parseInt(args[1]);
        }

        if (!user || isNaN(count) || count < 0) {
            return replyError("الاستخدام: `/تحديد-الستريك <@user> <العدد>`");
        }

        const getStreak = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?");
        const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield);");

        let streakData = getStreak.get(guild.id, user.id);

        if (!streakData) {
            streakData = {
                id: `${guild.id}-${user.id}`,
                guildID: guild.id,
                userID: user.id,
                streakCount: count,
                lastMessageTimestamp: Date.now(),
                hasGracePeriod: 1,
                hasItemShield: 0
            };
        } else {
            streakData.streakCount = count;
            streakData.lastMessageTimestamp = Date.now();
        }

        setStreak.run(streakData);
        await updateNickname(user, count);

        return reply(`تم تحديد ستريك ${user.toString()} إلى **${count}🔥**.`);
    }
};