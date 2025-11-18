const { EmbedBuilder, SlashCommandBuilder } = require("discord.js"); // ( 1 ) تم إضافة SlashCommandBuilder
// ( 2 ) تم إزالة SQLite من هنا، سنستخدم client.sql
// const SQLite = require("better-sqlite3");
// const sql = new SQLite('./mainDB.sqlite');

const EMOJI_MORA = '<:mora:1435647151349698621>'; 

module.exports = {
    // --- ( 3 ) إضافة بيانات أمر السلاش ---
    data: new SlashCommandBuilder()
        .setName('ممتلكات') // اسم الأمر بالعربي
        .setDescription('يعرض الأسهم والعقارات التي تملكها.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض محفظته')
            .setRequired(false)),
    // ------------------------------------

    name: 'portfolio',
    aliases: ['محفظتي', 'استثماراتي', 'ممتلكات'],
    category: "Economy",
    description: 'يعرض الأسهم والعقارات التي تملكها.',

    // --- ( 4 ) تعديل دالة التنفيذ ---
    async execute(interactionOrMessage, args) {

        // --- ( 5 ) إضافة معالج الأوامر الهجينة ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client;
        let user; // هذا هو العضو المستهدف

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            // جلب المستخدم المستهدف (أو منفذ الأمر إذا لم يحدد)
            user = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            // نفس المنطق الأصلي لجلب المستخدم
            user = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        // --- ( 6 ) توحيد دوال الرد ---
        const reply = async (payload) => {
            // الأمر الأصلي كان يرسل في القناة
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };
        // ------------------------------------

        const sql = client.sql; // ( 7 ) استخدام client.sql

        const portfolio = sql.prepare("SELECT * FROM user_portfolio WHERE guildID = ? AND userID = ?").all(guild.id, user.id); // ( 8 ) التعديل هنا
        const allItems = sql.prepare("SELECT * FROM market_items").all();
        const market = new Map(allItems.map(item => [item.id, item]));

        const embed = new EmbedBuilder()
            .setTitle(`💼 اصـول الاستثمـارات لـ ${user.displayName}`)
            .setColor("Gold")
            .setThumbnail(user.displayAvatarURL())
            .setImage('https://media.discordapp.net/attachments/1394280285289320550/1432409477272965190/line.png?ex=690eca88&is=690d7908&hm=b21b91d8e7b66da4c28a29dd513bd1104c76ab6c875f23cd9405daf3ce48c050&=&format=webp&quality=lossless');

        if (portfolio.length === 0) {
            embed.setDescription("✥ محفظتك فارغة حالياً. استخدم `/market` لشراء الأصول."); // ( 9 ) تعديل بسيط للإشارة للسلاش
        } else {
            let totalValue = 0;
            let descriptionLines = []; 

            for (const item of portfolio) {
                const marketItem = market.get(item.itemID);
                if (!marketItem) continue;

                const currentValue = marketItem.currentPrice * item.quantity;
                totalValue += currentValue;

                descriptionLines.push(`**✶ ${marketItem.name} العدد: ${item.quantity.toLocaleString()}**`);
                descriptionLines.push(`✬ قيمـة الاصـل: ${currentValue.toLocaleString()} ${EMOJI_MORA}`);
                descriptionLines.push(`✦ سعـر الاصـل: ${marketItem.currentPrice.toLocaleString()} ${EMOJI_MORA}`);
                descriptionLines.push(`\u200B`); // سطر فاصل
            }

            embed.setDescription(
                `✥ قيمة الاصول الكلية: **${totalValue.toLocaleString()}** ${EMOJI_MORA}\n\n` + 
                descriptionLines.join('\n')
            );
        }

        await reply({ embeds: [embed] }); // ( 10 ) التعديل هنا
    }
};