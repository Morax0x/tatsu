const { PermissionsBitField, EmbedBuilder, Colors } = require("discord.js");

const DAY_MS = 24 * 60 * 60 * 1000;
const KSA_TIMEZONE = 'Asia/Riyadh';

// --- (إيموجيات مطلوبة) ---
const EMOJI_MEDIA_STREAK = '<a:Streak:1438932297519730808>';
const EMOJI_SHIELD = '<:Shield:1437804676224516146>';

// قائمة الفواصل الجديدة لعملية التنظيف
const ALLOWED_SEPARATORS_REGEX = ['\\|', '•', '»', '✦', '★', '❖', '✧', '✬', '〢', '┇'];

function getKSADateString(dateObject) {
    return new Date(dateObject).toLocaleString('en-CA', {
        timeZone: KSA_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function getDayDifference(dateStr1, dateStr2) {
    const date1 = new Date(dateStr1);
    const date2 = new Date(dateStr2);
    date1.setUTCHours(0, 0, 0, 0);
    date2.setUTCHours(0, 0, 0, 0);
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.round(diffTime / DAY_MS);
}

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0) return `~${hours} ساعة و ${minutes} دقيقة`;
    if (minutes > 0) return `~${minutes} دقيقة`;
    return "أقل من دقيقة";
}

function calculateBuffMultiplier(member, sql) {
    if (!sql || typeof sql.prepare !== 'function') {
        console.error("[XP Buff] ERROR: 'sql' connection not passed correctly.");
        return 1.0;
    }
    const getUserBuffs = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND expiresAt > ? AND buffType = 'xp'");
    let totalPercent = 0.0;
    const day = new Date().getUTCDay();
    if (day === 5 || day === 6 || day === 0) totalPercent += 0.10;
    let highestRoleBuff = 0;
    const userRoles = member.roles.cache.map(r => r.id);
    if (userRoles.length > 0) {
        const placeholders = userRoles.map(() => '?').join(',');
        const roleBuffs = sql.prepare(`SELECT * FROM role_buffs WHERE roleID IN (${placeholders})`).all(...userRoles);
        for (const buff of roleBuffs) {
            if (buff.buffPercent > highestRoleBuff) highestRoleBuff = buff.buffPercent;
        }
    }
    totalPercent += (highestRoleBuff / 100);
    let itemBuffTotal = 0;
    const userBuffs = getUserBuffs.all(member.id, member.guild.id, Date.now());
    for (const buff of userBuffs) {
        itemBuffTotal += buff.multiplier;
    }
    totalPercent += itemBuffTotal;

    if (totalPercent < -1.0) totalPercent = -1.0;

    return 1.0 + totalPercent;
}

// --- ( ⬇️ هذا هو التعديل المطلوب ⬇️ ) ---
function calculateMoraBuff(member, sql) {
    if (!sql || typeof sql.prepare !== 'function') {
        console.error("[Mora Buff] ERROR: 'sql' connection not passed correctly.");
        return 1.0;
    }
    let totalBuffPercent = 0;

    // --- ( ⬇️ تمت إضافة بوف عطلة نهاية الأسبوع هنا ⬇️ ) ---
    const day = new Date().getUTCDay(); // (0=الأحد, 5=الجمعة, 6=السبت)
    if (day === 5 || day === 6 || day === 0) {
        totalBuffPercent += 10; // إضافة 10%
    }
    // --- ( ⬆️ نهاية الإضافة ⬆️ ) ---

    const userRoles = member.roles.cache.map(r => r.id);
    const guildID = member.guild.id;

    const allBuffRoles = sql.prepare("SELECT * FROM role_mora_buffs WHERE guildID = ?").all(guildID);

    let roleBuffSum = 0;
    for (const roleId of userRoles) {
        const buffRole = allBuffRoles.find(r => r.roleID === roleId);
        if (buffRole) {
            roleBuffSum += buffRole.buffPercent;
        }
    }
    totalBuffPercent += roleBuffSum;

    const tempBuffs = sql.prepare("SELECT * FROM user_buffs WHERE guildID = ? AND userID = ? AND buffType = 'mora' AND expiresAt > ?")
        .all(guildID, member.id, Date.now());

    tempBuffs.forEach(buff => {
        totalBuffPercent += buff.buffPercent;
    });

    let finalMultiplier = 1 + (totalBuffPercent / 100);
    if (finalMultiplier < 0) finalMultiplier = 0;

    return finalMultiplier;
}
// --- ( ⬆️ نهاية التعديل ⬆️ ) ---


async function updateNickname(member, sql) {
    if (!member) return;
    if (!sql || typeof sql.prepare !== 'function') {
        console.error("[Update Nickname] ERROR: 'sql' connection not passed correctly.");
        return;
    }
    if (member.id === member.guild.ownerId) return;
    if (!member.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageNicknames)) return;
    if (!member.manageable) return;

    const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(member.guild.id, member.id);
    const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?").get(member.guild.id);
    const streakEmoji = settings?.streakEmoji || '🔥';

    const separator = streakData?.separator || '|';
    const streakCount = streakData?.streakCount || 0;
    const nicknameActive = streakData?.nicknameActive ?? 1;

    let baseName = member.displayName;

    const escapedEmoji = streakEmoji.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    const regexString = `\\s*(${ALLOWED_SEPARATORS_REGEX.join('|')})\\s*\\d+\\s* ?${escapedEmoji}`;
    const regex = new RegExp(regexString, 'g');

    baseName = baseName.replace(regex, '').trim();

    let newName;
    if (streakCount > 0 && nicknameActive) {
        newName = `${baseName} ${separator} ${streakCount} ${streakEmoji}`;
    } else {
        newName = baseName;
    }

    if (newName.length > 32) {
        const streakText = ` ${separator} ${streakCount} ${streakEmoji}`;
        baseName = baseName.substring(0, 32 - streakText.length);
        newName = `${baseName}${streakText}`;
    }

    if (member.displayName !== newName) {
        try {
            await member.setNickname(newName);
        } catch (err) {
            console.error(`[Streak Nickname] Failed to update nickname for ${member.user.tag}: ${err.message}`);
        }
    }
}

