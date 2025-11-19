const { EmbedBuilder, Colors } = require("discord.js");

const COOLDOWN_DURATION = 86400; // 24 ساعة بالثواني
const JAIL_DURATION = 10800; // 3 ساعات بالثواني

function getReportSettings(sql, guildID) {
    return sql.prepare("SELECT * FROM report_settings WHERE guildID = ?").get(guildID) || {};
}

function hasReportPermission(sql, member) {
    if (member.permissions.has('Administrator') || member.id === member.guild.ownerId) {
        return true;
    }
    const settings = getReportSettings(sql, member.guild.id);
    if (!settings.logChannelID) return false; 

    const allowedRoles = sql.prepare("SELECT roleID FROM report_permissions WHERE guildID = ?").all(member.guild.id);
    if (allowedRoles.length === 0) return true; 

    const allowedRoleIDs = allowedRoles.map(r => r.roleID);
    return member.roles.cache.some(r => allowedRoleIDs.includes(r.id));
}

// --- ( 🌟 دالة إرسال الخطأ المصححة 🌟 ) ---
async function sendReportError(destination, title, description, ephemeral = false) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(Colors.Red)
        .setImage("https://i.postimg.cc/L5hmJ9nT/h-K6-Ldr-K-1-2.gif");

    // (للأوامر النصية - الرسائل)
    if (destination.channel && !destination.isCommand && !destination.isInteraction) { 
        try { await destination.delete(); } catch(e) {}
        // نستخدم channel.send بدلاً من reply لتجنب الخطأ إذا حذفت الرسالة
        return destination.channel.send({ content: `${destination.author}`, embeds: [embed] }).then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 10000);
        });
    }

    // (لأوامر السلاش والتفاعلات)
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
// --- ( 🌟 نهاية دالة الخطأ 🌟 ) ---

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

    // تحديد نوع الأمر (هل هو تفاعل أم رسالة عادية)
    const isSlash = !!interactionOrMessage.isChatInputCommand || !!interactionOrMessage.isContextMenuCommand || !!interactionOrMessage.isModalSubmit;
    const ephemeral = isSlash; // نجعل الرد مخفياً فقط إذا كان سلاش/تفاعل

    // --- 1. قواعد الرفض ---
    if (targetMember.id === reporter.id) {
        return sendReportError(interactionOrMessage, "❖ بـلاغ مـرفـوض", "يـليـل وبعدين معـاك تـبـي تبـلغ عـلى نفـسك ؟ مجـنون انـت؟؟ <:2controlyourlewdnyan:1417084755001741312>", ephemeral);
    }
    if (targetMember.id === guild.ownerId) {
        return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "انـت تحـاول تـبلغ على الاونـر ؟؟ بتودينـا بداهيــة اهـرب <:2shocked:1414937309433823262> !!", ephemeral);
    }
    if (targetMember.user.bot) {
        return sendReportError(interactionOrMessage, "❖ تـم رفـض بـلاغـك !", "تحـاول تـبلغ على بـوت ؟؟ صـاحي انـت اقول قم انذلف <a:6bonk:1401906810973327430>", ephemeral);
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);

    // --- 2. نظام منع التكرار (Cooldown) ---
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
            return sendReportError(interactionOrMessage, "❖ بـلاغ مـكـرر !", "حلاوة هي ؟ كل شوي تبلغ على نفس الشخص؟ ممنوع تبلغ على نفس الشخص مرتين باليوم <a:6Headwall:1401840722130374736>", ephemeral);
        }
    }

    // --- 3. تجميع البلاغات ---
    sql.prepare("DELETE FROM active_reports WHERE timestamp < ?").run(currentTimestamp - COOLDOWN_DURATION);
    sql.prepare("INSERT OR REPLACE INTO active_reports (guildID, targetID, reporterID, timestamp) VALUES (?, ?, ?, ?)")
       .run(guild.id, targetMember.id, reporter.id, currentTimestamp);
    const reportCountData = sql.prepare("SELECT COUNT(DISTINCT reporterID) as count FROM active_reports WHERE guildID = ? AND targetID = ?").get(guild.id, targetMember.id);
    const reportCount = reportCountData.count;

    // --- 4. بناء رسالة التأكيد (التي ستظهر للمبلغ) ---
    const embedSuccess = new EmbedBuilder()
        .setTitle("❖ تـم تقديـم البلاغ بنـجـاح")
        .setDescription(
            `✶ متلقي البلاغ: ${targetMember}\n` +
            `✶ سبب البلاغ: ${reason}\n` +
            `✶ عدد البلاغات: ${reportCount}`
        )
        .setColor(Colors.Red) 
        .setImage("https://i.postimg.cc/NGDJd8LZ/image.png");

    // إرسال الرد للمبلغ (مخفي في حالة السلاش)
    if (isSlash) {
        if (interactionOrMessage.replied || interactionOrMessage.deferred) {
            await interactionOrMessage.followUp({ embeds: [embedSuccess], ephemeral: true });
        } else {
            await interactionOrMessage.reply({ embeds: [embedSuccess], ephemeral: true });
        }
    } else {
        // إذا كانت رسالة عادية
        await interactionOrMessage.reply({ embeds: [embedSuccess] });
    }

    // --- 5. إرسال النسخة العامة لقناة البلاغات (فقط إذا كان عبر APPS/Slash) ---
    // لأن البلاغ الكتابي في القناة يظهر أصلاً، أما السلاش المخفي فيحتاج نسخة تظهر للمشرفين
    const reportChannel = REPORT_CHANNEL_ID ? guild.channels.cache.get(REPORT_CHANNEL_ID) : null;

    if (isSlash && reportChannel) {
        const publicEmbed = new EmbedBuilder(embedSuccess.toJSON()) 
            .setFooter({ text: `مقدم البلاغ: ${reporter.user.tag}`, iconURL: reporter.user.displayAvatarURL() }); 

        try {
            // نرسل نسخة للقناة عشان المشرفين يشوفونها
            await reportChannel.send({ content: `${targetMember}`, embeds: [publicEmbed] });
        } catch (e) {
            console.error("Report Handler Error: Failed to send public copy to report channel:", e);
        }
    }

    // --- 6. إرسال البلاغ إلى قناة السجلات (Log Channel - السجل السري) ---
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

    // --- 7. نظام العقاب (السجن التلقائي) ---
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

            // إرسال إشعار السجن في قناة البلاغات
            if (reportChannel) {
                await reportChannel.send({ embeds: [jailEmbed] });
            }

        } catch (e) {
            console.error("خطأ في السجن:", e);
            const errorMsg = `⚠️ **خطأ في السجن:** لم أتمكن من تعديل الأدوار للمستخدم ${targetMember}. يرجى التحقق من صلاحياتي.`;
            if (reportChannel) await reportChannel.send(errorMsg);
        }
    }
}

// (دالة فك السجن - للمهام المجدولة)
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
                await member.roles.remove(jailRole, "انتهاء مدة السجن (3 ساعات) تلقائياً");

                if (logChannel) {
                    const releaseEmbed = new EmbedBuilder()
                        .setTitle("🎉 تـم الإفـراج عن سجين")
                        .setDescription(`المستخدم ${member} تم الإفراج عنه بعد انتهاء مدة سجنة.`)
                        .setColor(Colors.Green);
                    await logChannel.send({ embeds: [releaseEmbed] });
                }
            }
        } catch (e) {
            console.error(`خطأ في فك سجن المستخدم ${record.userID}: ${e}`);
        }

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
