const { EmbedBuilder, Colors } = require("discord.js");

const COOLDOWN_DURATION = 86400; 
const JAIL_DURATION = 10800; 

function getReportSettings(sql, guildID) {
    return sql.prepare("SELECT * FROM report_settings WHERE guildID = ?").get(guildID) || {};
}

function hasReportPermission(sql, member) {
    if (member.permissions.has('Administrator') || member.id === member.guild.ownerId) return true;
    const settings = getReportSettings(sql, member.guild.id);
    if (!settings.logChannelID) return false; 
    const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(member.guild.id);
    if (allowedRoles.length === 0) return true; 
    const allowedRoleIDs = allowedRoles.map(r => r.roleID);
    return member.roles.cache.some(r => allowedRoleIDs.includes(r.id));
}

async function sendReportError(destination, title, description, ephemeral = false) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(Colors.Red)
        .setImage("https://i.postimg.cc/L5hmJ9nT/h-K6-Ldr-K-1-2.gif");

    if (destination.channel && !destination.isCommand && !destination.isInteraction) { 
        try { await destination.delete(); } catch(e) {}
        return destination.channel.send({ content: `${destination.author}`, embeds: [embed] }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 10000);
        });
    }

    try {
        if (destination.replied || destination.deferred) {
            await destination.followUp({ embeds: [embed], ephemeral: ephemeral });
        } else {
            await destination.reply({ embeds: [embed], ephemeral: ephemeral });
        }
    } catch (e) {
        console.error("Failed to send report error:", e);
    }
}

async function processReportLogic(client, interactionOrMessage, targetMember, reason, reportedMessageLink = null) {
    const sql = client.sql;
    const guild = interactionOrMessage.guild;
    const reporter = interactionOrMessage.member;
    const settings = getReportSettings(sql, guild.id);

    const LOG_CHANNEL_ID = settings.logChannelID;
    const JAIL_ROLE_ID = settings.jailRoleID;
    const ARENA_ROLE_ID = settings.arenaRoleID; 
    const UNLIMITED_ROLE_ID = settings.unlimitedRoleID;
    const TEST_ROLE_ID = settings.testRoleID;
    const REPORT_CHANNEL_ID = settings.reportChannelID; 

    const isSlash = !!interactionOrMessage.isChatInputCommand || !!interactionOrMessage.isContextMenuCommand || !!interactionOrMessage.isModalSubmit;
    
    // --- 1. قواعد الرفض ---
    if (targetMember.id === reporter.id) {
        return sendReportError(interactionOrMessage, "❖ بـلاغ مـرفـوض", "لا يمكنك البلاغ على نفسك.", true);
    }
    if (targetMember.id === guild.ownerId) {
        return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "لا يمكنك البلاغ على الأونر.", true);
    }
    if (targetMember.user.bot) {
        return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "لا يمكنك البلاغ على بوت.", true);
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const unlimitedRole = UNLIMITED_ROLE_ID ? guild.roles.cache.get(UNLIMITED_ROLE_ID) : null;
    const testRole = TEST_ROLE_ID ? guild.roles.cache.get(TEST_ROLE_ID) : null;

    const isUnlimited = (
        reporter.permissions.has('Administrator') ||
        reporter.id === guild.ownerId ||
        (unlimitedRole && reporter.roles.cache.has(unlimitedRole.id)) ||
        (testRole && reporter.roles.cache.has(testRole.id))
    );

    if (!isUnlimited) {
        const cooldownRecord = sql.prepare("SELECT timestamp FROM active_reports WHERE guildID = ? AND targetID = ? AND reporterID = ?").get(guild.id, targetMember.id, reporter.id);
        if (cooldownRecord && (currentTimestamp - cooldownRecord.timestamp) < COOLDOWN_DURATION) {
            return sendReportError(interactionOrMessage, "❖ بـلاغ مـكـرر !", "لقد قمت بالبلاغ عن هذا الشخص مسبقاً.", true);
        }
    }

    sql.prepare("DELETE FROM active_reports WHERE timestamp < ?").run(currentTimestamp - COOLDOWN_DURATION);
    sql.prepare("INSERT OR REPLACE INTO active_reports (guildID, targetID, reporterID, timestamp) VALUES (?, ?, ?, ?)")
       .run(guild.id, targetMember.id, reporter.id, currentTimestamp);
    const reportCountData = sql.prepare("SELECT COUNT(DISTINCT reporterID) as count FROM active_reports WHERE guildID = ? AND targetID = ?").get(guild.id, targetMember.id);
    const reportCount = reportCountData.count;

    // --- بناء الإيمبد الأساسي ---
    const embedSuccess = new EmbedBuilder()
        .setTitle("❖ تـم تقديـم البلاغ بنـجـاح")
        .setDescription(
            `✶ متلقي البلاغ: ${targetMember}\n` +
            `✶ سبب البلاغ: ${reason}\n` +
            `✶ عدد البلاغات: ${reportCount}`
        )
        .setColor(Colors.Red) 
        .setImage("https://i.postimg.cc/NGDJd8LZ/image.png");

    // =================================================================
    // 🌟 التعديل المطلوب هنا: التعامل مع APPS vs رسائل عادية 🌟
    // =================================================================
    if (isSlash) {
        // 1. رد مخفي للمبلغ (Ephemeral)
        if (interactionOrMessage.replied || interactionOrMessage.deferred) {
            await interactionOrMessage.followUp({ embeds: [embedSuccess], ephemeral: true });
        } else {
            await interactionOrMessage.reply({ embeds: [embedSuccess], ephemeral: true });
        }

        // 2. إرسال نسخة لقناة البلاغات بتذييل "APPS RE"
        const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;
        if (reportChannel) {
            const publicEmbed = new EmbedBuilder(embedSuccess.toJSON())
                .setFooter({ text: "APPS RE" }); // ✅ التذييل المطلوب

            await reportChannel.send({ content: `${targetMember}`, embeds: [publicEmbed] });
        }

    } else {
        // بلاغ عادي (رسالة) -> رد عادي
        await interactionOrMessage.reply({ embeds: [embedSuccess] });
    }

    // --- إرسال للوج (Log) ---
    const logChannel = LOG_CHANNEL_ID ? guild.channels.cache.get(LOG_CHANNEL_ID) : null;
    if (logChannel) {
        const reportLinkText = reportedMessageLink ? `\n**🔗 رابط الرسالة:** [إضغط هنا](${reportedMessageLink})` : "";
        const logEmbed = new EmbedBuilder()
            .setTitle("📢 بــلاغ جــديــد")
            .setDescription(
                `✶ المبلغ: ${reporter}\n` +
                `✶ متلقي البلاغ: ${targetMember}\n` +
                `✶ سبب البلاغ: ${reason}` +
                `${reportLinkText}\n` +
                `✶ عدد البلاغات: ${reportCount}`
            )
            .setColor(Colors.Red)
            .setTimestamp();
        await logChannel.send({ embeds: [logEmbed] });
    }

    // --- السجن ---
    if (reportCount >= 2) {
        try {
            const jailRole = JAIL_ROLE_ID ? guild.roles.cache.get(JAIL_ROLE_ID) : null;
            const arenaRole = ARENA_ROLE_ID ? guild.roles.cache.get(ARENA_ROLE_ID) : null;

            if (arenaRole && targetMember.roles.cache.has(arenaRole.id)) {
                await targetMember.roles.remove(arenaRole, "تلقى بلاغين - سجن (3 ساعات)");
            }
            if (jailRole) {
                await targetMember.roles.add(jailRole, "تلقى بلاغين - سجن (3 ساعات)");
            }

            const unjailTime = currentTimestamp + JAIL_DURATION;
            sql.prepare("INSERT OR REPLACE INTO jailed_members (guildID, userID, unjailTime) VALUES (?, ?, ?)").run(guild.id, targetMember.id, unjailTime);
            sql.prepare("DELETE FROM active_reports WHERE guildID = ? AND targetID = ?").run(guild.id, targetMember.id);

            const jailEmbed = new EmbedBuilder()
                .setTitle("❖ تلقـى بلاغين وتـم سـجـنـه!")
                .setDescription(`✶ المنفي: ${targetMember}\n✶ مدة السجن: 3 ساعات`)
                .setColor(Colors.Blue)
                .setImage("https://i.postimg.cc/L6TpBZMs/image.png");

            const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;
            if (reportChannel) {
                await reportChannel.send({ embeds: [jailEmbed] });
            }

        } catch (e) {
            console.error("خطأ في السجن:", e);
        }
    }
}