async function checkDailyStreaks(client, sql) {
    console.log("[Streak] 🔄 بدء الفحص اليومي للستريك...");
    const allStreaks = sql.prepare("SELECT * FROM streaks WHERE streakCount > 0").all();
    const todayKSA = getKSADateString(Date.now());

    const updateStreak = sql.prepare("UPDATE streaks SET streakCount = @streakCount, hasGracePeriod = @hasGracePeriod, hasItemShield = @hasItemShield WHERE id = @id");
    const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?");

    for (const streakData of allStreaks) {
        const lastDateKSA = getKSADateString(streakData.lastMessageTimestamp);
        const diffDays = getDayDifference(todayKSA, lastDateKSA);

        if (diffDays <= 1) {
            continue;
        }

        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID);
            member = await guild.members.fetch(streakData.userID);
        } catch (err) {
            console.error(`[Streak Check] لم يتم العثور على العضو ${streakData.userID} في السيرفر ${streakData.guildID}.`);
            continue;
        }

        const streakEmoji = settings.get(streakData.guildID)?.streakEmoji || '🔥';
        const sendDM = streakData.dmNotify === 1;

        if (diffDays === 2) {

            if (streakData.hasItemShield === 1) {
                streakData.hasItemShield = 0;
                updateStreak.run(streakData);
                console.log(`[Streak Check] تم استهلاك درع المتجر لـ ${member.user.tag}.`);

                if (sendDM) {
                    const embed = new EmbedBuilder()
                        .setTitle('✶ اشـعـارات الـستريـك')
                        .setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(
                            "- تـم استهـلاك درع الـمتـجر ليحـمي الـستريـك من الـضيـاع 🛡️!\n" +
                            `- سـتريـكك الـحـالي: ${streakData.streakCount} ${streakEmoji}\n` +
                            "- تأكد من إرسال رسالة اليوم لمواصلته <:stop:1436337453098340442>"
                        );
                    member.send({ embeds: [embed] }).catch(e => console.log("Failed to DM user about item shield."));
                }

            } else if (streakData.hasGracePeriod === 1) {
                streakData.hasGracePeriod = 0;
                updateStreak.run(streakData);
                console.log(`[Streak Check] تم استهلاك الدرع المجاني لـ ${member.user.tag}.`);

                if (sendDM) {
                    const embed = new EmbedBuilder()
                        .setTitle('✶ اشـعـارات الـستريـك')
                        .setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(
                            "- تـم استهـلاك الدرع المجـاني ليحـمي الـستريـك من الـضيـاع 🛡️!\n" +
                            `- سـتريـكك الـحـالي: ${streakData.streakCount} ${streakEmoji}\n` +
                            "- تأكد من إرسال رسالة اليوم لمواصلته <:stop:1436337453098340442>"
                        );
                    member.send({ embeds: [embed] }).catch(e => console.log("Failed to DM user about grace period."));
                }

            } else {
                const oldStreak = streakData.streakCount;
                streakData.streakCount = 0;
                streakData.hasGracePeriod = 0;
                updateStreak.run(streakData);
                console.log(`[Streak Check] ضاع الستريك لـ ${member.user.tag}.`);

                if (sendDM) {
                    const embed = new EmbedBuilder()
                        .setTitle('✶ اشـعـارات الـستريـك')
                        .setColor(Colors.Red)
                        .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                        .setDescription(
                            "- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت الـستريـك 💔\n" +
                            `- لم تكن تملك اي درع للحماية وانقطعت عن السيرفر كـان ستريـكك: ${oldStreak}\n` +
                            "- أرسل رسالة جـديـدة لبدء ستريك جديد !"
                        );
                    member.send({ embeds: [embed] }).catch(e => console.log("Failed to DM user about streak loss."));
                }

                if (streakData.nicknameActive === 1) {
                    await updateNickname(member, sql);
                }
            }

        } else if (diffDays > 2) {
            const oldStreak = streakData.streakCount;
            streakData.streakCount = 0;
            streakData.hasGracePeriod = 0;
            updateStreak.run(streakData);
            console.log(`[Streak Check] ضاع الستريك (غياب طويل) لـ ${member.user.tag}.`);

            if (sendDM) {
                const embed = new EmbedBuilder()
                    .setTitle('✶ اشـعـارات الـستريـك')
                    .setColor(Colors.Red)
                    .setImage('https://i.postimg.cc/NfLYXwD5/123.jpg')
                    .setDescription(
                        "- يؤسـفنـا ابلاغـك بـ انـك قـد فقدت الـستريـك 💔\n" +
                        `- لقد انقطعت عن السيرفر مدة طويلة، كـان ستريـكك: ${oldStreak}\n` +
                        "- أرسل رسالة جـديـدة لبدء ستريك جديد !"
                    );
                member.send({ embeds: [embed] }).catch(e => console.log("Failed to DM user about streak loss."));
            }

            if (streakData.nicknameActive === 1) {
                await updateNickname(member, sql);
            }
        }
    }
    console.log(`[Streak] ✅ اكتمل الفحص اليومي للستريك. (تم فحص ${allStreaks.length} عضو)`);
}


