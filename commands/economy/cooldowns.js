const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const SQLite = require("better-sqlite3");
const sql = new SQLite('./mainDB.sqlite');

const EMOJI_READY = '🟢';
const EMOJI_WAIT = '🔴';

function formatTimeSimple(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const COMMANDS_TO_CHECK = [
    { name: 'daily', db_column: 'lastDaily', cooldown: 22 * 60 * 60 * 1000, label: 'راتب' },
    { name: 'bank', db_column: 'lastInterest', cooldown: 24 * 60 * 60 * 1000, label: 'فوائد البنك' },
    { name: 'work', db_column: 'lastWork', cooldown: 1 * 60 * 60 * 1000, label: 'عمل' },
    { name: 'rob', db_column: 'lastRob', cooldown: 1 * 60 * 60 * 1000, label: 'سرقة' },
    { name: 'rps', db_column: 'lastRPS', cooldown: 1 * 60 * 60 * 1000, label: 'حجرة' },
    { name: 'guess', db_column: 'lastGuess', cooldown: 1 * 60 * 60 * 1000, label: 'تخمين' },
    { name: 'roulette', db_column: 'lastRoulette', cooldown: 1 * 60 * 60 * 1000, label: 'روليت' },
    { name: 'pvp', db_column: 'lastPVP', cooldown: 5 * 60 * 1000, label: 'تحدي' },
    { name: 'transfer', db_column: 'lastTransfer', cooldown: 5 * 60 * 1000, label: 'تحويل' },
    { name: 'deposit', db_column: 'lastDeposit', cooldown: 1 * 60 * 60 * 1000, label: 'إيداع' }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('وقت')
        .setDescription('يعرض الوقت المتبقي لاستخدام أوامر الاقتصاد.')
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('عرض أوقات مستخدم آخر (اختياري)')
            .setRequired(false)),

    name: 'gametime',
    aliases: ['وقت', 'وقت الالعاب', 'cooldown', 'cd'],
    category: "Economy",
    description: 'يعرض الوقت المتبقي لاستخدام أوامر الاقتصاد.',

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild;
        let targetUser;

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                client = interaction.client;
                guild = interaction.guild;
                targetUser = interaction.options.getUser('المستخدم') || interaction.user;
                await interaction.deferReply();
            } else {
                message = interactionOrMessage;
                client = message.client;
                guild = message.guild;
                // (أوامر البريفكس لهذا الأمر لا تدعم رؤية الآخرين، فقط منفذ الأمر)
                targetUser = message.author;
            }

            const reply = async (payload) => {
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.channel.send(payload);
                }
            };

            const getScore = client.getLevel;
            let data = getScore.get(targetUser.id, guild.id);
            if (!data) {
                data = { ...client.defaultData, user: targetUser.id, guild: guild.id };
            }

            const now = Date.now();
            const descriptionLines = [];

            for (const cmd of COMMANDS_TO_CHECK) {
                const lastUsed = data[cmd.db_column] || 0;
                const cooldownAmount = cmd.cooldown;
                const timeLeft = lastUsed + cooldownAmount - now;

                if (timeLeft > 0) {
                    descriptionLines.push(`${EMOJI_WAIT} **${cmd.label}**: \`${formatTimeSimple(timeLeft)}\``);
                } else {
                    descriptionLines.push(`${EMOJI_READY} **${cmd.label}**`);
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('⏱️ وقـت الألعـاب')
                .setColor("Random")
                .setAuthor({ name: targetUser.username, iconURL: targetUser.displayAvatarURL() })
                .setDescription(descriptionLines.join('\n'))
                .setImage('https://i.postimg.cc/7hhxXX8h/ec6f09156c21ff5df643e807a859d3e0.gif')
                .setTimestamp();

            await reply({ embeds: [embed] });

        } catch (error) {
            console.error("Error in gametime command:", error);
            const errorPayload = { content: "حدث خطأ أثناء جلب الأوقات.", ephemeral: true };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorPayload);
                } else {
                    await interaction.reply(errorPayload);
                }
            } else {
                message.reply(errorPayload.content);
            }
        }
    }
};