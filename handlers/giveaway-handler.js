const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

// (تأكد من وجود دالة getUserWeight هنا)
async function getUserWeight(member, sql) {
    const userRoles = member.roles.cache.map(r => r.id);
    if (userRoles.length === 0) return 1;

    const placeholders = userRoles.map(() => '?').join(',');
    const weights = sql.prepare(`
        SELECT MAX(weight) as maxWeight
        FROM giveaway_weights
        WHERE guildID = ? AND roleID IN (${placeholders})
    `).get(member.guild.id, ...userRoles);

    return weights?.maxWeight || 1;
}

// (دالة endGiveaway المعدلة - لا تغيير عن المرة السابقة)
async function endGiveaway(client, messageID) {
    const sql = client.sql; 
    const giveaway = sql.prepare("SELECT * FROM active_giveaways WHERE messageID = ? AND isFinished = 0").get(messageID);
    if (!giveaway) return console.log(`[Giveaway] لم يتم العثور على قيفاواي نشط بالـ ID: ${messageID}`);

    const entries = sql.prepare("SELECT * FROM giveaway_entries WHERE giveawayID = ?").all(messageID);

    let channel;
    try {
        const guild = await client.guilds.fetch(giveaway.guildID);
        channel = await guild.channels.fetch(giveaway.channelID);
    } catch (e) {
        sql.prepare("UPDATE active_giveaways SET isFinished = 1 WHERE messageID = ?").run(messageID);
        return console.log("[Giveaway] السيرفر أو القناة غير موجودة.");
    }

    const originalMessage = await channel.messages.fetch(messageID).catch(() => null);

    if (entries.length === 0) {
        if (originalMessage) {
            try {
                await originalMessage.delete();
                console.log(`[Giveaway] تم حذف القيفاواي ${messageID} لعدم وجود مشاركين.`);
            } catch (delErr) {
                console.error(`[Giveaway] فشل في حذف رسالة القيفاواي ${messageID}:`, delErr);
                if (originalMessage.embeds[0]) {
                    const originalEmbed = originalMessage.embeds[0];
                    const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
                    let newTitle = originalEmbed.title;
                    if (newTitle && !newTitle.startsWith("[انـتـهـى]")) {
                        newTitle = `[انـتـهـى] ${newTitle}`;
                    }
                    newEmbed.setTitle(newTitle).setColor("Red").setFooter({ text: "انتهى (لا مشاركين)" });
                    await originalMessage.edit({ embeds: [newEmbed], components: [] }).catch(() => {});
                }
            }
        }
        sql.prepare("UPDATE active_giveaways SET isFinished = 1 WHERE messageID = ?").run(messageID);
        return; 
    }

    // (باقي كود endGiveaway - لا تغيير)
    const pool = [];
    for (const entry of entries) {
        for (let i = 0; i < entry.weight; i++) {
            pool.push(entry.userID);
        }
    }
    const winners = new Set();
    let attempts = 0;
    while (winners.size < giveaway.winnerCount && winners.size < entries.length && attempts < 50) {
        const randomWinnerID = pool[Math.floor(Math.random() * pool.length)];
        winners.add(randomWinnerID); 
        attempts++;
    }
    const winnerIDs = Array.from(winners);
    const winnerString = winnerIDs.map(id => `<@${id}>`).join(', ');
    const moraReward = giveaway.moraReward || 0;
    const xpReward = giveaway.xpReward || 0;
    if (moraReward > 0 || xpReward > 0) {
        for (const winnerID of winnerIDs) {
            try {
                let levelData = client.getLevel.get(winnerID, giveaway.guildID);
                if (!levelData) {
                     levelData = { ...client.defaultData, user: winnerID, guild: giveaway.guildID };
                }
                const oldLevel = levelData.level; 
                levelData.mora = (levelData.mora || 0) + moraReward;
                levelData.xp = (levelData.xp || 0) + xpReward;
                levelData.totalXP = (levelData.totalXP || 0) + xpReward;
                let nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                while (levelData.xp >= nextXP) {
                    levelData.level++;
                    levelData.xp -= nextXP;
                    nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                }
                client.setLevel.run(levelData);
                console.log(`[Giveaway] تم منح ${moraReward} مورا و ${xpReward} اكس بي للفائز ${winnerID}`);
                if (levelData.level > oldLevel) {
                    try {
                        const member = await channel.guild.members.fetch(winnerID);
                        const fakeInteraction = { guild: channel.guild, channel: channel, members: { me: channel.guild.members.me } };
                        await client.sendLevelUpMessage(fakeInteraction, member, levelData.level, oldLevel, levelData);
                    } catch (lvlErr) {
                        console.error(`[Giveaway LevelUp] فشل في إرسال رسالة الترقية: ${lvlErr.message}`);
                    }
                }
            } catch (err) {
                console.error(`[Giveaway] فشل في منح الجوائز للفائز ${winnerID}:`, err);
            }
        }
    }
    const announcementEmbed = new EmbedBuilder()
        .setTitle(`✥ انـتـهى الـقـيفـاواي`)
        .setColor("DarkGrey");
    const winnerLabel = giveaway.winnerCount > 1 ? "الـفـائـزون:" : "الـفـائـز:";
    let winDescription = `✦ ${winnerLabel} ${winnerString}\n✦ الـجـائـزة: **${giveaway.prize}**`;
    const fields = [];
    if (moraReward > 0) fields.push({ name: '✦ مـورا', value: `${moraReward} <:mora:1435647151349698621>`, inline: true });
    if (xpReward > 0) fields.push({ name: '✬ اكس بي', value: `${xpReward} <a:levelup:1437805366048985290>`, inline: true });
    if (fields.length > 0) announcementEmbed.setFields(fields);
    announcementEmbed.setDescription(winDescription);
    await channel.send({ content: winnerString, embeds: [announcementEmbed] });
    if (originalMessage) {
        const originalEmbed = originalMessage.embeds[0];
        const newEmbed = new EmbedBuilder(originalEmbed.toJSON()); 
        let newTitle = originalEmbed.title;
        if (newTitle && !newTitle.startsWith("[انـتـهـى]")) newTitle = `[انـتـهـى] ${newTitle}`;
        let newDesc = originalEmbed.description;
        const timeRegex = /✦ ينتهي بعـد: <t:\d+:R>\n?/i;
        newDesc = newDesc.replace(timeRegex, "");
        const descRegex = /✶ عـدد الـمـشاركـيـن: `\d+`/i;
        newDesc = newDesc.replace(descRegex, `✶ عـدد الـمـشاركـيـن: \`${entries.length}\``);
        const winnerLabelEmbed = giveaway.winnerCount > 1 ? "الـفـائـزون:" : "الـفـائـز:";
        newDesc += `\n\n**${winnerLabelEmbed}** ${winnerString}`;
        newEmbed.setTitle(newTitle).setColor("DarkGrey").setDescription(newDesc).setFooter({ text: "انتهى" });
        await originalMessage.edit({ embeds: [newEmbed], components: [] });
    }
    sql.prepare("UPDATE active_giveaways SET isFinished = 1 WHERE messageID = ?").run(messageID);
}