async function handleStreakMessage(message) {
    const sql = message.client.sql;

    const getStreak = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?");
    const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield, nicknameActive, hasReceivedFreeShield, separator, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield, @nicknameActive, @hasReceivedFreeShield, @separator, @dmNotify, @highestStreak);");
    const updateStreakData = sql.prepare("UPDATE streaks SET lastMessageTimestamp = @lastMessageTimestamp, streakCount = @streakCount, highestStreak = @highestStreak WHERE id = @id");

    const getLevel = message.client.getLevel;
    const setLevel = message.client.setLevel;

    const now = Date.now();
    const todayKSA = getKSADateString(now);

    const guildID = message.guild.id;
    const userID = message.author.id;
    const id = `${guildID}-${userID}`;

    let streakData = getStreak.get(guildID, userID);

    if (!streakData) {
        streakData = {
            id: id,
            guildID,
            userID,
            streakCount: 1,
            lastMessageTimestamp: now,
            hasGracePeriod: 1,
            hasItemShield: 0,
            nicknameActive: 1,
            hasReceivedFreeShield: 1,
            separator: '|',
            dmNotify: 1,
            highestStreak: 1
        };
        setStreak.run(streakData);
        console.log(`[Streak] New streak started for ${message.author.tag}. Count: 1. (Free Shield Granted)`);
        await updateNickname(message.member, sql);

    } else {
        const lastDateKSA = getKSADateString(streakData.lastMessageTimestamp);

        if (todayKSA === lastDateKSA) {
            return;
        }

        if (typeof streakData.dmNotify === 'undefined' || typeof streakData.highestStreak === 'undefined') {
            streakData.dmNotify = streakData.dmNotify ?? 1;
            streakData.highestStreak = streakData.highestStreak ?? streakData.streakCount;
            sql.prepare("UPDATE streaks SET dmNotify = ?, highestStreak = ? WHERE id = ?").run(streakData.dmNotify, streakData.highestStreak, id);
        }

        if (streakData.streakCount === 0) {
            streakData.streakCount = 1;
            streakData.lastMessageTimestamp = now;
            streakData.hasGracePeriod = 0;
            streakData.hasItemShield = 0;
            if (streakData.highestStreak < 1) streakData.highestStreak = 1;

            setStreak.run(streakData);
            console.log(`[Streak] New streak started (from 0) for ${message.author.tag}. Count: 1. (No Free Shield)`);
            await updateNickname(message.member, sql);

        } else {
            const diffDays = getDayDifference(todayKSA, lastDateKSA);

            if (diffDays === 1) {
                streakData.streakCount += 1;
                streakData.lastMessageTimestamp = now;

                if (streakData.streakCount > streakData.highestStreak) {
                    streakData.highestStreak = streakData.streakCount;
                }

                updateStreakData.run(streakData);
                console.log(`[Streak] Continued for ${message.author.tag}. Count: ${streakData.streakCount}`);

                if (streakData.streakCount > 10) {
                    let levelData = getLevel.get(userID, guildID);
                    if (!levelData) {
                        levelData = { ...message.client.defaultData, user: userID, guild: guildID };
                    }
                    levelData.mora = (levelData.mora || 0) + 100;
                    levelData.xp = (levelData.xp || 0) + 100;
                    levelData.totalXP = (levelData.totalXP || 0) + 100;
                    setLevel.run(levelData);
                    console.log(`[Streak] Awarded 100 mora/xp bonus to ${message.author.tag} for streak ${streakData.streakCount}.`);
                }

                await updateNickname(message.member, sql);
            } else {
                sql.prepare("UPDATE streaks SET lastMessageTimestamp = ? WHERE id = ?").run(now, id);
            }
        }
    }
}


