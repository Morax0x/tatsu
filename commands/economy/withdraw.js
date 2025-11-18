const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
// const SQLite = require("better-sqlite3"); // ( 1 ) إزالة
// const sql = new SQLite('./mainDB.sqlite'); // ( 2 ) إزالة

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('سحب')
        .setDescription('سحب المورا من البنك إلى رصيدك (الكاش).')
        .addStringOption(option =>
            option.setName('المبلغ')
            .setDescription('المبلغ الذي تريد سحبه أو "all" / "الكل"')
            .setRequired(false)), // اختياري، إذا ترك فارغاً سيسحب الكل

    name: 'withdraw',
    aliases: ['سحب', 'with'],
    category: "Economy",
    cooldown: 0, 
    description: 'سحب المورا من البنك إلى رصيدك (الكاش).',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let amountArg;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            amountArg = interaction.options.getString('المبلغ');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            amountArg = args[0];
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
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

        const guildId = guild.id;

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let data = getScore.get(user.id, guildId);
        if (!data) {
             data = { ...client.defaultData, user: user.id, guild: guildId };
        }

        if (typeof data.mora === 'undefined') data.mora = 0;
        if (typeof data.bank === 'undefined') data.bank = 0;

        let amountToWithdraw;
        const userBank = data.bank || 0;


        if (!amountArg || amountArg.toLowerCase() === 'all' || amountArg.toLowerCase() === 'الكل') {
            amountToWithdraw = userBank;
        } else {
            amountToWithdraw = parseInt(amountArg.replace(/,/g, ''));
            if (isNaN(amountToWithdraw)) {
                 return replyError(`الاستخدام: \`/سحب <المبلغ | all>\` (المبلغ الذي أدخلته ليس رقماً).`);
            }
        }


        if (amountToWithdraw <= 0) {
            return replyError(`ليس لديك أي مورا في البنك لسحبها!`);
        }

        if (userBank < amountToWithdraw) {
            return replyError(`ليس لديك هذا المبلغ في البنك لسحبه! (رصيدك البنكي: ${userBank.toLocaleString()} ${EMOJI_MORA})`);
        }

        data.bank -= amountToWithdraw;
        data.mora += amountToWithdraw;

        setScore.run(data);

        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('💸 تمت عملية السحب')
            .setDescription(`تم سحب **${amountToWithdraw.toLocaleString()}** ${EMOJI_MORA} بنجاح!`)
            .addFields(
                { name: 'الرصيد (الكاش)', value: `${data.mora.toLocaleString()} ${EMOJI_MORA}`, inline: true },
                { name: 'رصيد البنك', value: `${data.bank.toLocaleString()} ${EMOJI_MORA}`, inline: true }
            )
            .setAuthor({ name: user.username, iconURL: user.displayAvatarURL() });

        await reply({ embeds: [embed] });
    }
};