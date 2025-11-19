const { Events } = require("discord.js");
const { updateNickname } = require("../streak-handler.js"); 
const questsConfig = require('../json/quests-config.json');

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const client = newMember.client;
        const sql = client.sql;
        const guildID = newMember.guild.id;
        const userID = newMember.id;

        try {
            // ====================================================
            // 1. التحقق من تغيير النك نيم (حماية الستريك)
            // ====================================================
            if (oldMember.nickname !== newMember.nickname) {
                const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);
                if (streakData && streakData.nicknameActive === 1) {
                    // إعادة تطبيق الستريك إذا حاول العضو إزالته
                    await updateNickname(newMember, sql);
                    // console.log(`[Streak Tamper] Re-applied nickname for ${newMember.user.tag}.`);
                }
            }

            // ====================================================
            // 2. التحقق من إنجازات الرولات (Caesar, Tree, Race...)
            // ====================================================
            if (client.checkRoleAchievement) {
                // رولات الأعراق (Race)
                await client.checkRoleAchievement(newMember, null, 'ach_race_role');
                
                // رول القيصر
                const caesarRole = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").get(guildID, 'ach_caesar_role');
                if (caesarRole) await client.checkRoleAchievement(newMember, caesarRole.roleID, 'ach_caesar_role');
                
                // رول الشجرة
                const treeRole = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").get(guildID, 'ach_tree_role');
                if (treeRole) await client.checkRoleAchievement(newMember, treeRole.roleID, 'ach_tree_role');
                
                // رول التاق (VIP)
                const tagRole = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").get(guildID, 'ach_tag_role');
                if (tagRole) await client.checkRoleAchievement(newMember, tagRole.roleID, 'ach_tag_role');
            }

            // ====================================================
            // 3. نظام البوست (Boost) - متكرر وتلقائي
            // ====================================================
            const wasBoosting = oldMember.premiumSince;
            const isBoosting = newMember.premiumSince;

            // إذا بدأ بالتعزيز الآن
            if (!wasBoosting && isBoosting) {
                console.log(`[Boost Detected] ${newMember.user.tag} عزز السيرفر!`);

                // البحث عن الإنجاز الخاص بالبوست
                const boostQuest = questsConfig.achievements.find(q => q.stat === 'boost_count');

                if (boostQuest) {
                    let levelData = client.getLevel.get(userID, guildID);
                    if (!levelData) levelData = { ...client.defaultData, user: userID, guild: guildID };

                    // زيادة العداد + إعطاء الجائزة فوراً
                    levelData.boost_count = (levelData.boost_count || 0) + 1;
                    levelData.mora = (levelData.mora || 0) + boostQuest.reward.mora;
                    levelData.xp += boostQuest.reward.xp;
                    levelData.totalXP += boostQuest.reward.xp;

                    // فحص اللفل أب
                    const nextXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;
                    if (levelData.xp >= nextXP) {
                        const oldLevel = levelData.level;
                        levelData.xp -= nextXP;
                        levelData.level += 1;
                        const newLevel = levelData.level;
                        
                        if (client.sendLevelUpMessage) {
                             await client.sendLevelUpMessage(newMember, newMember, newLevel, oldLevel, levelData);
                        }
                    }

                    client.setLevel.run(levelData);

                    // إرسال رسالة الإنجاز
                    if (client.sendQuestAnnouncement) {
                        await client.sendQuestAnnouncement(newMember.guild, newMember, boostQuest, 'achievement');
                    }
                }
            }

        } catch (err) {
            console.error("[GuildMemberUpdate Error]", err);
        }
    },
};