// ===============================================
// == الإضافات الجديدة الخاصة بستريك الميديا ==
// ===============================================

async function handleMediaStreakMessage(message) {
    const sql = message.client.sql;

    const getStreak = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?");
    const setStreak = sql.prepare("INSERT OR REPLACE INTO media_streaks (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak);");
    const updateStreakData = sql.prepare("UPDATE media_streaks SET lastMediaTimestamp = @lastMediaTimestamp, streakCount = @streakCount, highestStreak = @highestStreak WHERE id = @id");

    const now = Date.now();
    const todayKSA = getKSADateString(now);
    const guildID = message.guild.id;
    const userID = message.author.id;
    const id = `${guildID}-${userID}`;

    let streakData = getStreak.get(guildID, userID);
    let isNewStreakToday = false; 

    if (!streakData) {
        streakData = {
            id: id, guildID, userID,
            streakCount: 1,
            lastMediaTimestamp: now,
            hasGracePeriod: 1, 
            hasItemShield: 0,
            hasReceivedFreeShield: 1,
            dmNotify: 1,
            highestStreak: 1
        };
        setStreak.run(streakData);
        console.log(`[Media Streak] New streak started for ${message.author.tag}. Count: 1.`);
        isNewStreakToday = true;

    } else {
        const lastDateKSA = getKSADateString(streakData.lastMediaTimestamp);

        if (todayKSA === lastDateKSA) {
            return; 
        }

        if (typeof streakData.dmNotify === 'undefined' || typeof streakData.highestStreak === 'undefined') {
            streakData.dmNotify = streakData.dmNotify ?? 1;
            streakData.highestStreak = streakData.highestStreak ?? streakData.streakCount;
            sql.prepare("UPDATE media_streaks SET dmNotify = ?, highestStreak = ? WHERE id = ?").run(streakData.dmNotify, streakData.highestStreak, id);
        }

        if (streakData.streakCount === 0) {
            streakData.streakCount = 1;
            streakData.lastMediaTimestamp = now;
            streakData.hasGracePeriod = 0; 
            streakData.hasItemShield = 0;
            if (streakData.highestStreak < 1) streakData.highestStreak = 1;

            setStreak.run(streakData);
            console.log(`[Media Streak] New streak started (from 0) for ${message.author.tag}. Count: 1.`);
            isNewStreakToday = true;

        } else {
            const diffDays = getDayDifference(todayKSA, lastDateKSA);

            if (diffDays === 1) {
                streakData.streakCount += 1;
                streakData.lastMediaTimestamp = now;
                if (streakData.streakCount > streakData.highestStreak) {
                    streakData.highestStreak = streakData.streakCount;
                }
                updateStreakData.run(streakData);
                console.log(`[Media Streak] Continued for ${message.author.tag}. Count: ${streakData.streakCount}`);
                isNewStreakToday = true;

            } else {
                streakData.streakCount = 1;
                streakData.lastMediaTimestamp = now;
                streakData.hasGracePeriod = 0; 
                streakData.hasItemShield = 0; 
                setStreak.run(streakData); 
                console.log(`[Media Streak] Restarted (after loss) for ${message.author.tag}. Count: 1.`);
                isNewStreakToday = true;
            }
        }
    }

    if (isNewStreakToday) {
        if (streakData.streakCount > 10) {
            try {
                let levelData = message.client.getLevel.get(userID, guildID);
                if (!levelData) {
                    levelData = { ...message.client.defaultData, user: userID, guild: guildID };
                }
                levelData.mora = (levelData.mora || 0) + 100;
                levelData.xp = (levelData.xp || 0) + 100;
                levelData.totalXP = (levelData.totalXP || 0) + 100;
                message.client.setLevel.run(levelData);
                console.log(`[Media Streak] Awarded 100 mora/xp bonus to ${message.author.tag} for streak ${streakData.streakCount}.`);
            } catch (err) {
                console.error("[Media Streak] Failed to give rewards:", err);
            }
        }

        try {
            const reactionEmoji = EMOJI_MEDIA_STREAK.match(/<a?:\w+:(\d+)>/);
            if(reactionEmoji) await message.react(reactionEmoji[1]);
        } catch (e) {
            console.error("[Media Streak] Failed to react:", e.message);
        }

        try {
            const totalShields = (streakData.hasGracePeriod || 0) + (streakData.hasItemShield || 0);
            const shieldText = totalShields > 0 ? ` | ${totalShields} ${EMOJI_SHIELD}` : '';

            const replyMsg = await message.reply({
                content: `✥ تـم تـحديـث ستـريـك الميـديـا: ${streakData.streakCount} ${EMOJI_MEDIA_STREAK}${shieldText}`,
                allowedMentions: { repliedUser: false } 
            });

            setTimeout(() => {
                replyMsg.delete().catch(e => console.error("Failed to delete streak reply:", e.message));
            }, 10000);

        } catch (e) {
            console.error("[Media Streak] Failed to send reply:", e.message);
        }
    }
}


