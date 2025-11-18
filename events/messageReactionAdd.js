// ملف: events/messageReactionAdd.js
const { Events } = require("discord.js");

// (دوال مساعدة يحتاجها هذا الملف)
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

async function trackReactionStats(reaction, user, client) {
    const sql = client.sql;
    try {
        const guildID = reaction.message.guild.id;
        const authorID = user.id;
        const dateStr = getTodayDateString();
        const weekStartDateStr = getWeekStartDateString();

        const dailyStatsId = `${authorID}-${guildID}-${dateStr}`;
        const weeklyStatsId = `${authorID}-${guildID}-${weekStartDateStr}`;
        const totalStatsId = `${authorID}-${guildID}`;

        let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID: authorID, guildID: guildID, date: dateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID: authorID, guildID: guildID, weekStartDate: weekStartDateStr, messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID: authorID, guildID: guildID, total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

        dailyStats.reactions_added += 1;
        weeklyStats.reactions_added += 1;
        totalStats.total_reactions_added += 1;

        client.setDailyStats.run(dailyStats);
        client.setWeeklyStats.run(weeklyStats);
        client.setTotalStats.run(totalStats);

        const member = reaction.message.guild.members.cache.get(authorID);
        if (member) {
            await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
            await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
            await client.checkAchievements(client, member, null, totalStats);
        }

    } catch (err) {
        console.error("Error in MessageReactionAdd event:", err);
    }
}

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (user.bot) return;
        if (!reaction.message.guild) return;

        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Failed to fetch partial reaction:', error);
                return;
            }
        }

        const client = reaction.client;
        await trackReactionStats(reaction, user, client);
    },
};