async function checkUnjailTask(client) {
    const sql = client.sql;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const jailedToRelease = sql.prepare("SELECT * FROM jailed_members WHERE unjailTime <= ?").all(currentTimestamp);

    for (const record of jailedToRelease) {
        const guild = client.guilds.cache.get(record.guildID);
        if (!guild) {
            sql.prepare("DELETE FROM jailed_members WHERE guildID = ? AND userID = ?").run(record.guildID, record.userID);
            continue;
        }
        const settings = getReportSettings(sql, guild.id);
        const jailRoleID = settings.jailRoleID;
        if (!jailRoleID) {
            sql.prepare("DELETE FROM jailed_members WHERE guildID = ? AND userID = ?").run(record.guildID, record.userID);
            continue;
        }
        const jailRole = guild.roles.cache.get(jailRoleID);
        const logChannel = settings.logChannelID ? guild.channels.cache.get(settings.logChannelID) : null;

        try {
            const member = await guild.members.fetch(record.userID);
            if (member && jailRole && member.roles.cache.has(jailRole.id)) {
                await member.roles.remove(jailRole, "انتهاء مدة السجن");
                if (logChannel) {
                    const releaseEmbed = new EmbedBuilder().setTitle("🎉 تـم الإفـراج عن سجين").setDescription(`المستخدم ${member} تم الإفراج عنه.`).setColor(Colors.Green);
                    await logChannel.send({ embeds: [releaseEmbed] });
                }
            }
        } catch (e) {}
        sql.prepare("DELETE FROM jailed_members WHERE guildID = ? AND userID = ?").run(record.guildID, record.userID);
    }
}

module.exports = {
    getReportSettings,
    hasReportPermission,
    sendReportError,
    processReportLogic,
    checkUnjailTask
};