async function checkDailyMediaStreaks(client, sql) {
    console.log("[Media Streak] 🔄 بدء الفحص اليومي لستريك الميديا...");
    const allStreaks = sql.prepare("SELECT * FROM media_streaks WHERE streakCount > 0").all();
    const todayKSA = getKSADateString(Date.now());

    const updateStreak = sql.prepare("UPDATE media_streaks SET streakCount = @streakCount, hasGracePeriod = @hasGracePeriod, hasItemShield = @hasItemShield WHERE id = @id");

    for (const streakData of allStreaks) {
        const lastDateKSA = getKSADateString(streakData.lastMediaTimestamp);
        const diffDays = getDayDifference(todayKSA, lastDateKSA);

        if (diffDays <= 1) continue; 

        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID);
            member = await guild.members.fetch(streakData.userID);
        } catch (err) {
            continue;
        }

        const sendDM = streakData.dmNotify === 1;
        const emoji = EMOJI_MEDIA_STREAK;

        if (diffDays === 2) {
            if (streakData.hasItemShield === 1) {
                streakData.hasItemShield = 0;
                updateStreak.run(streakData);
                console.log(`[Media Streak Check] تم استهلاك درع المتجر لـ ${member.user.tag}.`);
                if (sendDM) {
                    const embed = new EmbedBuilder().setTitle(`✶ اشـعـارات ستريك الميديا ${emoji}`).setColor(Colors.Red)
                        .setDescription(`- تـم استهـلاك درع الـمتـجر ليحـمي ستريك الميديا من الـضيـاع 🛡️!\n- ستريك الميديا الـحـالي: ${streakData.streakCount} ${emoji}\n- تأكد من إرسال صورة/فيديو اليوم لمواصلته <:stop:1436337453098340442>`);
                    member.send({ embeds: [embed] }).catch(() => {});
                }
            } else if (streakData.hasGracePeriod === 1) {
                streakData.hasGracePeriod = 0;
                updateStreak.run(streakData);
                console.log(`[Media Streak Check] تم استهلاك الدرع المجاني لـ ${member.user.tag}.`);
                if (sendDM) {
                     const embed = new EmbedBuilder().setTitle(`✶ اشـعـارات ستريك الميديا ${emoji}`).setColor(Colors.Red)
                        .setDescription(`- تـم استهـلاك الدرع المجـاني ليحـمي ستريك الميديا من الـضيـاع 🛡️!\n- ستريك الميديا الـحـالي: ${streakData.streakCount} ${emoji}\n- تأكد من إرسال صورة/فيديو اليوم لمواصلته <:stop:1436337453098340442>`);
                    member.send({ embeds: [embed] }).catch(() => {});
                }
            } else {
                streakData.streakCount = 0;
                streakData.hasGracePeriod = 0;
                updateStreak.run(streakData);
                console.log(`[Media Streak Check] ضاع ستريك الميديا لـ ${member.user.tag}.`);
            }
        } else if (diffDays > 2) {
            streakData.streakCount = 0;
            streakData.hasGracePeriod = 0;
            updateStreak.run(streakData);
            console.log(`[Media Streak Check] ضاع الستريك (غياب طويل) لـ ${member.user.tag}.`);
        }
    }
    console.log(`[Media Streak] ✅ اكتمل الفحص اليومي لستريك الميديا.`);
}


