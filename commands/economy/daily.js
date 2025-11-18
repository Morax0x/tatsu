const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');

const COOLDOWN_MS = 22 * 60 * 60 * 1000;
const STREAK_BREAK_MS = 48 * 60 * 60 * 1000;

const REWARDS = {
    1: { min: 100, max: 150 },
    2: { min: 150, max: 200 },
    3: { min: 200, max: 300 },
    4: { min: 300, max: 450 },
    5: { min: 450, max: 600 },
    6: { min: 600, max: 800 },
    7: { min: 800, max: 1000 } 
};
const MAX_STREAK_DAY = 7;

function getRandomAmount(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('راتب')
        .setDescription('احصل على راتبك اليومي من المورا (مرة كل 22 ساعة).'),

    name: 'daily',
    aliases: ['راتب', 'يومي', 'd'],
    category: "Economy",
    description: "احصل على راتبك اليومي من المورا (مرة كل 22 ساعة).",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, client, guild, user, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            user = interaction.user;
            guild = interaction.guild;
            client = interaction.client;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            member = message.member;
            user = message.author;
            guild = message.guild;
            client = message.client;
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const sql = client.sql;
        const getScore = client.getLevel;
        const setScore = client.setLevel;

        let data = getScore.get(user.id, guild.id);
        if (!data) {
            data = { ...client.defaultData, user: user.id, guild: guild.id };
        }

        const now = Date.now();
        const timeLeft = (data.lastDaily || 0) + COOLDOWN_MS - now;

        if (timeLeft > 0) {
            const hours = Math.floor(timeLeft / 3600000);
            const minutes = Math.floor((timeLeft % 3600000) / 60000);
            const replyContent = `🕐 لا يمكنك استلام راتبك الآن. يرجى الانتظار **${hours} ساعة و ${minutes} دقيقة**.`;

            if (isSlash) {
                return interaction.editReply({ content: replyContent, ephemeral: true });
            } else {
                return message.reply(replyContent);
            }
        }

        const timeSinceLastDaily = now - (data.lastDaily || 0);
        let newStreak = data.dailyStreak || 0;

        if (timeSinceLastDaily > STREAK_BREAK_MS) {
            newStreak = 1;
        } else {
            newStreak += 1;
        }

        if (newStreak > MAX_STREAK_DAY) {
            newStreak = 1;
        }

        const rewardRange = REWARDS[newStreak] || REWARDS[MAX_STREAK_DAY];
        const baseAmount = getRandomAmount(rewardRange.min, rewardRange.max);

        const moraMultiplier = calculateMoraBuff(member, sql);
        const finalAmount = Math.floor(baseAmount * moraMultiplier);

        data.mora = (data.mora || 0) + finalAmount;
        data.lastDaily = now;
        data.dailyStreak = newStreak;

        setScore.run(data);

        let descriptionLines;
        let buffString = "";
        const buffPercent = (moraMultiplier - 1) * 100;

        if (buffPercent > 0) {
            buffString = ` (+${buffPercent.toFixed(0)}%)`;
        } else if (buffPercent < 0) {
            buffString = ` (${buffPercent.toFixed(0)}%)`;
        }

        if (newStreak === MAX_STREAK_DAY) {
            descriptionLines = [
                `✥ استلـمـت جـائـزتـك اليـوميـة`,
                `✶ حـصـلـت عـلـى **${finalAmount}** <:mora:1435647151349698621>${buffString}`,
                `🎉 **لقد وصلت الجائزة الكبرى!** (بين ${rewardRange.min} - ${rewardRange.max})`,
                `- أنت في اليوم **${newStreak}** على التوالـي!`
            ];
        } else {
            descriptionLines = [
                `✥ استلـمـت جـائـزتـك اليـوميـة`,
                `✶ حـصـلـت عـلـى **${finalAmount}** <:mora:1435647151349698621>${buffString}`,
                `- أنت في اليوم **${newStreak}** على التوالـي!`
            ];
        }

        const embed = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('💰 جـائـزتـك اليومـيـة')
            .setThumbnail(user.displayAvatarURL())
            .setDescription(descriptionLines.join('\n'))
            .setTimestamp();

        await reply({ embeds: [embed] });
    }
};