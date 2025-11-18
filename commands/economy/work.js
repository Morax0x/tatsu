const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const jobs = require('../../json/jobs.json');
const ownerID = "1145327691772481577";
const { calculateMoraBuff } = require('../../streak-handler.js');

const COOLDOWN_MS = 1 * 60 * 60 * 1000; // 1 ساعة

module.exports = {
    data: new SlashCommandBuilder()
        .setName('عمل')
        .setDescription('تعمل لتحصل على مورا.'),

    name: 'work',
    aliases: ['عمل', 'w'],
    category: "Economy",
    description: "تعمل لتحصل على مورا ",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            member = interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            member = message.member;
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
        const sql = client.sql;

        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let data = getScore.get(user.id, guildId);
        if (!data) {
            data = { ...client.defaultData, user: user.id, guild: guildId };
        }

        const now = Date.now();
        const timeLeft = (data.lastWork || 0) + COOLDOWN_MS - now;

        if (timeLeft > 0 && user.id !== ownerID) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 لقد عملت مؤخراً. يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        const baseAmount = Math.floor(Math.random() * (200 - 50 + 1)) + 50;
        const randomJob = jobs[Math.floor(Math.random() * jobs.length)];

        const moraMultiplier = calculateMoraBuff(member, sql);
        const finalAmount = Math.floor(baseAmount * moraMultiplier);

        data.mora = (data.mora || 0) + finalAmount;
        data.lastWork = now;

        setScore.run(data);

        const buffPercent = (moraMultiplier - 1) * 100;
        let buffString = "";

        if (buffPercent > 0) {
            buffString = ` (+${buffPercent.toFixed(0)}%)`;
        } else if (buffPercent < 0) {
            buffString = ` (${buffPercent.toFixed(0)}%)`;
        }

        const description = [
            `✥ بـدأت الـعـمـل كـ ${randomJob}`,
            `✶ حـصـلـت عـلـى ${finalAmount} <:mora:1435647151349698621>${buffString}`,
            `✐ ينتهي دوامك بعـد سـاعـة <a:HypedDance:1435572391190204447>`
        ].join('\n');

        const embed = new EmbedBuilder()
            .setColor("Random")
            .setAuthor({ name: `✶ عـمـل عـمـل !`, iconURL: user.displayAvatarURL() })
            .setDescription(description);

        await reply({ embeds: [embed] });
    }
};