const { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } = require("discord.js");
// (الاعتماد فقط على achievements.js)
const { buildAchievementsEmbed, buildDailyEmbed, buildWeeklyEmbed } = require('../commands/achievements.js');
const { generateLeaderboard } = require('../commands/top.js'); 
const questsConfig = require('../json/quests-config.json');

// (تم حذف جميع المولدات من هنا)

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_STAR = '⭐';

// --- (الدوال المساعدة) ---
function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getWeekStartDateString() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); 
    const diff = now.getUTCDate() - (dayOfWeek + 2) % 7;
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0);
    return friday.toISOString().split('T')[0];
}

function createNotifButton(label, customId, currentStatus) {
    const isEnabled = currentStatus === 1;
    return new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(`${label}: ${isEnabled ? 'مفعل ✅' : 'معطل ❌'}`)
        .setStyle(isEnabled ? ButtonStyle.Success : ButtonStyle.Danger);
}

function getRankEmoji(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
}

// --- (دالة إنجازاتي - خاصة بالقائمة) ---
async function buildMyAchievementsEmbed(interaction, sql, page = 1) {
    try {
        const completed = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ?").all(interaction.user.id, interaction.guild.id);

        if (completed.length === 0) {
            return { embeds: [new EmbedBuilder()
                .setTitle('🎖️ إنجازاتي')
                .setColor(Colors.DarkRed)
                .setDescription('لم تقم بإكمال أي إنجازات بعد.')
                .setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png') // (صورة افتراضية)
            ], components: [] };
        }

        const completedIDs = new Set(completed.map(c => c.achievementID));
        const completedDetails = questsConfig.achievements.filter(ach => completedIDs.has(ach.id)); 

        const perPage = 10; // (عدد الإنجازات النصية في كل صفحة)
        const totalPages = Math.ceil(completedDetails.length / perPage) || 1;
        page = Math.max(1, Math.min(page, totalPages));

        const start = (page - 1) * perPage;
        const end = start + perPage;
        const achievementsToShow = completedDetails.slice(start, end); 

        const embed = new EmbedBuilder()
            .setTitle('🎖️ إنجازاتي') 
            .setColor(Colors.DarkRed)
            .setAuthor({ name: interaction.member.displayName, iconURL: interaction.user.displayAvatarURL() })
            .setFooter({ text: `صفحة ${page} / ${totalPages} (الإجمالي: ${completedDetails.length})` }) 
            .setTimestamp()
            .setImage('https://i.postimg.cc/L4Yb4zHw/almham_alywmyt-2.png'); // (صورة افتراضية)

        let description = '';
        for (const ach of achievementsToShow) {
            description += `${ach.emoji || '🏆'} **${ach.name}**\n`;
            description += `> ${ach.description}\n`;
            description += `> *المكافأة: ${EMOJI_MORA} \`${ach.reward.mora}\` | ${EMOJI_STAR}XP: \`${ach.reward.xp}\`*\n\n`;
        }
        embed.setDescription(description);

        let components = [];
        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`panel_my_ach_prev_${page}`).setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(page === 1),
                new ButtonBuilder().setCustomId(`panel_my_ach_next_${page}`).setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(page === totalPages)
            );
            components.push(pageRow);
        }
        return { embeds: [embed], components: components };

    } catch (err) {
        console.error("Error building my achievements embed:", err);
        return { embeds: [new EmbedBuilder().setTitle(' خطأ').setDescription('حدث خطأ أثناء جلب إنجازاتك.').setColor(Colors.Red)], components: [] };
    }
}

