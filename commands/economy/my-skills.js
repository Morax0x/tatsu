const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require("discord.js");
const SQLite = require("better-sqlite3");
const sql = new SQLite('./mainDB.sqlite');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مورا')
        .setDescription('يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('اضافة')
                .setDescription('إضافة مورا إلى رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم الذي تريد إضافة الرصيد له').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('المبلغ الذي تريد إضافته').setRequired(true).setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ازالة')
                .setDescription('إزالة مورا من رصيد مستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم الذي تريد إزالة الرصيد منه').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('المبلغ الذي تريد إزالته').setRequired(true).setMinValue(1)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('تحديد')
                .setDescription('تحديد رصيد المورا لمستخدم')
                .addUserOption(option => option.setName('المستخدم').setDescription('المستخدم الذي تريد تحديد رصيده').setRequired(true))
                .addIntegerOption(option => option.setName('المبلغ').setDescription('الرصيد الجديد').setRequired(true).setMinValue(0))),

    name: 'mora-admin',
    aliases: ['gm', 'set-mora'],
    // --- ( ⬇️ تم التعديل هنا ⬇️ ) ---
    category: "Admin",
    // --- ( ⬆️ نهاية التعديل ⬆️ ) ---
    description: "يضيف، يزيل، أو يحدد رصيد المورا لمستخدم معين.",

    async execute (interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, member, guild, client;
        let method, targetMember, amount;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;

            method = interaction.options.getSubcommand();
            targetMember = interaction.options.getMember('المستخدم');
            amount = interaction.options.getInteger('المبلغ');

            if (method === 'اضافة') method = 'add';
            else if (method === 'ازالة') method = 'remove';
            else if (method === 'تحديد') method = 'set';

            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;

            method = args[0] ? args[0].toLowerCase() : null; // add, remove, set
            targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[1]);
            amount = parseInt(args[2]);
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError(`⛔️ يجب أن تكون لديك صلاحية **Administrator** لاستخدام هذا الأمر!`);
        }

        if (!targetMember || isNaN(amount) || amount < 0 || (method !== 'add' && method !== 'remove' && method !== 'set')) {
            return replyError("الاستخدام الصحيح:\n" +
                               "`-gmora add <@user> <مبلغ>`\n" +
                               "`-gmora remove <@user> <مبلغ>`\n" +
                               "`-gmora set <@user> <مبلغ>`");
        }

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let data = getScore.get(targetMember.id, guild.id);

        if (!data) {
             data = { ...client.defaultData, user: targetMember.id, guild: guild.id };
        }

        data.mora = data.mora || 0;

        let finalAmount;
        let action;

        if (method === 'add') {
            data.mora += amount;
            finalAmount = data.mora;
            action = `تمت إضافة **${amount.toLocaleString()}** مورا.`;
        } else if (method === 'remove') {
            data.mora = Math.max(0, data.mora - amount); 
            finalAmount = data.mora;
            action = `تمت إزالة **${amount.toLocaleString()}** مورا.`;
        } else if (method === 'set') {
            data.mora = amount;
            finalAmount = data.mora;
            action = `تم تحديد الرصيد إلى **${amount.toLocaleString()}** مورا.`;
        }

        setScore.run(data);

        const embed = new EmbedBuilder()
            .setColor("DarkBlue")
            .setTitle(`💰 تحديث رصيد المورا لـ ${targetMember.displayName}`)
            .setDescription(`${action}`)
            .addFields({ name: 'الرصيد الجديد', value: `${finalAmount.toLocaleString()} <:mora:1435647151349698621>`, inline: true })
            .setFooter({ text: `تم التنفيذ بواسطة ${member.user.username}` })
            .setTimestamp();

        await reply({ embeds: [embed] });
    }
};