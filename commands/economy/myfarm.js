const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js"); // ( 1 ) تم إضافة SlashCommandBuilder
const { calculateMoraBuff } = require('../../streak-handler.js');
const farmAnimals = require('../../json/farm-animals.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    // --- ( 2 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('مزرعتي')
        .setDescription('يعرض جميع الحيوانات التي تملكها في مزرعتك أو مزرعة عضو آخر.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض مزرعته')
            .setRequired(false)),
    // ------------------------------------

    name: 'myfarm',
    aliases: ['مزرعتي', 'حيواناتي'],
    category: "Economy",
    description: 'يعرض جميع الحيوانات التي تملكها في مزرعتك أو مزرعة عضو آخر.',
    usage: '-myfarm [@user]',

    // --- ( 3 ) تعديل دالة التنفيذ ---
    async execute(interactionOrMessage, args) {

        // --- ( 4 ) إضافة معالج الأوامر الهجينة ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user; // منفذ الأمر
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author; // منفذ الأمر
            targetMember = message.mentions.members.first() || message.member;
        }

        // --- ( 5 ) توحيد دوال الرد ---
        const reply = async (payload) => {
            // الأمر الأصلي كان يرسل في القناة وليس رداً
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const replyError = async (content) => {
            // الأمر الأصلي كان يرد على الرسالة عند الخطأ
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload); // مطابق للأمر الأصلي
            }
        };
        // ------------------------------------


        const sql = client.sql; // ( 6 ) التعديل هنا
        const targetUser = targetMember.user;

        const userId = targetUser.id;
        const guildId = guild.id; // ( 7 ) التعديل هنا

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
            return replyError("❌ حدث خطأ أثناء جلب بيانات المزرعة."); // ( 8 ) التعديل هنا
        }

        const embed = new EmbedBuilder()
            .setColor("Random")
            .setAuthor({ name: `🏞️ مزرعـــة ${targetUser.username}`, iconURL: targetUser.displayAvatarURL() });

        if (!userAnimals || userAnimals.length === 0) {
            embed.setDescription("مـزرعـة فـارغـة");
            embed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');
            return reply({ embeds: [embed] }); // ( 9 ) التعديل هنا
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

        const moraMultiplier = calculateMoraBuff(targetMember, sql);
        const finalFarmIncome = Math.floor(totalFarmIncome * moraMultiplier);
        const buffPercent = (moraMultiplier - 1) * 100;

        let footerText = `إجمالي دخل المزرعة: ${finalFarmIncome.toLocaleString()} بـاليـوم`;
        if (buffPercent > 0) {
            footerText += ` (+${buffPercent.toFixed(0)}%)`;
        } else if (buffPercent < 0) {
            footerText += ` (${buffPercent.toFixed(0)}%)`;
        }

        embed.setDescription(descriptionLines.join('\n\n'));
        embed.setFooter({
            text: footerText,
            iconURL: targetUser.displayAvatarURL({ dynamic: true })
        });

        embed.setImage('https://i.postimg.cc/65VKKCdP/dp2kuk914o9y-gif-1731-560.gif');

        await reply({ embeds: [embed] }); // ( 10 ) التعديل هنا
    }
};