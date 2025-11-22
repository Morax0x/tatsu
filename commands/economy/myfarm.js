const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const farmAnimals = require('../../json/farm-animals.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مزرعتي')
        .setDescription('يعرض جميع الحيوانات التي تملكها في مزرعتك أو مزرعة عضو آخر.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض مزرعته')
            .setRequired(false)),

    name: 'myfarm',
    aliases: ['مزرعتي', 'حيواناتي'],
    category: "Economy",
    description: 'يعرض جميع الحيوانات التي تملكها في مزرعتك أو مزرعة عضو آخر.',
    usage: '-myfarm [@user]',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            targetMember = message.mentions.members.first() || message.member;
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

        const sql = client.sql;
        const targetUser = targetMember.user;

        const userId = targetUser.id;
        const guildId = guild.id;

        let userAnimals;
        try {
            userAnimals = sql.prepare(`
                SELECT 
                    animalID, 
                    COUNT(*) as quantity, 
                    MIN(purchaseTimestamp) as oldestPurchase 
                FROM user_farm 
                WHERE userID = ? AND guildID = ? 
                GROUP BY animalID 
                ORDER BY quantity DESC
            `).all(userId, guildId);

        } catch (error) {
            console.error("خطأ في جلب حيوانات المزرعة:", error);
            return replyError("❌ حدث خطأ أثناء جلب بيانات المزرعة.");
        }

        const embed = new EmbedBuilder()
            .setColor("Random")
            .setAuthor({ name: `🏞️ مزرعـــة ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() });

        if (!userAnimals || userAnimals.length === 0) {
            embed.setDescription("مـزرعـة فـارغـة");
            embed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');
            return reply({ embeds: [embed] });
        }

        let descriptionLines = [];
        let totalFarmIncome = 0;
        const now = Date.now();

        for (const animal of userAnimals) {
            const animalData = farmAnimals.find(a => a.id === animal.animalID);
            if (!animalData) continue;

            const incomePerAnimal = animalData.income_per_day || 0;
            const totalIncome = incomePerAnimal * animal.quantity;
            const lifespanDays = animalData.lifespan_days || 30;

            const ageMS = now - animal.oldestPurchase;
            const ageDays = Math.floor(ageMS / (1000 * 60 * 60 * 24));
            const daysRemaining = Math.max(0, lifespanDays - ageDays);

            totalFarmIncome += totalIncome;

            descriptionLines.push(
                `**✥ ${animalData.name} ${animalData.emoji}**\n` +
                `✶ الـعـدد: \`${animal.quantity.toLocaleString()}\`\n` +
                `✶ الـدخـل اليومي: \`${totalIncome.toLocaleString()}\` ${EMOJI_MORA}\n` +
                `✥ اقـدم حـيـوان عمـره: \`${ageDays}\` يوم (متبقي \`${daysRemaining}\` يوم)`
            );
        }

        // تم إزالة حسابات البوف MoraBuff
        embed.setDescription(descriptionLines.join('\n\n'));
        
        // الفوتر يعرض الدخل الصافي فقط
        embed.setFooter({
            text: `إجمالي دخل المزرعة: ${totalFarmIncome.toLocaleString()} بـاليـوم`,
            iconURL: targetUser.displayAvatarURL({ dynamic: true })
        });

        embed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');

        await reply({ embeds: [embed] });
    }
};
