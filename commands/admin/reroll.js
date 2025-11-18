const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, SlashCommandBuilder } = require("discord.js");
const { getKSADateString } = require('../../streak-handler.js'); // <-- تم التصحيح هنا

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ريرول')
        .setDescription('فتح لوحة اختيار قيفاواي منتهي لعمل ريرول.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild),

    name: 'reroll',
    aliases: ['g-reroll'],
    category: "Admin", 
    description: 'فتح لوحة اختيار قيفاواي منتهي لعمل ريرول.',

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

            if (isSlash) {
                payload.ephemeral = true;
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply({ content: "❌ ليس لديك صلاحيات." });
        }

        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

        const finishedGiveaways = sql.prepare(`
            SELECT * FROM active_giveaways 
            WHERE isFinished = 1 AND endsAt > ? 
            ORDER BY endsAt DESC LIMIT 25
        `).all(sevenDaysAgo);

        if (!finishedGiveaways || finishedGiveaways.length === 0) {
            return reply({ content: "❌ لا يوجد أي قيفاوايز منتهية (خلال آخر 7 أيام) لعمل ريرول لها." });
        }

        const options = finishedGiveaways.map(g => {
            const endsDate = getKSADateString(g.endsAt);
            return new StringSelectMenuOptionBuilder()
                .setLabel(g.prize.substring(0, 100))
                .setValue(g.messageID)
                .setDescription(`(ID: ${g.messageID}) - انتهى في: ${endsDate}`);
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('g_reroll_select')
            .setPlaceholder('اختر القيفاواي الذي تريد عمل ريرول له...')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await reply({
            content: "الرجاء اختيار قيفاواي من القائمة أدناه:",
            components: [row],
        });
    }
};