const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, SlashCommandBuilder } = require("discord.js");
const weaponsConfig = require('../json/weapons-config.json');
const { getUserRace, getWeaponData, BASE_HP, HP_PER_LEVEL } = require('../handlers/pvp-core.js');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const EMOJI_MEDIA_STREAK = '<a:Streak:1438932297519730808>';
const ROWS_PER_PAGE = 10;

const IMAGES = {
    level: 'https://i.postimg.cc/9FWddtV8/123.png',
    mora: 'https://i.postimg.cc/8zHz1PXG/download-2.jpg',
    streak: 'https://i.postimg.cc/NfLYXwD5/123.jpg',
    media_streak: 'https://i.postimg.cc/NfLYXwD5/123.jpg',
    strongest: 'https://i.postimg.cc/pL7PLmf0/power.webp',
    weekly_xp: 'https://i.postimg.cc/9FWddtV8/123.png',
    achievements: 'https://i.postimg.cc/bwxwsnvs/qaʿt-alanjazat.png'
};

function getRankEmoji(rank) {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
}

function getWeekStartDateString() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 5 = Friday
    const diff = now.getUTCDate() - (dayOfWeek + 2) % 7;
    const friday = new Date(now.setUTCDate(diff));
    friday.setUTCHours(0, 0, 0, 0);
    return friday.toISOString().split('T')[0];
}