async function sendMediaStreakReminders(client, sql) {
    console.log("[Media Streak] ⏰ إرسال تذكيرات الستريك (3 العصر)...");
    const todayKSA = getKSADateString(Date.now());

    const allMediaChannels = sql.prepare("SELECT * FROM media_streak_channels").all();
    const guilds = {}; 

    const activeStreaks = sql.prepare("SELECT * FROM media_streaks WHERE streakCount > 0").all();

    for (const streak of activeStreaks) {
        const lastDateKSA = getKSADateString(streak.lastMediaTimestamp);
        if (lastDateKSA !== todayKSA) {
            if (!guilds[streak.guildID]) {
                guilds[streak.guildID] = [];
            }
            guilds[streak.guildID].push(streak.userID);
        }
    }

    for (const [guildID, userIDs] of Object.entries(guilds)) {
        if (userIDs.length === 0) continue;

        const targetChannels = allMediaChannels.filter(c => c.guildID === guildID);
        if (!targetChannels || targetChannels.length === 0) {
            console.log(`[Media Streak] لا يوجد روم ميديا لإرسال التذكير في سيرفر ${guildID}`);
            continue;
        }

        const mentions = userIDs.map(id => `<@${id}>`).join(' ');
        const embed = new EmbedBuilder()
            .setTitle(`🔔 تـذكـيـر ستـريـك المـيـديـا`)
            .setColor(Colors.Yellow)
            .setDescription(`- نـود تـذكيـركـم بـإرسـال المـيـديـا الخـاصـة بكـم لهـذا اليـوم ${EMOJI_MEDIA_STREAK}\n\n- بـاقـي علـى نهـايـة اليـوم أقـل مـن 9 سـاعـات!`)
            .setThumbnail('https://i.postimg.cc/8z0Xw04N/attention.png'); 

        for (const channelData of targetChannels) {
            try {
                const channel = await client.channels.fetch(channelData.channelID);

                if (channelData.lastReminderMessageID) {
                    const oldMessage = await channel.messages.fetch(channelData.lastReminderMessageID).catch(() => null);
                    if (oldMessage) {
                        await oldMessage.delete().catch(e => console.error(`[Media Streak] فشل حذف التذكير القديم: ${e.message}`));
                    }
                }
                const sentMessage = await channel.send({ content: mentions, embeds: [embed] });
                sql.prepare("UPDATE media_streak_channels SET lastReminderMessageID = ? WHERE guildID = ? AND channelID = ?")
                   .run(sentMessage.id, guildID, channel.id);

                console.log(`[Media Streak] تم إرسال تذكير في ${channel.name}.`);

            } catch (err) {
                console.error(`[Media Streak] فشل إرسال التذكير في ${guildID} (Channel: ${channelData.channelID}):`, err.message);
            }
        }
    }
}