// --- ( ⬇️ هذه هي الدالة التي تم تعديلها ⬇️ ) ---
async function createRandomDropGiveaway(client, guild) {
    const sql = client.sql;

    // 1. جلب القناة والإعدادات
    const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
    if (!settings || !settings.dropGiveawayChannelID) {
        return false; // لم يتم تعيين القناة
    }
    const channel = guild.channels.cache.get(settings.dropGiveawayChannelID);
    if (!channel) {
        return false; // القناة غير موجودة
    }

    // (القيم الافتراضية)
    const DEFAULTS = {
        dropTitle: "🎉 قيفاواي مفاجئ! 🎉",
        dropDescription: "تفاعلكم رائع! إليكم قيفاواي سريع:\n\n✦ الـجـائـزة: **{prize}**\n✦ الـفـائـزون: `{winners}`\n✦ ينتهي بعـد: {time}",
        dropColor: "Gold",
        dropFooter: "اضغط الزر للدخول!",
        dropButtonLabel: "ادخل السحب!",
        dropButtonEmoji: "🎁",
        dropMessageContent: "✨ **قيفاواي مفاجئ ظهر!** ✨"
    };

    // 2. إنشاء الجوائز العشوائية
    const moraReward = Math.floor(Math.random() * 4001) + 1000; // 1000 - 5000
    const xpReward = Math.floor(Math.random() * 4001) + 1000;   // 1000 - 5000
    const winnerCount = Math.floor(Math.random() * 3) + 1;      // 1 - 3
    const durationMs = 5 * 60 * 1000; // مدة 5 دقائق
    const endsAt = Date.now() + durationMs;
    const endsAtTimestamp = Math.floor(endsAt / 1000);

    const prize = `🎁 \`${moraReward.toLocaleString()}\` مورا و \`${xpReward.toLocaleString()}\` اكس بي`;

    // 3. تطبيق الإعدادات المخصصة + المتغيرات
    const title = settings.dropTitle || DEFAULTS.dropTitle;
    const descriptionTemplate = settings.dropDescription || DEFAULTS.dropDescription;
    const description = descriptionTemplate
        .replace(/{prize}/g, prize)
        .replace(/{winners}/g, winnerCount)
        .replace(/{time}/g, `<t:${endsAtTimestamp}:R>`);

    const color = settings.dropColor || DEFAULTS.dropColor;
    const footer = settings.dropFooter || DEFAULTS.dropFooter;
    const buttonLabel = settings.dropButtonLabel || DEFAULTS.dropButtonLabel;
    const buttonEmoji = settings.dropButtonEmoji || DEFAULTS.dropButtonEmoji;
    const content = settings.dropMessageContent || DEFAULTS.dropMessageContent;


    // 4. إنشاء الرسالة والزر
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: footer });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('g_enter_drop')
            .setLabel(buttonLabel)
            .setStyle(ButtonStyle.Success)
            .setEmoji(buttonEmoji)
    );

    // 5. إرسال الرسالة
    const message = await channel.send({ 
        content: content,
        embeds: [embed], 
        components: [row] 
    });

    // 6. حفظ القيفاواي في قاعدة البيانات
    sql.prepare(
        "INSERT INTO active_giveaways (messageID, guildID, channelID, prize, endsAt, winnerCount, xpReward, moraReward, isFinished) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)"
    ).run(message.id, guild.id, channel.id, prize, endsAt, winnerCount, xpReward, moraReward);

    // 7. جدولة إنهاء القيفاواي
    setTimeout(() => {
        endGiveaway(client, message.id); 
    }, durationMs + 2000); 

    return true; // نجاح
}
// --- ( ⬆️ نهاية الدالة المعدلة ⬆️ ) ---


// (تصدير كل الدوال)
module.exports = {
    getUserWeight,
    endGiveaway,
    createRandomDropGiveaway 
};