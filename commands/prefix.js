const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");
// ( 1 ) تم حذف السطرين الخاصين بـ new SQlite

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('تغيير-البريفكس')
        .setDescription('تغيير البريفكس (البادئة) الخاصة بأوامر البوت.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addStringOption(option =>
            option.setName('البريفكس-الجديد')
            .setDescription('البريفكس الجديد الذي تريده (مثل ! أو $)')
            .setRequired(true)),
    // ---------------------------------

    name: 'prefix',
    aliases: ['set-prefix'],
    category: "Admin", // ( 3 ) تم التغيير إلى فئة الادمن
    description: "Set server prefix",
    cooldown: 3,

    async execute (interactionOrMessage, args) {

        // --- ( 4 ) إضافة معالج الأوامر الهجينة ---
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

        // --- ( 5 ) إصلاح اتصال قاعدة البيانات ---
        const sql = client.sql;

        // --- ( 6 ) توحيد دوال الرد ---
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

        if(!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError(`You do not have permission to use this command!`);
        }

        // --- ( 7 ) توحيد جلب المدخلات ---
        let newPrefix;
        if (isSlash) {
            newPrefix = interaction.options.getString('البريفكس-الجديد');
        } else {
            newPrefix = args[0];
        }
        // ------------------------------------

        const currentPrefixResult = sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(guild.id);
        const currentPrefix = currentPrefixResult ? currentPrefixResult.serverprefix : null;

        if(!newPrefix) {
            return replyError(`Please provide a new prefix!`);
        }

        if(newPrefix === currentPrefix) {
            return replyError(`That is already the prefix!`);
        }

        sql.prepare("INSERT OR REPLACE INTO prefix (serverprefix, guild) VALUES (?, ?);").run(newPrefix, guild.id);
        return reply(`Server prefix is now \`${newPrefix}\``);
    }
}