const { Events } = require("discord.js");
const ownerReactionDelete = require("./ownerReactionDelete.js"); // (استيراد ملف حذف المالك)

// (كائن الإحصائيات الافتراضية لتجنب الأخطاء)
const defaultTotalStats = { 
    total_messages: 0, 
    total_images: 0, 
    total_stickers: 0, 
    total_reactions_added: 0, 
    total_replies_sent: 0, 
    total_mentions_received: 0, 
    total_vc_minutes: 0, 
    total_disboard_bumps: 0 
};

function safeMerge(base, defaults) {
    const result = { ...base };
    for (const key in defaults) {
        if (result[key] === undefined) result[key] = defaults[key];
    }
    return result;
}

function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

function getWeekStartDateString() {
    const now = new Date();
    const diff = now.getUTCDate() - (now.getUTCDay() + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        
        // 1. تنفيذ كود "حذف المالك" أولاً (إذا كان هو الفاعل)
        await ownerReactionDelete.execute(reaction, user);

        // 2. إذا كان بوت، نتجاهل
        if (user.bot) return;
        if (!reaction.message.guild) return;

        const client = reaction.client;
        const sql = client.sql;
        const guildID = reaction.message.guild.id;
        const userID = user.id;

        // 3. تتبع إحصائيات الرياكشن (Quest Stats)
        try {
            const dateStr = getTodayDateString();
            const weekStartDateStr = getWeekStartDateString();
            const dailyStatsId = `${userID}-${guildID}-${dateStr}`;
            const weeklyStatsId = `${userID}-${guildID}-${weekStartDateStr}`;
            const totalStatsId = `${userID}-${guildID}`;

            // جلب البيانات الحالية أو إنشاء جديدة
            let dailyStats = client.getDailyStats.get(dailyStatsId) || { id: dailyStatsId, userID, guildID, date: dateStr, reactions_added: 0 };
            let weeklyStats = client.getWeeklyStats.get(weeklyStatsId) || { id: weeklyStatsId, userID, guildID, weekStartDate: weekStartDateStr, reactions_added: 0 };
            let totalStats = client.getTotalStats.get(totalStatsId) || { id: totalStatsId, userID, guildID };

            // دمج القيم الافتراضية لتجنب القيم الناقصة
            // (ملاحظة: لا نحتاج لدمج daily/weekly لأننا نحدث حقلاً واحداً فقط، لكن totalStats ضروري)
            totalStats = safeMerge(totalStats, defaultTotalStats);

            // زيادة العدادات
            dailyStats.reactions_added = (dailyStats.reactions_added || 0) + 1;
            weeklyStats.reactions_added = (weeklyStats.reactions_added || 0) + 1;
            totalStats.total_reactions_added = (totalStats.total_reactions_added || 0) + 1;

            // حفظ التحديثات (Daily & Weekly)
            // (نستخدم run الجزئي لتجنب تصفير باقي الأعمدة إذا لم تكن موجودة في الكائن، لكن الأفضل استخدام prepared statement الكامل)
            // للتبسيط والأمان، سنستخدم الدوال الموجودة في client إذا كانت تدعم الدمج، أو نستخدم run المباشر
            
            // هنا نستخدم الـ prepared statements الموجودة في client (وهي تتوقع كائناً كاملاً)
            // لذا يجب أن نملأ باقي القيم بـ 0 أو القيم القديمة إذا كانت dailyStats ناقصة
            // (للأمان، سنفترض أن client.setDailyStats يتطلب كل الحقول، لذا سنقوم بعمل merge كامل)
            const fullDailyDefault = { messages: 0, images: 0, stickers: 0, replies_sent: 0, mentions_received: 0, vc_minutes: 0, water_tree: 0, counting_channel: 0, meow_count: 0, streaming_minutes: 0, disboard_bumps: 0 };
            dailyStats = safeMerge(dailyStats, fullDailyDefault);
            weeklyStats = safeMerge(weeklyStats, fullDailyDefault);

            client.setDailyStats.run(dailyStats);
            client.setWeeklyStats.run(weeklyStats);

            // حفظ التحديثات (Total Stats) - ( 🌟 هنا كان الخطأ سابقاً 🌟 )
            client.setTotalStats.run({
                id: totalStatsId,
                userID,
                guildID,
                total_messages: totalStats.total_messages,
                total_images: totalStats.total_images,
                total_stickers: totalStats.total_stickers,
                total_reactions_added: totalStats.total_reactions_added,
                total_replies_sent: totalStats.total_replies_sent,        // (تم التصحيح)
                total_mentions_received: totalStats.total_mentions_received, // (تم التصحيح)
                total_vc_minutes: totalStats.total_vc_minutes,
                total_disboard_bumps: totalStats.total_disboard_bumps
            });

            // التحقق من المهام والإنجازات
            const member = await reaction.message.guild.members.fetch(userID).catch(() => null);
            if (member) {
                await client.checkQuests(client, member, dailyStats, 'daily', dateStr);
                await client.checkQuests(client, member, weeklyStats, 'weekly', weekStartDateStr);
                await client.checkAchievements(client, member, null, totalStats);
            }

        } catch (err) {
            console.error("[Reaction Stats Error]", err);
        }
    },
};
