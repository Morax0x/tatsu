const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, Colors, AttachmentBuilder } = require("discord.js");
const questsConfig = require('../json/quests-config.json');
const { getAchievementPageData } = require('../achievements-utils.js');

// (تم حذف استدعاء المولدات من هنا لإصلاح الاعتماد الدائري)

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_STAR = '⭐';
const ROWS_PER_PAGE_ACH = 5; // (هذا خاص بالإنجازات النصية في 'my_achievements')

// --- (الدوال المساعدة - لا تغيير) ---
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

function getTimeUntilNextDailyReset() {
    const now = new Date();
    const resetTime = new Date(now.getTime());
    resetTime.setUTCHours(21, 0, 0, 0); // (يفترض التجديد 9 مساءً UTC)
    if (now.getTime() > resetTime.getTime()) {
        resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }
    const diff = resetTime.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours} س ${minutes} د`;
}

function getTimeUntilNextWeeklyReset() {
    const now = new Date();
    const resetTime = new Date(now.getTime());
    const currentDay = now.getUTCDay(); // 5 = Friday
    let daysUntilFriday = (5 - currentDay + 7) % 7;
    resetTime.setUTCHours(21, 0, 0, 0);
    if (daysUntilFriday === 0 && now.getUTCHours() >= 21) {
        daysUntilFriday = 7;
    }
    resetTime.setUTCDate(now.getUTCDate() + daysUntilFriday);
    const diff = resetTime.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days} ي ${hours} س`;
}

function buildProgressBar(progress, goal, length = 10) {
    const percent = Math.max(0, Math.min(1, progress / goal));
    const filledBlocks = Math.round(percent * length);
    const emptyBlocks = length - filledBlocks;
    return `[${'■'.repeat(filledBlocks)}${'□'.repeat(emptyBlocks)}] (${Math.floor(percent * 100)}%)`;
}


// --- (دالة المهام اليومية - مع الإصلاح) ---
async function buildDailyEmbed(sql, member, dailyStats, page = 1) {
    // (الإصلاح: تم نقل الاستدعاء إلى هنا)
    const { generateDailyQuestsImage } = require('../generators/daily-quest-generator.js'); 

    const dateStr = getTodayDateString();
    const completed = sql.prepare("SELECT * FROM user_quest_claims WHERE userID = ? AND guildID = ? AND dateStr = ?").all(member.id, member.guild.id, dateStr);

    const questsData = questsConfig.daily.map(quest => {
        const progress = dailyStats[quest.stat] || 0;
        const isDone = completed.some(c => c.questID === quest.id);
        return {
            quest: quest,
            progress: isDone ? quest.goal : progress
        };
    });

    // (استدعاء المولد بالصفحة)
    const { attachment, totalPages } = await generateDailyQuestsImage(member, questsData, page);

    const imageEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setImage(`attachment://${attachment.name}`);

    // (إرجاع التنسيق الصحيح)
    return { embeds: [imageEmbed], files: [attachment], totalPages: totalPages };
}

// --- (دالة المهام الأسبوعية - مع الإصلاح) ---
async function buildWeeklyEmbed(sql, member, weeklyStats, page = 1) {
    // (الإصلاح: تم نقل الاستدعاء إلى هنا)
    const { generateWeeklyQuestsImage } = require('../generators/weekly-quest-generator.js');

    const weekStartDateStr = getWeekStartDateString();
    const completed = sql.prepare("SELECT * FROM user_quest_claims WHERE userID = ? AND guildID = ? AND dateStr = ?").all(member.id, member.guild.id, weekStartDateStr);

    const questsData = questsConfig.weekly.map(quest => {
        const progress = weeklyStats[quest.stat] || 0;
        const isDone = completed.some(c => c.questID === quest.id);
        return {
            quest: quest,
            progress: isDone ? quest.goal : progress
        };
    });

    // (استدعاء المولد بالصفحة)
    const { attachment, totalPages } = await generateWeeklyQuestsImage(member, questsData, page);

    const imageEmbed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setImage(`attachment://${attachment.name}`);

    // (إرجاع التنسيق الصحيح)
    return { embeds: [imageEmbed], files: [attachment], totalPages: totalPages };
}

// --- (دالة الإنجازات - مع الإصلاح) ---
async function buildAchievementsEmbed(sql, member, levelData, totalStats, completedAchievements, page = 1) {
    // (الإصلاح: تم نقل الاستدعاء إلى هنا)
    const { generateAchievementPageImage } = require('../generators/achievement-generator.js');

    const { achievementsData, totalPages } = getAchievementPageData(sql, member, levelData, totalStats, completedAchievements, page);

    const stats = {
        completed: completedAchievements.length,
        total: questsConfig.achievements.length,
        page: page,
        totalPages: totalPages
    };

    const attachment = await generateAchievementPageImage(member, achievementsData, stats);

    // (الإصلاح: إنشاء الـ Embed هنا لإصلاح خطأ 50035)
    const imageEmbed = new EmbedBuilder()
        .setColor(Colors.Purple)
        .setImage(`attachment://${attachment.name}`);

    return { embeds: [imageEmbed], files: [attachment], totalPages: totalPages };
}