async function sendDailyMediaUpdate(client, sql) {
    console.log("[Media Streak] 📰 إرسال التقرير اليومي (12 منتصف الليل)...");

    const allMediaChannels = sql.prepare("SELECT * FROM media_streak_channels").all();
    const allSettings = sql.prepare("SELECT * FROM settings").all();
    const todayKSA = getKSADateString(Date.now());

    const guilds = {};
    for (const ch of allMediaChannels) {
        if (!guilds[ch.guildID]) {
            guilds[ch.guildID] = { channels: [], settings: null };
        }
        guilds[ch.guildID].channels.push(ch.channelID);
    }

    for (const settings of allSettings) {
        if (guilds[settings.guild]) {
            guilds[settings.guild].settings = settings;
        } else {
            guilds[settings.guild] = { channels: [], settings: settings };
        }
    }

    for (const guildID of Object.keys(guilds)) {
        const guildData = guilds[guildID];

        if (guildData.settings && guildData.settings.lastMediaUpdateSent === todayKSA) {
            console.log(`[Media Streak] تم تخطي إرسال التقرير لـ ${guildID} (تم إرساله اليوم).`);
            continue;
        }

        if (guildData.channels.length === 0) {
            continue;
        }

        const topStreaks = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND streakCount > 0 ORDER BY streakCount DESC LIMIT 10").all(guildID);
        let description = `**${EMOJI_MEDIA_STREAK} بـدأ يـوم جـديـد لستريـك الميـديـا! ${EMOJI_MEDIA_STREAK}**\n\n- لا تنسـوا إرسـال المـيـديـا الخـاصـة بكـم لهـذا اليـوم.\n\n`;
        if (topStreaks.length > 0) {
            description += "**🏆 قـائـمـة الأعـلـى فـي الستـريـك:**\n";
            const leaderboard = topStreaks.map((streak, index) => {
                const medals = ['🥇', '🥈', '🥉'];
                const rank = medals[index] || `**${index + 1}.**`;
                return `${rank} <@${streak.userID}> - \`${streak.streakCount}\` يوم`;
            });
            description += leaderboard.join('\n');
        } else {
            description += "لا يوجـد أحـد لـديـه ستريـك مـيـديـا حـالـيـاً. كـن أول الـمـشاركـيـن!";
        }
        const embed = new EmbedBuilder()
            .setTitle("☀️ تـحـديـث ستـريـك المـيـديـا")
            .setColor(Colors.Aqua)
            .setDescription(description)
            .setImage('https://i.postimg.cc/mD7Q31TR/New-Day.png'); 


        let messageSent = false;
        let firstSentMessageID = null;
        let firstSentChannelID = null;

        for (const channelID of guildData.channels) {
            try {
                const channel = await client.channels.fetch(channelID);

                if (guildData.settings && guildData.settings.lastMediaUpdateMessageID && guildData.settings.lastMediaUpdateChannelID === channelID) {
                    const oldMessage = await channel.messages.fetch(guildData.settings.lastMediaUpdateMessageID).catch(() => null);
                    if (oldMessage) {
                        await oldMessage.delete().catch(e => console.error(`[Media Streak] فشل حذف التقرير القديم: ${e.message}`));
                    }
                }

                const sentMessage = await channel.send({ embeds: [embed] });

                if (!messageSent) {
                    firstSentMessageID = sentMessage.id;
                    firstSentChannelID = channel.id;
                    messageSent = true;
                }

            } catch (err) {
                console.error(`[Media Streak] فشل إرسال التقرير اليومي في ${channelID}:`, err.message);
            }
        }

        if (messageSent) { 
            if (!guildData.settings) {
                sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(guildID);
            }
             sql.prepare(
                "UPDATE settings SET lastMediaUpdateSent = ?, lastMediaUpdateMessageID = ?, lastMediaUpdateChannelID = ? WHERE guild = ?"
             ).run(todayKSA, firstSentMessageID, firstSentChannelID, guildID);
        }
    }
}