async function generateLeaderboard(sql, guild, type, page) {
    const embed = new EmbedBuilder()
        .setColor("Random")
        .setImage(IMAGES[type] || null);

    let description = "";
    let allUsers = [];
    let totalPages = 0;

    try {
        if (type === 'level') {
            embed.setTitle(`✥ اعـلـى الـمصـنـفـيـن بالمسـتويات`);
            allUsers = sql.prepare("SELECT * FROM levels WHERE guild = ? ORDER BY totalXP DESC").all(guild.id);
            totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            if (totalPages > 1) {
                embed.setFooter({ text: `صفحة ${page} / ${totalPages}` });
            }

            const pageData = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                let memberName;
                try {
                    await guild.members.fetch(user.user);
                    memberName = `<@${user.user}>`;
                } catch (error) {
                    memberName = `User Left (${user.user})`;
                }
                description += `${rankEmoji} ${memberName}\n> **Total XP**: \`${user.totalXP.toLocaleString()}\` (Lvl: ${user.level})\n\n`;
            }

        } else if (type === 'weekly_xp') {
            embed.setTitle(`✥ اعـلـى الـمصـnـفـيـن (XP الأسبوعي)`);
            const weekStartDateStr = getWeekStartDateString();

            allUsers = sql.prepare(`
                SELECT *, (messages * 15 + vc_minutes * 10) as weekly_score 
                FROM user_weekly_stats 
                WHERE guildID = ? AND weekStartDate = ? AND (messages > 0 OR vc_minutes > 0)
                ORDER BY weekly_score DESC
            `).all(guild.id, weekStartDateStr);

            totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            let footerText = "يتم تحديث هذا الترتيب كل يوم جمعة";
            if (totalPages > 1) {
                footerText += ` | صفحة ${page} / ${totalPages}`;
            }
            embed.setFooter({ text: footerText });

            const pageData = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                let memberName;
                try {
                    await guild.members.fetch(user.userID);
                    memberName = `<@${user.userID}>`;
                } catch (error) {
                    memberName = `User Left (${user.userID})`;
                }
                description += `${rankEmoji} ${memberName}\n> **Txt:** \`${user.messages.toLocaleString()}\` | **VC:** \`${user.vc_minutes.toLocaleString()}\`\n\n`;
            }

        } else if (type === 'mora') {
            embed.setTitle(`<:mora:1435647151349698621> اثـريـاء الـسيرفـر`);
            allUsers = sql.prepare("SELECT * FROM levels WHERE guild = ? ORDER BY (mora + bank) DESC").all(guild.id);
            totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            const totalMoraResult = sql.prepare("SELECT SUM(mora + bank) AS total FROM levels WHERE guild = ?").get(guild.id);
            let footerText = `اجمـالـي المـورا: ${(totalMoraResult.total || 0).toLocaleString()}`;
            if (totalPages > 1) {
                footerText += ` | صفحة ${page} / ${totalPages}`;
            }
            embed.setFooter({ text: footerText });

            const pageData = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                const totalMora = (user.mora || 0) + (user.bank || 0);
                let memberName;
                try {
                    await guild.members.fetch(user.user);
                    memberName = `<@${user.user}>`;
                } catch (error) {
                    memberName = `مستخدم غادر (${user.user})`;
                }
                description += `${rankEmoji} ${memberName}\n> **Mora**: \`${totalMora.toLocaleString()}\` ${EMOJI_MORA}\n\n`;
            }

        } else if (type === 'streak') {
            embed.setTitle(`✥ اعـلـى الـمصـنـفـيـن بالـستـريـك`);
            const settings = sql.prepare("SELECT streakEmoji FROM settings WHERE guild = ?").get(guild.id);
            const streakEmoji = settings?.streakEmoji || '🔥';

            allUsers = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND streakCount > 0 ORDER BY streakCount DESC").all(guild.id);

            totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            if (totalPages > 1) {
                embed.setFooter({ text: `صفحة ${page} / ${totalPages}` });
            }

            const pageData = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                let memberName;
                try {
                    await guild.members.fetch(user.userID);
                    memberName = `<@${user.userID}>`;
                } catch (error) {
                    memberName = `User Left (${user.userID})`;
                }
                description += `${rankEmoji} ${memberName}\n> **Streak**: \`${user.streakCount}\` ${streakEmoji}\n\n`;
            }

        } else if (type === 'media_streak') {
            embed.setTitle(`✥ اعـلـى الـمصـنـفـيـن بستـريـك المـيـديـا`);
            const streakEmoji = EMOJI_MEDIA_STREAK;

            allUsers = sql.prepare("SELECT * FROM media_streaks WHERE guildID = ? AND streakCount > 0 ORDER BY streakCount DESC").all(guild.id);

            totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            if (totalPages > 1) {
                embed.setFooter({ text: `صفحة ${page} / ${totalPages}` });
            }

            const pageData = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                let memberName;
                try {
                    await guild.members.fetch(user.userID);
                    memberName = `<@${user.userID}>`;
                } catch (error) {
                    memberName = `User Left (${user.userID})`;
                }
                description += `${rankEmoji} ${memberName}\n> **Streak**: \`${user.streakCount}\` ${streakEmoji}\n\n`;
            }

        } else if (type === 'strongest') {
            embed.setTitle(`✥ لوحـة صـدارة الاقـوى`);

            const allGuildWeapons = sql.prepare("SELECT * FROM user_weapons WHERE guildID = ? AND weaponLevel > 0").all(guild.id);
            let allUsersStats = [];

            const getLevelData = sql.prepare("SELECT level FROM levels WHERE guild = ? AND user = ?");
            const getSkillCount = sql.prepare("SELECT COUNT(*) as count FROM user_skills WHERE guildID = ? AND userID = ? AND skillLevel > 0");

            for (const userWeapon of allGuildWeapons) {
                const weaponConfig = weaponsConfig.find(w => w.race === userWeapon.raceName);
                if (!weaponConfig) continue;

                const damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (userWeapon.weaponLevel - 1));

                let hp = BASE_HP;
                const levelData = getLevelData.get(guild.id, userWeapon.userID);
                if (levelData) {
                    hp = BASE_HP + (levelData.level * HP_PER_LEVEL);
                }

                const skillData = getSkillCount.get(guild.id, userWeapon.userID);
                const skillCount = skillData ? skillData.count : 0;

                allUsersStats.push({
                    userID: userWeapon.userID,
                    damage: damage,
                    race: userWeapon.raceName,
                    level: userWeapon.weaponLevel,
                    hp: hp,
                    skillCount: skillCount
                });
            }

            allUsersStats.sort((a, b) => b.damage - a.damage);
            allUsers = allUsersStats;
            totalPages = Math.ceil(allUsersStats.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            if (totalPages > 1) {
                embed.setFooter({ text: `صفحة ${page} / ${totalPages}` });
            }

            const pageData = allUsersStats.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                let memberName;
                try {
                    await guild.members.fetch(user.userID);
                    memberName = `<@${user.userID}>`;
                } catch (error) {
                    memberName = `User Left (${user.userID})`;
                }
                description += `${rankEmoji} ${memberName}\n> **HP:** \`${user.hp}\` | **DMG:** \`${user.damage}\` | **Lvl:** \`${user.level}\` | **Skills:** \`${user.skillCount}\`\n\n`;
            }

        } else if (type === 'achievements') {
            embed.setTitle(`🏆 اعـلـى الـمصـنـفـيـن بالإنجازات`);
            allUsers = sql.prepare("SELECT userID, COUNT(*) as count FROM user_achievements WHERE guildID = ? GROUP BY userID ORDER BY count DESC").all(guild.id);

            totalPages = Math.ceil(allUsers.length / ROWS_PER_PAGE) || 1;
            page = Math.max(1, Math.min(page, totalPages));

            if (totalPages > 1) {
                embed.setFooter({ text: `صفحة ${page} / ${totalPages}` });
            }

            const pageData = allUsers.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const rank = (page - 1) * ROWS_PER_PAGE + i + 1;
                const rankEmoji = getRankEmoji(rank);
                let memberName;
                try {
                    await guild.members.fetch(user.userID);
                    memberName = `<@${user.userID}>`;
                } catch (error) {
                    memberName = `User Left (${user.userID})`;
                }
                description += `${rankEmoji} ${memberName}\n> **Total Achievements**: \`${user.count.toLocaleString()}\` 🏆\n\n`;
            }
        }

        embed.setDescription(description || "لا يوجد أحد في لوحة الصدارة بعد!");
        return { embed, totalPages };

    } catch (err) {
        console.error(`[Leaderboard Error] ${type}:`, err);
        embed.setTitle(`❌ خطأ`).setDescription(`حدث خطأ أثناء جلب بيانات لوحة الصدارة.`);
        return { embed, totalPages: 0 };
    }
}