// --- (الدالة الرئيسية) ---
async function handleQuestPanel(i, client, sql) {
    const userId = i.user.id;
    const guildId = i.guild.id;
    const id = `${userId}-${guildId}`;
    const idPrefix = 'panel_'; 
    let currentPage = 1;

    // (التعامل مع الأزرار والصفحات)
    if (i.customId.includes('_prev_') || i.customId.includes('_next_') || i.customId.startsWith(idPrefix + 'toggle_notif_')) {
        const pageData = i.customId.split('_');
        currentPage = parseInt(pageData[pageData.length - 1]);
        if(i.customId.includes('_prev_')) currentPage--;
        if(i.customId.includes('_next_')) currentPage++;
        await i.deferUpdate(); 
    } else {
        await i.deferReply({ ephemeral: true }); 
    }

    // (قسم الإشعارات)
    let notifData = client.getQuestNotif.get(id);
    if (!notifData) {
        notifData = {
            id: id, userID: userId, guildID: guildId,
            dailyNotif: 1, weeklyNotif: 1, achievementsNotif: 1, levelNotif: 1
        };
        client.setQuestNotif.run(notifData);
    }
    if (typeof notifData.levelNotif === 'undefined') {
        notifData.levelNotif = 1;
    }

    if (i.customId.startsWith(idPrefix + 'toggle_notif_')) {
        if (i.customId.endsWith('_daily')) { notifData.dailyNotif = notifData.dailyNotif === 1 ? 0 : 1; }
        else if (i.customId.endsWith('_weekly')) { notifData.weeklyNotif = notifData.weeklyNotif === 1 ? 0 : 1; }
        else if (i.customId.endsWith('_ach')) { notifData.achievementsNotif = notifData.achievementsNotif === 1 ? 0 : 1; }
        else if (i.customId.endsWith('_level')) { notifData.levelNotif = notifData.levelNotif === 1 ? 0 : 1; }

        client.setQuestNotif.run(notifData);

        const notifEmbed = new EmbedBuilder()
            .setTitle('🔔 إعدادات الإشعارات')
            .setDescription('قم بتحديد الإشعارات التي ترغب بتفعيلها أو تعطيلها.')
            .setColor(Colors.Purple)
            .setImage('https://i.postimg.cc/5217mTwV/almham_alywmyt-3.png');

        const notifButtons = new ActionRowBuilder().addComponents(
            createNotifButton('المهام اليومية', idPrefix + 'toggle_notif_daily', notifData.dailyNotif),
            createNotifButton('المهام الأسبوعية', idPrefix + 'toggle_notif_weekly', notifData.weeklyNotif),
            createNotifButton('الإنجازات', idPrefix + 'toggle_notif_ach', notifData.achievementsNotif),
            createNotifButton('زيادة المستوى', idPrefix + 'toggle_notif_level', notifData.levelNotif)
        );

        await i.editReply({ embeds: [notifEmbed], components: [notifButtons] });
        return;
    }

    const selection = i.isStringSelectMenu() ? i.values[0] : i.customId;

    if (selection.endsWith('notifications')) {
        const notifEmbed = new EmbedBuilder()
            .setTitle('🔔 إعدادات الإشعارات')
            .setDescription('قم بتحديد الإشعارات التي ترغب بتفعيلها أو تعطيلها.')
            .setColor(Colors.Purple)
            .setImage('https://i.postimg.cc/5217mTwV/almham_alywmyt-3.png');

        const notifButtons = new ActionRowBuilder().addComponents(
             createNotifButton('المهام اليومية', idPrefix + 'toggle_notif_daily', notifData.dailyNotif),
            createNotifButton('المهام الأسبوعية', idPrefix + 'toggle_notif_weekly', notifData.weeklyNotif),
            createNotifButton('الإنجازات', idPrefix + 'toggle_notif_ach', notifData.achievementsNotif),
            createNotifButton('زيادة المستوى', idPrefix + 'toggle_notif_level', notifData.levelNotif)
        );

        await i.editReply({ embeds: [notifEmbed], components: [notifButtons] });
        return;
    }

    // (جلب البيانات)
    const dateStr = getTodayDateString();
    const weekStartDateStr = getWeekStartDateString();
    const totalStatsId = `${userId}-${guildId}`;
    const levelData = client.getLevel.get(userId, guildId) || { ...client.defaultData, user: userId, guild: guildId };
    const dailyStats = client.getDailyStats.get(`${userId}-${guildId}-${dateStr}`) || {};
    const weeklyStats = client.getWeeklyStats.get(`${userId}-${guildId}-${weekStartDateStr}`) || {};
    const totalStats = client.getTotalStats.get(totalStatsId) || {};
    const completedAchievements = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ?").all(userId, guildId);

    let embeds = [];
    let files = [];
    let components = [];

    // --- (المنطق النظيف لعرض الأقسام) ---

    if (selection.includes('daily') || selection.includes('daily_prev_') || selection.includes('daily_next_')) {
        const dailyData = await buildDailyEmbed(sql, i.member, dailyStats, currentPage);
        files = dailyData.files;
        embeds = dailyData.embeds; 
        const totalPages = dailyData.totalPages;

        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${idPrefix}daily_prev_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(currentPage === 1),
                new ButtonBuilder().setCustomId(`${idPrefix}daily_next_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(currentPage === totalPages)
            );
            components.push(pageRow);
        }

    } else if (selection.includes('weekly') || selection.includes('weekly_prev_') || selection.includes('weekly_next_')) {
        const weeklyData = await buildWeeklyEmbed(sql, i.member, weeklyStats, currentPage);
        files = weeklyData.files;
        embeds = weeklyData.embeds; 
        const totalPages = weeklyData.totalPages;

        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${idPrefix}weekly_prev_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(currentPage === 1),
                new ButtonBuilder().setCustomId(`${idPrefix}weekly_next_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(currentPage === totalPages)
            );
            components.push(pageRow);
        }

    } else if (selection.includes('top_achievements') || selection.includes('top_ach_prev_') || selection.includes('top_ach_next_')) {
        const topData = await generateLeaderboard(sql, i.guild, 'achievements', currentPage);
        embeds = [topData.embed]; 
        const totalPages = topData.totalPages;

        if (totalPages > 1) {
             const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${idPrefix}top_ach_prev_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(currentPage === 1),
                new ButtonBuilder().setCustomId(`${idPrefix}top_ach_next_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(currentPage === totalPages)
            );
            components.push(pageRow);
        }

    } else if (selection.includes('my_achievements') || selection.includes('my_ach_prev_') || selection.includes('my_ach_next_')) {
        const myData = await buildMyAchievementsEmbed(i, sql, currentPage);
        embeds = myData.embeds;
        components = myData.components;

    } else if (selection.includes('achievements') || selection.includes('achievements_prev_') || selection.includes('achievements_next_')) {
        const achData = await buildAchievementsEmbed(sql, i.member, levelData, totalStats, completedAchievements, currentPage);
        files = achData.files; 
        embeds = achData.embeds; 
        const totalPages = achData.totalPages;

        if (totalPages > 1) {
            const pageRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`${idPrefix}achievements_prev_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(currentPage === 1),
                new ButtonBuilder().setCustomId(`${idPrefix}achievements_next_${currentPage}`).setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(currentPage === totalPages)
            );
            components.push(pageRow);
        }
    }

    await i.editReply({ embeds: embeds, files: files, components: components });
    return;
}

module.exports = {
    handleQuestPanel
};