// --- ( ⬇️ هذه هي الدالة الجديدة التي أضفناها ⬇️ ) ---
async function sendStreakWarnings(client, sql) {
    console.log("[Streak Warning] ⏰ بدء فحص تحذيرات الـ 12 ساعة...");
    const now = Date.now();
    const twelveHoursAgo = now - (12 * 60 * 60 * 1000);
    const thirtySixHoursAgo = now - (36 * 60 * 60 * 1000); // لتجنب تحذير من سيفقد الستريك بكل الأحوال

    const updateWarning = sql.prepare("UPDATE streaks SET has12hWarning = 1 WHERE id = ?");
    const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?");

    const usersToWarn = sql.prepare(`
        SELECT * FROM streaks 
        WHERE streakCount > 0 
        AND has12hWarning = 0 
        AND dmNotify = 1
        AND lastMessageTimestamp < ? 
        AND lastMessageTimestamp > ?
    `).all(twelveHoursAgo, thirtySixHoursAgo);

    let warnedCount = 0;
    for (const streakData of usersToWarn) {
        let member;
        try {
            const guild = await client.guilds.fetch(streakData.guildID);
            member = await guild.members.fetch(streakData.userID);
        } catch (err) {
            console.warn(`[Streak Warning] Failed to fetch member ${streakData.userID} in ${streakData.guildID}.`);
            continue;
        }

        const streakEmoji = settings.get(streakData.guildID)?.streakEmoji || '🔥';
        const timeLeft = (streakData.lastMessageTimestamp + (36 * 60 * 60 * 1000)) - now; 

        // --- ( ⬇️ هذا هو الكود الذي تم إصلاحه ⬇️ ) ---
        const embed = new EmbedBuilder()
            .setTitle('✶ تـحـذيـر الـستريـك')
            .setColor(Colors.Yellow)
            .setImage('https://i.postimg.cc/8z0Xw04N/attention.png') 
            .setDescription(
                `- لـقـد مـضـى أكـثـر مـن 12 سـاعـة عـلـى آخـر رسـالـة لـك\n` +
                `- سـتريـكك الـحـالي: ${streakData.streakCount} ${streakEmoji}\n` +
                `- أمـامـك أقـل مـن 12 سـاعـة (تقريباً ${formatTime(timeLeft)}) لإرسـال رسـالـة جـديـدة قـبـل أن يـضـيـع!`
            );
        // --- ( ⬆️ نهاية الإصلاح ⬆️ ) ---

        await member.send({ embeds: [embed] }).then(() => {
            updateWarning.run(streakData.id);
            warnedCount++;
        }).catch(e => console.log(`[Streak Warning] Failed to DM user ${member.user.tag}.`));
    }

    console.log(`[Streak Warning] ✅ اكتمل فحص التحذيرات. (تم إرسال ${warnedCount} تحذير)`);
}
// --- ( ⬆️ نهاية الدالة الجديدة ⬆️ ) ---


module.exports = {
    handleStreakMessage,
    checkDailyStreaks,
    updateNickname,
    calculateBuffMultiplier,
    calculateMoraBuff,
    formatTime,
    getKSADateString,
    getDayDifference,
    handleMediaStreakMessage,   
    checkDailyMediaStreaks,
    sendMediaStreakReminders,
    sendDailyMediaUpdate,
    sendStreakWarnings // <-- ( ⬇️ تمت إضافة الدالة الجديدة هنا ⬇️ )
};