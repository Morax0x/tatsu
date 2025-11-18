// ملف: events/guildMemberUpdate.js
const { Events } = require("discord.js");
const { updateNickname } = require("../streak-handler.js"); // (استدعاء دالة الستريك)

module.exports = {
    name: Events.GuildMemberUpdate,
    async execute(oldMember, newMember) {
        const client = newMember.client;
        const sql = client.sql; // (الوصول إلى الداتابيس)

        try {
            const guildID = newMember.guild.id;
            const userID = newMember.id;

            // --- 1. التحقق من تغيير النك نيم (للستريك) ---
            if (oldMember.nickname !== newMember.nickname) {
                const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);
                if (streakData && streakData.nicknameActive === 1) {
                    await updateNickname(newMember, sql);
                    console.log(`[Streak Tamper] Re-applied correct nickname for ${newMember.user.tag}.`);
                }
            }

            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guildID);
            if (!settings) return;

            const oldRoles = oldMember.roles.cache;
            const newRoles = newMember.roles.cache;

            // --- 2. التحقق من إنجازات الرولات ---
            // (استدعاء الدالة العامة المعرفة في index.js)

            const raceRoles = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").all(guildID, 'ach_race_role');
            const raceRoleIDs = raceRoles.map(r => r.roleID);
            if (raceRoleIDs.length > 0) {
                if (client.checkRoleAchievement) await client.checkRoleAchievement(newMember, null, 'ach_race_role');
            }

            const caesarRole = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").get(guildID, 'ach_caesar_role');
            if (caesarRole) {
                if (client.checkRoleAchievement) await client.checkRoleAchievement(newMember, caesarRole.roleID, 'ach_caesar_role');
            }

            const treeRole = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").get(guildID, 'ach_tree_role');
            if (treeRole) {
                if (client.checkRoleAchievement) await client.checkRoleAchievement(newMember, treeRole.roleID, 'ach_tree_role');
            }

            // (إنجاز التاق "VIP" سيعمل هنا أيضاً)
            const tagRole = sql.prepare("SELECT roleID FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").get(guildID, 'ach_tag_role');
            if (tagRole) {
                if (client.checkRoleAchievement) await client.checkRoleAchievement(newMember, tagRole.roleID, 'ach_tag_role');
            }


            // --- 3. التحقق من البوست ---
            const wasBoosting = oldMember.premiumSinceTimestamp;
            const isBoosting = newMember.premiumSinceTimestamp;

            if (!wasBoosting && isBoosting) {
                let levelData = client.getLevel.get(userID, guildID);
                if (!levelData) levelData = { ...client.defaultData, user: userID, guild: guildID };

                levelData.boost_count = (levelData.boost_count || 0) + 1;
                client.setLevel.run(levelData);
                if (client.checkAchievements) await client.checkAchievements(client, newMember, levelData, null);
            }

        } catch (err) {
            console.error("[GuildMemberUpdate] Error checking achievements:", err);
        }
    },
};