function createButtons(activeId, page, totalPages) {

    const isStreakActive = activeId === 'streak' || activeId === 'media_streak';

    const rowCategories = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('top_level')
            .setEmoji('<a:levelup:1437805366048985290>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(activeId === 'level'),
        new ButtonBuilder()
            .setCustomId('top_mora')
            .setEmoji('<:mora:1435647151349698621>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(activeId === 'mora'),
        new ButtonBuilder()
            .setCustomId('top_streak')
            .setEmoji('🔥')
            .setStyle(isStreakActive ? ButtonStyle.Primary : ButtonStyle.Secondary) 
            .setDisabled(false), 
        new ButtonBuilder()
            .setCustomId('top_strongest')
            .setEmoji('⚔️')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(activeId === 'strongest'),
        new ButtonBuilder()
            .setCustomId('top_achievements')
            .setEmoji('<a:mTrophy:1438797228826300518>')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(activeId === 'achievements')
    );

    const rowPagination = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('leaderboard_prev')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:left:1439164494759723029>')
            .setDisabled(page === 1),
        new ButtonBuilder()
            .setCustomId('leaderboard_next')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('<:right:1439164491072929915>')
            .setDisabled(page === totalPages || totalPages <= 1)
    );

    return [rowCategories, rowPagination];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('توب')
        .setDescription('يعرض لوحات الصدارة (المستوى، المورا، الستريك، الأقوى).')
        .addStringOption(option =>
            option.setName('التصنيف')
            .setDescription('اختر التصنيف الذي تريد عرضه أولاً')
            .setRequired(false)
            .addChoices(
                { name: 'المستوى (Level)', value: 'level' },
                { name: 'المورا (Mora)', value: 'mora' },
                { name: 'الستريك (Streak)', value: 'streak' },
                { name: 'ستريك الميديا (Media Streak)', value: 'media_streak' },
                { name: 'الأقوى (Strongest)', value: 'strongest' },
                { name: 'الإنجازات (Achievements)', value: 'achievements' },
                { name: 'الأسبوعي (Weekly XP)', value: 'weekly_xp' }
            ))
        .addIntegerOption(option =>
            option.setName('صفحة')
            .setDescription('رقم الصفحة للبدء منها')
            .setRequired(false)),

    name: "top",
    aliases: ["توب", "المتصدرين", "topmora", "topstreak", "اغنى", "اقوى", "topweek", "توب-الاسبوع"],
    category: "Leveling",
    cooldown : 10,
    description: "يعرض لوحات الصدارة (المستوى، المورا، الستريك، الأقوى).",

    async execute(interactionOrMessage, args) {

        // --- ( 🌟 تم الإصلاح هنا 🌟 ) ---
        const isSlash = !!!!interactionOrMessage.isChatInputCommand;;

        let interaction, message, guild, client, user;
        let currentPage = 1;
        let argType = null;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            currentPage = interaction.options.getInteger('صفحة') || 1;
            argType = interaction.options.getString('التصنيف');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            // (إضافة args.prefix = prefix)
            args.prefix = (await client.sql.prepare("SELECT serverprefix FROM prefix WHERE guild = ?").get(guild.id))?.serverprefix || "-";

            if (args.length > 0) {
                const firstArg = args[0].toLowerCase();
                if (!isNaN(parseInt(firstArg))) {
                    currentPage = parseInt(firstArg);
                } else if (firstArg === 'week' || firstArg === 'اسبوع') {
                    argType = 'weekly_xp';
                }
            }
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.channel.send(payload);
            }
        };

        const sql = client.sql;
        let settings;
        try {
            settings = sql.prepare("SELECT casinoChannelID FROM settings WHERE guild = ?").get(guild.id);
        } catch (e) { settings = null; }

        const isCasinoChannel = settings && settings.casinoChannelID === interactionOrMessage.channel.id;

        let currentType = argType || (isCasinoChannel ? 'mora' : 'level');

        if (!isSlash) {
            const commandAlias = message.content.split(' ')[0].replace(args.prefix, '').toLowerCase();
            if (['topmora', 'اغنى'].includes(commandAlias)) currentType = 'mora';
            if (['topstreak'].includes(commandAlias)) currentType = 'streak';
            if (['اقوى'].includes(commandAlias)) currentType = 'strongest';
            if (['topweek', 'توب-الاسبوع'].includes(commandAlias)) currentType = 'weekly_xp';
        }

        const initialData = await generateLeaderboard(sql, guild, currentType, currentPage);
        let totalPages = initialData.totalPages;
        const initialEmbed = initialData.embed;

        if (currentPage > totalPages) currentPage = totalPages;

        let initialRows;
        if (currentType === 'weekly_xp') {
            const rowPagination = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('leaderboard_prev').setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(currentPage === 1),
                new ButtonBuilder().setCustomId('leaderboard_next').setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(currentPage === totalPages || totalPages <= 1)
            );
            initialRows = [rowPagination];
        } else {
            initialRows = createButtons(currentType, currentPage, totalPages);
        }

        const topMessage = await reply({ embeds: [initialEmbed], components: initialRows });

        const filter = (i) => i.user.id === user.id && (i.customId.startsWith('top_') || i.customId.startsWith('leaderboard_'));

        const collector = topMessage.createMessageComponentCollector({ 
            filter, 
            componentType: ComponentType.Button, 
            idle: 60000 
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();

            if (i.customId.startsWith('top_')) {
                const newType = i.customId.replace('top_', '');

                if (newType === 'streak') {
                    if (currentType === 'streak') {
                        currentType = 'media_streak';
                    } else if (currentType === 'media_streak') {
                        currentType = 'streak'; 
                    } else {
                        currentType = 'streak';
                    }
                } else {
                    currentType = newType;
                }
                currentPage = 1;

            } else if (i.customId === 'leaderboard_next') {
                currentPage = Math.min(totalPages, currentPage + 1);
            } else if (i.customId === 'leaderboard_prev') {
                currentPage = Math.max(1, currentPage - 1);
            } else {
                return;
            }

            const newData = await generateLeaderboard(sql, guild, currentType, currentPage);
            totalPages = newData.totalPages;
            const newEmbed = newData.embed;

            let newRows;
            if (currentType === 'weekly_xp') {
                const rowPagination = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('leaderboard_prev').setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(currentPage === 1),
                    new ButtonBuilder().setCustomId('leaderboard_next').setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(currentPage === totalPages || totalPages <= 1)
                );
                newRows = [rowPagination];
            } else {
                newRows = createButtons(currentType, currentPage, totalPages);
            }

            await topMessage.edit({ embeds: [newEmbed], components: newRows });
        });

        collector.on('end', () => {
            let disabledRows;
            if (currentType === 'weekly_xp') {
                const paginationRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('leaderboard_prev_disabled').setStyle(ButtonStyle.Secondary).setEmoji('<:left:1439164494759723029>').setDisabled(true),
                    new ButtonBuilder().setCustomId('leaderboard_next_disabled').setStyle(ButtonStyle.Secondary).setEmoji('<:right:1439164491072929915>').setDisabled(true)
                );
                disabledRows = [paginationRow];
            } else {
                 disabledRows = createButtons(currentType, currentPage, totalPages);
                 disabledRows.forEach(row => row.components.forEach(btn => btn.setDisabled(true)));
            }
            topMessage.edit({ components: disabledRows }).catch(() => {});
        });
    },
    generateLeaderboard
};