// --- (الكود الأساسي للأمر - لا تغيير) ---
module.exports = {
    name: 'achievements',
    aliases: ['مهام', 'quests'],
    description: 'عرض قائمة المهام اليومية والأسبوعية والإنجازات.',

    async execute(message, args) {
        const member = message.member;
        const userId = member.id;
        const guildId = member.guild.id;

        const sql = message.client.sql;

        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString();
        const totalStatsId = `${userId}-${guildId}`;

        const levelData = message.client.getLevel.get(userId, guildId) || { ...message.client.defaultData, user: userId, guild: guildId };
        const dailyStats = message.client.getDailyStats.get(`${userId}-${guildId}-${dateStr}`) || {};
        const weeklyStats = message.client.getWeeklyStats.get(`${userId}-${guildId}-${weekStartDateStr}`) || {};
        const totalStats = message.client.getTotalStats.get(totalStatsId) || {};
        const completedAchievements = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ?").all(userId, guildId);

        let currentPage = 1;
        let currentView = 'daily';
        let currentTotalPages = 1;

        const idPrefix = `quests_${message.id}`;

        const generateDisplay = async (view, page) => {
            if (view === 'daily') {
                return await buildDailyEmbed(sql, member, dailyStats, page);
            }
            if (view === 'weekly') {
                return await buildWeeklyEmbed(sql, member, weeklyStats, page);
            }
            if (view === 'achievements') {
                // (الدالة الآن ترجع الـ embed جاهزاً)
                return await buildAchievementsEmbed(sql, member, levelData, totalStats, completedAchievements, page);
            }
        };

        const generateButtons = (view, page, totalPages) => {
            const dailyButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_daily')
                .setLabel('المهام اليومية')
                .setStyle(view === 'daily' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('📋');

            const weeklyButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_weekly')
                .setLabel('المهام الأسبوعية')
                .setStyle(view === 'weekly' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('📅');

            const achButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_achievements')
                .setLabel('إنجازاتي')
                .setStyle(view === 'achievements' ? ButtonStyle.Success : ButtonStyle.Secondary)
                .setEmoji('🏆');

            const prevButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_prev')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:left:1439164494759723029>')
                .setDisabled(page === 1);

            const nextButton = new ButtonBuilder()
                .setCustomId(idPrefix + '_next')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('<:right:1439164491072929915>')
                .setDisabled(page === totalPages);

            if (totalPages > 1) {
                return new ActionRowBuilder().addComponents(dailyButton, weeklyButton, achButton, prevButton, nextButton);
            }
            return new ActionRowBuilder().addComponents(dailyButton, weeklyButton, achButton);
        };

        // (العرض الأولي)
        const initialDisplay = await generateDisplay(currentView, currentPage);
        currentTotalPages = initialDisplay.totalPages; 

        const components = generateButtons(currentView, currentPage, currentTotalPages); 
        const msg = await message.reply({ embeds: initialDisplay.embeds, files: initialDisplay.files, components: [components] });

        // (الـ Collector)
        const filter = (i) => i.customId.startsWith(idPrefix) && i.user.id === message.author.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async i => {
            await i.deferUpdate();
            let newDisplay;
            let newComponents;

            if (i.customId.endsWith('_daily')) { currentView = 'daily'; currentPage = 1; }
            else if (i.customId.endsWith('_weekly')) { currentView = 'weekly'; currentPage = 1; }
            else if (i.customId.endsWith('_achievements')) { currentView = 'achievements'; currentPage = 1; }
            else if (i.customId.endsWith('_prev')) { currentPage--; }
            else if (i.customId.endsWith('_next')) { currentPage++; }

            newDisplay = await generateDisplay(currentView, currentPage);
            currentTotalPages = newDisplay.totalPages; 
            newComponents = generateButtons(currentView, currentPage, currentTotalPages); 

            await i.editReply({ embeds: newDisplay.embeds, files: newDisplay.files, components: [newComponents] });
        });

        collector.on('end', () => {
            const finalComponents = generateButtons(currentView, currentPage, currentTotalPages).components.map(btn => btn.setDisabled(true));
            msg.edit({ components: [new ActionRowBuilder().addComponents(finalComponents)] }).catch(console.error);
        });
    },

    // (تصدير الدوال لـ quest-panel-handler)
    buildDailyEmbed,
    buildWeeklyEmbed,
    buildAchievementsEmbed,
    getTodayDateString,
    getWeekStartDateString
};