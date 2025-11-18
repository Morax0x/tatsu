const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (user.bot) return;
        if (reaction.message.partial) await reaction.message.fetch();
        if (!reaction.message.guild) return;

        const client = reaction.client;
        const sql = client.sql;
        const guildID = reaction.message.guild.id;
        const dateStr = new Date().toISOString().split('T')[0]; 
        const now = new Date();
        const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
        const friday = new Date(now.setUTCDate(diff));
        friday.setUTCHours(0, 0, 0, 0); 
        const weekStartDateStr = friday.toISOString().split('T')[0];

        // تعريف المعرفات
        const dailyID = `${user.id}-${guildID}-${dateStr}`;
        const weeklyID = `${user.id}-${guildID}-${weekStartDateStr}`;
        const totalID = `${user.id}-${guildID}`;

        // قوالب افتراضية
        const defaultStats = { messages: 0, images: 0, stickers: 0, reactions_added: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
        const defaultTotal = { total_messages: 0, total_images: 0, total_stickers: 0, total_reactions_added: 0, total_replies_sent: 0, total_mentions_received: 0, total_vc_minutes: 0, total_disboard_bumps: 0 };

        // 1. جلب أو إنشاء
        let daily = client.getDailyStats.get(dailyID) || { id: dailyID, userID: user.id, guildID: guildID, date: dateStr };
        let weekly = client.getWeeklyStats.get(weeklyID) || { id: weeklyID, userID: user.id, guildID: guildID, weekStartDate: weekStartDateStr };
        let total = client.getTotalStats.get(totalID) || { id: totalID, userID: user.id, guildID: guildID };

        // دمج آمن
        daily = client.safeMerge(daily, defaultStats);
        weekly = client.safeMerge(weekly, defaultStats);
        total = client.safeMerge(total, defaultTotal);

        // 2. زيادة العداد
        daily.reactions_added++;
        weekly.reactions_added++;
        total.total_reactions_added++;

        // 3. الحفظ
        client.setDailyStats.run(daily);
        client.setWeeklyStats.run(weekly);
        
        // ✅✅ التصحيح هنا: تمرير أسماء الحقول الصحيحة ✅✅
        client.setTotalStats.run({
            id: totalID,
            userID: user.id,
            guildID: guildID,
            total_messages: total.total_messages,
            total_images: total.total_images,
            total_stickers: total.total_stickers,
            total_reactions_added: total.total_reactions_added,
            replies_sent: total.total_replies_sent, // الاسم الصحيح هنا
            mentions_received: total.total_mentions_received,
            total_vc_minutes: total.total_vc_minutes,
            total_disboard_bumps: total.total_disboard_bumps
        });

        // 4. فحص المهام
        const member = reaction.message.guild.members.cache.get(user.id);
        if (member) {
            await client.checkQuests(client, member, daily, 'daily', dateStr);
            await client.checkQuests(client, member, weekly, 'weekly', weekStartDateStr);
            await client.checkAchievements(client, member, null, total);
        }
    }
};
