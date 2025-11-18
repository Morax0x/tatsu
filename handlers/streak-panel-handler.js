const { EmbedBuilder, Colors, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require("discord.js");
const { updateNickname } = require('../streak-handler.js');

async function buildTopStreaksEmbed(interaction, sql, page = 1) {
    try {
        const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?").get(interaction.guild.id);
        const streakEmoji = settings?.streakEmoji || '🔥';

        const allUsers = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND streakCount > 0 ORDER BY streakCount DESC;").all(interaction.guild.id);

        if (allUsers.length === 0) {
            const embed = new EmbedBuilder()
                .setTitle(`✥ اعـلـى الـمصـنـفـيـن بالـسـتـريـك`)
                .setColor("Red")
                .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                .setDescription("لا يوجد أحد في لوحة صدارة الستريك بعد!");
            return { embeds: [embed], components: [] };
        }

        const rowsPerPage = 5;
        const totalPages = Math.ceil(allUsers.length / rowsPerPage);
        page = Math.max(1, Math.min(page, totalPages));
        const start = (page - 1) * rowsPerPage;
        const end = start + rowsPerPage;
        const pageData = allUsers.slice(start, end);

        const embed = new EmbedBuilder()
            .setTitle(`✥ اعـلـى الـمصـNـفـيـن (ستريك)`)
            .setColor("Red")
            .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
            .setTimestamp()
            .setFooter({ text: `صفحة ${page} / ${totalPages}` });

        let descriptionText = '';

        for (let i = 0; i < pageData.length; i++) {
            const streakData = pageData[i];
            const rank = start + i + 1;

            let memberName;
            try {
                const userObj = await interaction.guild.members.fetch(streakData.userID);
                memberName = `<@${streakData.userID}>`;
            } catch (error) {
                memberName = `User Left (${streakData.userID})`;
            }

            let rankEmoji = '';
            if (rank === 1) rankEmoji = '🥇';
            else if (rank === 2) rankEmoji = '🥈';
            else if (rank === 3) rankEmoji = '🥉';
            else rankEmoji = `#${rank}`;

            descriptionText += `${rankEmoji} ${memberName}\n> **Streak**: \`${streakData.streakCount}\` ${streakEmoji}\n\n`;
        }

        embed.setDescription(descriptionText);

        let components = [];
        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                    .setCustomId(`streak_panel_top_prev_${page}`)
                    .setLabel('◀️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1),
                    new ButtonBuilder()
                    .setCustomId(`streak_panel_top_next_${page}`)
                    .setLabel('▶️')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages)
                );
            components.push(pageRow);
        }

        return { embeds: [embed], components: components };

    } catch (err) {
        console.error("Error building top streaks embed:", err);
        return { embeds: [new EmbedBuilder().setTitle(' خطأ').setDescription('حدث خطأ أثناء جلب القائمة.').setColor(Colors.Red)], components: [] };
    }
}

async function handleStreakPanel(i, client, sql) {
    const getStreak = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?");
    const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield, nicknameActive, hasReceivedFreeShield, separator, dmNotify, highestStreak, has12hWarning) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield, @nicknameActive, @hasReceivedFreeShield, @separator, @dmNotify, @highestStreak, @has12hWarning);");

    let currentPage = 1;
    const selection = i.isStringSelectMenu() ? i.values[0] : i.customId;

    if (i.isButton()) {
        await i.deferUpdate();
        if (i.customId.includes('_prev_') || i.customId.includes('_next_')) {
            const pageData = i.customId.split('_');
            currentPage = parseInt(pageData[pageData.length - 1]);
            if (i.customId.includes('_prev_')) currentPage--;
            if (i.customId.includes('_next_')) currentPage++;
        }
    } else if (i.isStringSelectMenu() && i.customId === 'streak_panel_select_sep') {
        await i.deferUpdate();
    } else {
        await i.deferReply({ ephemeral: true });
    }

    const guildID = i.guild.id;
    const userID = i.user.id;
    let streakData = getStreak.get(guildID, userID);

    if (!streakData) {
        streakData = {
            id: `${guildID}-${userID}`,
            guildID,
            userID,
            streakCount: 0,
            lastMessageTimestamp: 0,
            hasGracePeriod: 0,
            hasItemShield: 0,
            nicknameActive: 1,
            hasReceivedFreeShield: 0,
            separator: '|',
            dmNotify: 1,
            highestStreak: 0,
            has12hWarning: 0
        };
        setStreak.run(streakData);
    }

    if (selection === 'streak_panel_toggle') {
        const newState = streakData.nicknameActive === 1 ? 0 : 1;
        streakData.nicknameActive = newState;
        setStreak.run(streakData);
        await updateNickname(i.member, sql);
        await i.editReply({ content: newState === 0 ? "✅ تم **إخفاء** الستريك." : "✅ تم **إظهار** الستريك.", components: [] });

    } else if (selection === 'streak_panel_change_sep') {
        const currentSep = streakData?.separator || '|';

        const separatorOptions = [
            { label: '|', value: '|' },
            { label: '•', value: '•' },
            { label: '»', value: '»' },
            { label: '✦', value: '✦' },
            { label: '★', value: '★' },
            { label: '❖', value: '❖' },
            { label: '✧', value: '✧' },
            { label: '✬', value: '✬' },
            { label: '〢', value: '〢' },
            { label: '┇', value: '┇' }
        ];

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('streak_panel_select_sep')
            .setPlaceholder('اختر الفاصل الذي تفضله...')
            .addOptions(
                separatorOptions.map(opt =>
                    new StringSelectMenuOptionBuilder()
                    .setLabel(opt.label)
                    .setValue(opt.value)
                    .setDefault(opt.value === currentSep)
                )
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        await i.editReply({ content: 'اختر مظهر الفاصل الجديد لاسمك:', components: [row] });

    } else if (i.customId === 'streak_panel_select_sep') {
        const newSeparator = i.values[0];

        streakData.separator = newSeparator;
        setStreak.run(streakData);

        await updateNickname(i.member, sql);

        await i.editReply({ content: `✅ تم تغيير فاصل الستريك الخاص بك إلى: \`${newSeparator}\``, components: [] });

    } else if (selection.startsWith('streak_panel_top')) {
        const topData = await buildTopStreaksEmbed(i, sql, currentPage);
        await i.editReply(topData);

    } else if (selection === 'streak_panel_notifications') {
        const newState = streakData.dmNotify === 1 ? 0 : 1;
        streakData.dmNotify = newState;
        setStreak.run(streakData);

        const status = newState === 1 ? "مفعلة" : "معطلة";
        await i.editReply({ content: `✅ تم ضبط إشعارات الستريك الخاصة بك إلى: **${status}**.` });
    }
    return;
}

module.exports = {
    handleStreakPanel,
    buildTopStreaksEmbed
};