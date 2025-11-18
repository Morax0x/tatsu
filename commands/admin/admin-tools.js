const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require('discord.js');
const shopItems = require('../../json/shop-items.json');
const farmAnimals = require('../../json/farm-animals.json');
const marketItems = require('../../json/market-items.json');
const questsConfig = require('../../json/quests-config.json');

function getWeekStartDateString() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); 
    const diff = now.getUTCDate() - (dayOfWeek + 2) % 7; 
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0); 
    return friday.toISOString().split('T')[0];
}
function getTodayDateString() {
    return new Date().toISOString().split('T')[0];
}

module.exports = {
    name: 'admin-tools',
    description: 'أدوات إدارية متقدمة (عناصر وستريك)',
    aliases: ['ادمن', 'admin', 'تعديل-ادمن', 'ادوات-ادمن'],
    category: 'Admin',

    async execute(message, args) {
        const client = message.client;
        const sql = client.sql;

        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply("❌ ليس لديك صلاحيات إدارية لاستخدام هذا الأمر.");
        }

        const subcommand = args[0] ? args[0].toLowerCase() : null;
        const targetUser = message.mentions.users.first() || client.users.cache.get(args[1]);
        const embed = new EmbedBuilder().setColor(Colors.Green).setTimestamp();

        if (!targetUser) {
            return message.reply({ embeds: [this.getHelpEmbed()] });
        }

        let targetMember;
        try {
            targetMember = await message.guild.members.fetch(targetUser.id);
        } catch (e) {
             return message.reply("❌ لا يمكن العثور على هذا العضو في السيرفر.");
        }


        switch (subcommand) {
            case 'set-media-streak':
            case 'ضبط-ميديا-ستريك':
                await this.setMediaStreak(message, sql, targetUser, args[2], embed);
                break;
            case 'give-media-shield':
            case 'إعطاء-درع-ميديا':
            case 'اعطاء-درع-ميديا':
                await this.giveMediaShield(message, sql, targetUser, embed);
                break;
            case 'remove-media-shield':
            case 'إزالة-درع-ميديا':
            case 'ازالة-درع-ميديا':
                await this.removeMediaShield(message, sql, targetUser, embed);
                break;
            case 'give-item':
            case 'إعطاء-عنصر':
            case 'اعطاء-عنصر':
                await this.giveItem(message, client, sql, targetUser, args, embed);
                break;
            case 'remove-item':
            case 'إزالة-عنصر':
            case 'ازالة-عنصر':
                await this.removeItem(message, client, sql, targetUser, args, embed);
                break;
            case 'give-achievement':
            case 'اعطاء-انجاز':
                await this.giveAchievement(message, client, sql, targetUser, targetMember, args, embed);
                break;
            case 'remove-achievement':
            case 'ازالة-انجاز':
                await this.removeAchievement(message, sql, targetUser, args, embed);
                break;
            case 'set-stat':
            case 'ضبط-احصائية':
                await this.setStat(message, client, sql, targetUser, targetMember, args[2], args[3], embed);
                break;
            case 'give-daily-quest':
            case 'اعطاء-مهمة-يومية':
                await this.giveQuest(message, client, sql, targetUser, targetMember, args, 'daily', embed);
                break;
            case 'give-weekly-quest':
            case 'اعطاء-مهمة-اسبوعية':
                await this.giveQuest(message, client, sql, targetUser, targetMember, args, 'weekly', embed);
                break;
            default:
                message.reply({ embeds: [this.getHelpEmbed()] });
        }
    },

    getHelpEmbed() {
        return new EmbedBuilder()
            .setTitle('❌ خطأ في الاستخدام - أدوات الإدارة')
            .setColor(Colors.Red)
            .setDescription(
                "الرجاء تحديد مستخدم وخيار صحيح:\n\n" +
                "**-ادمن [الخيار] [المستخدم] [الكمية/العنصر]**\n\n" +
                "**خيارات ستريك الميديا (استخدم `ضبط-ميديا-ستريك` او الاختصارات):**\n" +
                "`... ضبط-ميديا-ستريك` @user [العدد]\n" +
                "`... اعطاء-درع-ميديا` @user\n" +
                "`... ازالة-درع-ميديا` @user\n\n" +
                "**خيارات العناصر (استخدم `اعطاء-عنصر` او الاختصارات):**\n" +
                "`... اعطاء-عنصر` @user [الاسم او ID] [الكمية]\n" +
                "`... ازالة-عنصر` @user [الاسم او ID] [الكمية]\n\n" +
                "**خيارات المهام والإنجازات:**\n" +
                "`... اعطاء-انجاز` @user [الاسم او ID]\n" +
                "`... ازالة-انجاز` @user [الاسم او ID]\n" +
                "`... اعطاء-مهمة-يومية` @user [الاسم او ID]\n" + 
                "`... اعطاء-مهمة-اسبوعية` @user [الاسم او ID]\n" + 
                "`... ضبط-احصائية` @user [اسم الإحصائية] [الرقم]"
            );
    },

    async setMediaStreak(message, sql, targetUser, countArg, embed) {
        const count = parseInt(countArg);
        if (isNaN(count) || count < 0) {
            return message.reply("❌ الرجاء تحديد عدد ستريك صحيح (0 أو أكثر).");
        }
        const guildID = message.guild.id;
        const userID = targetUser.id;
        const id = `${guildID}-${userID}`;
        let streakData = sql.prepare("SELECT * FROM media_streaks WHERE id = ?").get(id);
        if (!streakData) {
            streakData = {
                id: id, guildID, userID, streakCount: 0, lastMediaTimestamp: 0,
                hasGracePeriod: 1, hasItemShield: 0, hasReceivedFreeShield: 1,
                dmNotify: 1, highestStreak: 0
            };
        }
        streakData.streakCount = count;
        if (count > 0) {
            streakData.lastMediaTimestamp = Date.now(); 
        }
        if (count > streakData.highestStreak) {
            streakData.highestStreak = count;
        }
        sql.prepare(`
            INSERT OR REPLACE INTO media_streaks 
            (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak) 
            VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak)
        `).run(streakData);
        embed.setDescription(`✅ تم ضبط ستريك الميديا لـ ${targetUser} إلى **${count}**.`);
        await message.reply({ embeds: [embed] });
    },
    async giveMediaShield(message, sql, targetUser, embed) {
        const id = `${message.guild.id}-${targetUser.id}`;
        let streakData = sql.prepare("SELECT * FROM media_streaks WHERE id = ?").get(id);
        if (!streakData) {
             const guildID = message.guild.id;
             const userID = targetUser.id;
             streakData = {
                id: id, guildID, userID, streakCount: 0, lastMediaTimestamp: 0,
                hasGracePeriod: 0, hasItemShield: 1, hasReceivedFreeShield: 0,
                dmNotify: 1, highestStreak: 0
            };
            sql.prepare(`
                INSERT OR REPLACE INTO media_streaks 
                (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak) 
                VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak)
            `).run(streakData);
        } else {
             if (streakData.hasItemShield === 1) {
                return message.reply("ℹ️ هذا المستخدم يمتلك درع ميديا بالفعل.");
            }
            sql.prepare("UPDATE media_streaks SET hasItemShield = 1 WHERE id = ?").run(id);
        }
        embed.setDescription(`✅ تم إعطاء درع ستريك ميديا لـ ${targetUser}.`);
        await message.reply({ embeds: [embed] });
    },
    async removeMediaShield(message, sql, targetUser, embed) {
        const id = `${message.guild.id}-${targetUser.id}`;
        let streakData = sql.prepare("SELECT * FROM media_streaks WHERE id = ?").get(id);
        if (!streakData || streakData.hasItemShield === 0) {
            return message.reply("ℹ️ هذا المستخدم لا يمتلك درع ميديا ليتم إزالته.");
        }
        sql.prepare("UPDATE media_streaks SET hasItemShield = 0 WHERE id = ?").run(id);
        embed.setDescription(`✅ تم إزالة درع ستريك الميديا من ${targetUser}.`);
        await message.reply({ embeds: [embed] });
    },
    findItem(nameOrID) {
        const lowerCaseInput = nameOrID.toLowerCase();
        let item = shopItems.find(i => 
            (i.id.toLowerCase() === lowerCaseInput || i.name.toLowerCase() === lowerCaseInput) &&
            !marketItems.some(m => m.id === i.id) && 
            !farmAnimals.some(f => f.id === i.id)
        );
        if (item) return { ...item, type: 'shop_special' };
        item = marketItems.find(i => i.id.toLowerCase() === lowerCaseInput || i.name.toLowerCase() === lowerCaseInput);
        if (item) return { ...item, type: 'market' };
        item = farmAnimals.find(i => i.id.toLowerCase() === lowerCaseInput || i.name.toLowerCase() === lowerCaseInput);
        if (item) return { ...item, type: 'farm' };
        return null;
    },
    async giveItem(message, client, sql, targetUser, args, embed) {
        const quantityArg = args[args.length - 1];
        const quantity = parseInt(quantityArg);
        const itemNameOrID = args.slice(2, -1).join(' ');
        if (!itemNameOrID || isNaN(quantity) || quantity <= 0) {
            return message.reply("❌ الاستخدام: `-ادمن اعطاء-عنصر @user [الاسم او ID] [الكمية]`");
        }
        const item = this.findItem(itemNameOrID);
        if (!item) {
            return message.reply("❌ لم يتم العثور على عنصر بهذا الاسم او الـ ID.");
        }
        const guildID = message.guild.id;
        const userID = targetUser.id;
        switch (item.type) {
            case 'market': {
                let portfolioItem = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(userID, guildID, item.id);
                if (portfolioItem) {
                    sql.prepare("UPDATE user_portfolio SET quantity = quantity + ? WHERE id = ?").run(quantity, portfolioItem.id);
                } else {
                    sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?)")
                       .run(guildID, userID, item.id, quantity);
                }
                embed.setDescription(`✅ تم إعطاء ${targetUser} عدد **${quantity}** من العنصر \`${item.name}\`.`);
                break;
            }
            case 'farm': {
                const insertFarm = sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, purchaseTimestamp, lastCollected) VALUES (?, ?, ?, ?, ?)");
                const now = Date.now();
                for (let i = 0; i < quantity; i++) {
                    insertFarm.run(guildID, userID, item.id, now, now);
                }
                embed.setDescription(`✅ تم إعطاء ${targetUser} عدد **${quantity}** من الحيوان \`${item.name}\`.`);
                break;
            }
            case 'shop_special': {
                switch (item.id) {
                    case 'personal_guard_1d': {
                        let userData = client.getLevel.get(userID, guildID);
                        if (!userData) userData = { ...client.defaultData, user: userID, guild: guildID };
                        userData.hasGuard = (userData.hasGuard || 0) + quantity;
                        userData.guardExpires = 0; 
                        client.setLevel.run(userData);
                        embed.setDescription(`✅ تم إعطاء ${targetUser} عدد **${quantity}** شحنة حارس شخصي.`);
                        break;
                    }
                    case 'streak_shield': {
                        let streakData = sql.prepare("SELECT * FROM streaks WHERE id = ?").get(`${guildID}-${userID}`);
                        if (!streakData) {
                            streakData = { id: `${guildID}-${userID}`, guildID, userID, streakCount: 0, lastMessageTimestamp: 0, hasGracePeriod: 0, hasItemShield: 1, hasReceivedFreeShield: 0, dmNotify: 1, highestStreak: 0, separator: '|' };
                            sql.prepare(`INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield, nicknameActive, hasReceivedFreeShield, separator, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield, @nicknameActive, @hasReceivedFreeShield, @separator, @dmNotify, @highestStreak)`).run(streakData);
                        } else {
                            sql.prepare("UPDATE streaks SET hasItemShield = 1 WHERE id = ?").run(streakData.id);
                        }
                        embed.setDescription(`✅ تم إعطاء ${targetUser} **درع ستريك**.`);
                        break;
                    }
                    case 'streak_shield_media': {
                        await this.giveMediaShield(message, sql, targetUser, embed);
                        return; 
                    }
                    default:
                        return message.reply(`❌ لا يمكن إعطاء هذا العنصر الخاص (\`${item.name}\`) يدوياً. العناصر المدعومة هي: درع الستريك، درع الميديا، الحارس الشخصي.`);
                }
                break;
            }
        }
        await message.reply({ embeds: [embed] });
    },
    async removeItem(message, client, sql, targetUser, args, embed) {
        const quantityArg = args[args.length - 1];
        const quantity = parseInt(quantityArg);
        const itemNameOrID = args.slice(2, -1).join(' ');
        if (!itemNameOrID || isNaN(quantity) || quantity <= 0) {
            return message.reply("❌ الاستخدام: `-ادمن ازالة-عنصر @user [الاسم او ID] [الكمية]`");
        }
        const item = this.findItem(itemNameOrID);
        if (!item) {
            return message.reply("❌ لم يتم العثور على عنصر بهذا الاسم او الـ ID.");
        }
        const guildID = message.guild.id;
        const userID = targetUser.id;
        switch (item.type) {
            case 'market': {
                let portfolioItem = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?").get(userID, guildID, item.id);
                if (!portfolioItem || portfolioItem.quantity < quantity) {
                    return message.reply(`❌ لا يمتلك ${targetUser} هذه الكمية (يمتلك: ${portfolioItem?.quantity || 0}).`);
                }
                const newQuantity = portfolioItem.quantity - quantity;
                if (newQuantity === 0) {
                    sql.prepare("DELETE FROM user_portfolio WHERE id = ?").run(portfolioItem.id);
                } else {
                    sql.prepare("UPDATE user_portfolio SET quantity = ? WHERE id = ?").run(newQuantity, portfolioItem.id);
                }
                embed.setDescription(`✅ تم إزالة **${quantity}** من العنصر \`${item.name}\` من ${targetUser}.`);
                break;
            }
            case 'farm': {
                const userAnimals = sql.prepare("SELECT id FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? LIMIT ?").all(userID, guildID, item.id, quantity);
                if (userAnimals.length < quantity) {
                    return message.reply(`❌ لا يمتلك ${targetUser} هذه الكمية (يمتلك: ${userAnimals.length}).`);
                }
                const idsToDelete = userAnimals.map(a => a.id);
                sql.prepare(`DELETE FROM user_farm WHERE id IN (${idsToDelete.map(() => '?').join(',')})`).run(...idsToDelete);
                embed.setDescription(`✅ تم إزالة **${quantity}** من الحيوان \`${item.name}\` من ${targetUser}.`);
                break;
            }
            case 'shop_special': {
                switch (item.id) {
                    case 'personal_guard_1d': {
                        let userData = client.getLevel.get(userID, guildID);
                        if (!userData || (userData.hasGuard || 0) < quantity) {
                            return message.reply(`❌ لا يمتلك ${targetUser} هذه الكمية (يمتلك: ${userData?.hasGuard || 0} شحنة).`);
                        }
                        userData.hasGuard -= quantity;
                        if (userData.hasGuard < 0) userData.hasGuard = 0;
                        client.setLevel.run(userData);
                        embed.setDescription(`✅ تم إزالة **${quantity}** شحنة حارس شخصي من ${targetUser}.`);
                        break;
                    }
                    case 'streak_shield': {
                        sql.prepare("UPDATE streaks SET hasItemShield = 0 WHERE guildID = ? AND userID = ?").run(guildID, userID);
                        embed.setDescription(`✅ تم إزالة **درع الستريك** من ${targetUser}.`);
                        break;
                    }
                    case 'streak_shield_media': {
                        await this.removeMediaShield(message, sql, targetUser, embed);
                        return; 
                    }
                    default:
                         return message.reply(`❌ لا يمكن إزالة هذا العنصر الخاص (\`${item.name}\`) يدوياً.`);
                }
                break;
            }
        }
        await message.reply({ embeds: [embed] });
    },

    findAchievement(nameOrID) {
        if (!nameOrID) return null;
        const input = nameOrID.toLowerCase().trim();
        return questsConfig.achievements.find(a => a.id.toLowerCase() === input || a.name.toLowerCase() === input);
    },

    async giveAchievement(message, client, sql, targetUser, targetMember, args, embed) {
        const achNameOrID = args.slice(2).join(' ');
        if (!achNameOrID) {
            return message.reply("❌ يرجى تحديد ID أو اسم الإنجاز.\n(مثال: `-ادمن اعطاء-انجاز @user امير الشات`)");
        }

        const achConfig = this.findAchievement(achNameOrID);
        if (!achConfig) {
            return message.reply("❌ لم يتم العثور على إنجاز بهذا الـ ID أو الاسم.");
        }

        const guildID = message.guild.id;
        const userID = targetUser.id;

        const existingAch = sql.prepare("SELECT * FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?").get(userID, guildID, achConfig.id);
        if (existingAch) {
            return message.reply("ℹ️ هذا المستخدم يمتلك هذا الإنجاز بالفعل.");
        }

        sql.prepare("INSERT INTO user_achievements (userID, guildID, achievementID, timestamp) VALUES (?, ?, ?, ?)")
           .run(userID, guildID, achConfig.id, Date.now());

        let levelData = client.getLevel.get(userID, guildID);
        if (!levelData) levelData = { ...client.defaultData, user: userID, guild: guildID };

        levelData.mora = (levelData.mora || 0) + achConfig.reward.mora;
        levelData.xp += achConfig.reward.xp;
        levelData.totalXP += achConfig.reward.xp;
        client.setLevel.run(levelData);

        try {
            await client.sendQuestAnnouncement(
                message.guild, 
                targetMember, 
                achConfig, 
                'achievement'
            );
        } catch (e) {
            console.error("Failed to send admin achievement announcement:", e);
        }

        embed.setDescription(`✅ تم منح إنجاز **${achConfig.name}** لـ ${targetUser} بنجاح (وتم إرسال إشعار).`);
        await message.reply({ embeds: [embed] });
    },

    async removeAchievement(message, sql, targetUser, args, embed) {
        const achNameOrID = args.slice(2).join(' ');
        if (!achNameOrID) {
            return message.reply("❌ يرجى تحديد ID أو اسم الإنجاز.\n(مثال: `-ادمن ازالة-انجاز @user امير الشات`)");
        }

        const achConfig = this.findAchievement(achNameOrID);
        if (!achConfig) {
            return message.reply("❌ لم يتم العثور على إنجاز بهذا الـ ID أو الاسم.");
        }

        const result = sql.prepare("DELETE FROM user_achievements WHERE userID = ? AND guildID = ? AND achievementID = ?")
                             .run(targetUser.id, message.guild.id, achConfig.id);

        if (result.changes > 0) {
            embed.setDescription(`✅ تم إزالة الإنجاز \`${achConfig.name}\` من ${targetUser}.`);
        } else {
            embed.setColor(Colors.Red).setDescription(`ℹ️ ${targetUser} لا يمتلك هذا الإنجاز أصلاً.`);
        }
        await message.reply({ embeds: [embed] });
    },

    async setStat(message, client, sql, targetUser, targetMember, statName, value, embed) {
        if (!statName || isNaN(parseInt(value))) {
            return message.reply("❌ الاستخدام: `-ادمن ضبط-احصائية @user [اسم الإحصائية] [الرقم]`\nمثال: `-ادمن ضبط-احصائية @user level 49`");
        }

        const guildID = message.guild.id;
        const userID = targetUser.id;
        const numValue = parseInt(value);

        let levelData = client.getLevel.get(userID, guildID);
        if (!levelData) levelData = { ...client.defaultData, user: userID, guild: guildID };

        let totalStatsData = client.getTotalStats.get(`${userID}-${guildID}`);
        if (!totalStatsData) totalStatsData = { id: `${userID}-${guildID}`, userID, guildID };

        let streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);
        let mediaStreakData = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);

        let statFound = false;

        if (levelData.hasOwnProperty(statName)) {
            levelData[statName] = numValue;
            client.setLevel.run(levelData);
            statFound = true;
        } 
        else if (totalStatsData.hasOwnProperty(statName)) {
            totalStatsData[statName] = numValue;
            client.setTotalStats.run(totalStatsData);
            statFound = true;
        }
        else if (streakData && streakData.hasOwnProperty(statName)) {
            sql.prepare(`UPDATE streaks SET ${statName} = ? WHERE id = ?`).run(numValue, streakData.id);
            statFound = true;
            streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildID, userID);
        }
        else if (mediaStreakData && mediaStreakData.hasOwnProperty(statName)) {
            sql.prepare(`UPDATE media_streaks SET ${statName} = ? WHERE id = ?`).run(numValue, mediaStreakData.id);
            statFound = true;
        }

        if (!statFound) {
            return message.reply(`❌ لم يتم العثور على إحصائية بالاسم \`${statName}\`. تأكد من كتابتها بالضبط (مثل: \`level\`, \`total_messages\`, \`highestStreak\`).`);
        }

        await client.checkAchievements(client, targetMember, levelData, totalStatsData);

        embed.setDescription(`✅ تم ضبط الإحصائية \`${statName}\` لـ ${targetUser} إلى **${numValue}**.\nتم فحص الإنجازات...`);
        await message.reply({ embeds: [embed] });
    },

    findQuest(nameOrID, questType) {
        if (!nameOrID) return null;
        const input = nameOrID.toLowerCase().trim();
        const list = questType === 'daily' ? questsConfig.daily : questsConfig.weekly;
        return list.find(q => q.id.toLowerCase() === input || q.name.toLowerCase() === input);
    },

    async giveQuest(message, client, sql, targetUser, targetMember, args, questType, embed) {
        const questNameOrID = args.slice(2).join(' ');
        if (!questNameOrID) {
            return message.reply(`❌ يرجى تحديد ID أو اسم المهمة.\n(مثال: \`-ادمن ${questType === 'daily' ? 'اعطاء-مهمة-يومية' : 'اعطاء-مهمة-اسبوعية'} @user ارسل 5 رسائل\`)`);
        }

        const questConfig = this.findQuest(questNameOrID, questType);
        if (!questConfig) {
            return message.reply("❌ لم يتم العثور على مهمة بهذا الـ ID أو الاسم.");
        }

        const guildID = message.guild.id;
        const userID = targetUser.id;
        const dateKey = questType === 'daily' ? getTodayDateString() : getWeekStartDateString();
        const claimID = `${userID}-${guildID}-${questConfig.id}-${dateKey}`;

        const existingClaim = sql.prepare("SELECT * FROM user_quest_claims WHERE claimID = ?").get(claimID);
        if (existingClaim) {
            return message.reply("ℹ️ هذا المستخدم أكمل هذه المهمة بالفعل لهذا اليوم/الأسبوع.");
        }

        sql.prepare("INSERT INTO user_quest_claims (claimID, userID, guildID, questID, dateStr) VALUES (?, ?, ?, ?, ?)")
           .run(claimID, userID, guildID, questConfig.id, dateKey);

        let levelData = client.getLevel.get(userID, guildID);
        if (!levelData) levelData = { ...client.defaultData, user: userID, guild: guildID };

        levelData.mora = (levelData.mora || 0) + questConfig.reward.mora;
        levelData.xp += questConfig.reward.xp;
        levelData.totalXP += questConfig.reward.xp;
        client.setLevel.run(levelData);

        try {
            await client.sendQuestAnnouncement(
                message.guild, 
                targetMember, 
                questConfig, 
                questType
            );
        } catch (e) {
            console.error("Failed to send admin quest announcement:", e);
        }

        embed.setDescription(`✅ تم منح المهمة (${questType}) **${questConfig.name}** لـ ${targetUser} بنجاح (وتم إرسال إشعار).`);
        await message.reply({ embeds: [embed] });
    }
};