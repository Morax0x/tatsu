const questsConfig = require('./json/quests-config.json');
const ROWS_PER_PAGE_ACH = 5;

function getAchievementPageData(sql, member, levelData, totalStats, completedAchievements, page = 1) {
    const achievements = questsConfig.achievements;
    const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
    const mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);

    const perPage = ROWS_PER_PAGE_ACH;
    const totalPages = Math.ceil(achievements.length / perPage);
    page = Math.max(1, Math.min(page, totalPages));

    const start = (page - 1) * perPage;
    const end = start + perPage;
    const achievementsToShow = achievements.slice(start, end);

    const achievementsData = achievementsToShow.map(ach => {
        const isDone = completedAchievements.some(c => c.achievementID === ach.id);

        let currentProgress = 0;
        if (levelData && levelData.hasOwnProperty(ach.stat)) {
            currentProgress = levelData[ach.stat];
        } else if (totalStats && totalStats.hasOwnProperty(ach.stat)) {
            currentProgress = totalStats[ach.stat];
        } else if (ach.stat === 'highestStreak' && streakData) {
            currentProgress = streakData.highestStreak || 0;
        } else if (ach.stat === 'highestMediaStreak' && mediaStreakData) {
            currentProgress = mediaStreakData.highestStreak || 0;
        } else if (streakData && streakData.hasOwnProperty(ach.stat)) {
            currentProgress = streakData[ach.stat];
        }

        if (ach.stat === 'has_caesar_role' || ach.stat === 'has_race_role' || ach.stat === 'has_tree_role') {
            if (isDone) currentProgress = 1;
        }

        return {
            achievement: ach,
            progress: isDone ? ach.goal : Math.min(currentProgress, ach.goal),
            isDone: isDone
        };
    });

    return { achievementsData, totalPages };
}

module.exports = {
    getAchievementPageData
};