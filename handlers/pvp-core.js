const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, ComponentType } = require("discord.js");
const { calculateMoraBuff } = require('../streak-handler.js');
const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');

// --- 1. الإعدادات والحالة ---
const EMOJI_MORA = '<:mora:1435647151349698621>';
const BASE_HP = 100;
const HP_PER_LEVEL = 4;
const SKILL_COOLDOWN_TURNS = 3;

const activePvpChallenges = new Set();
const activePvpBattles = new Map();

const WIN_IMAGES = [
    'https://i.postimg.cc/JhMrnyLd/download-1.gif',
    'https://i.postimg.cc/FHgv29L0/download.gif',
    'https://i.postimg.cc/9MzjRZNy/haru-midoriya.gif',
    'https://i.postimg.cc/4ygk8q3G/tumblr-nmao11Zm-Bx1r3rdh2o2-500-gif-500-281.gif',
    'https://i.postimg.cc/pL6NNpdC/Epic7-Epic-Seven-GIF-Epic7-Epic-Seven-Tensura-Discover-Share-GIFs.gif',
    'https://i.postimg.cc/05dLktNF/download-5.gif',
    'https://i.postimg.cc/sXRVMwhZ/download-2.gif'
];

const FORFEIT_IMAGES = [
    'https://i.postimg.cc/xd8msjxk/escapar-a-toda-velocidad.gif',
    'https://i.postimg.cc/1zb8JGVC/download.gif',
    'https://i.postimg.cc/rmSwjvkV/download-1.gif',
    'https://i.postimg.cc/8PyPZRqt/download.jpg'
];

// --- 2. الدوال المساعدة (Helpers & Getters) ---

function cleanDisplayName(name) {
    if (!name) return "لاعب";
    let clean = name.replace(/<a?:.+?:\d+>/g, '');
    clean = clean.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\DFFF]|\uD83D[\uDC00-\DFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\DFFF]/g, '');
    clean = clean.replace(/\s*[|・•»✦]\s*\d+\s* ?🔥/g, '');
    return clean.trim();
}

function getUserRace(member, sql) {
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID));
    return userRace || null;
}

function getWeaponData(sql, member) {
    const userRace = getUserRace(member, sql);
    if (!userRace) return null;

    const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
    if (!weaponConfig) return null;

    let userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(member.id, member.guild.id, userRace.raceName);
    let weaponLevel = userWeapon ? userWeapon.weaponLevel : 0;
    if (weaponLevel === 0) return null;

    const damage = weaponConfig.base_damage + (weaponConfig.damage_increment * (weaponLevel - 1));
    return { ...weaponConfig, currentDamage: damage, currentLevel: weaponLevel };
}

function getAllSkillData(sql, member) {
    const userRace = getUserRace(member, sql);
    const userSkillsData = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(member.id, member.guild.id);

    if (!userSkillsData && !userRace) return {};

    const skillsOutput = {};

    userSkillsData.forEach(userSkill => {
        const skillConfig = skillsConfig.find(s => s.id === userSkill.skillID);
        if (skillConfig && userSkill.skillLevel > 0) {
            const skillLevel = userSkill.skillLevel;
            const effectValue = skillConfig.base_value + (skillConfig.value_increment * (skillLevel - 1));
            skillsOutput[skillConfig.id] = { ...skillConfig, currentLevel: skillLevel, effectValue: effectValue };
        }
    });

    if (userRace) {
        const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(' ', '_')}_skill`;
        if (!skillsOutput[raceSkillId]) {
            const skillConfig = skillsConfig.find(s => s.id === raceSkillId);
            if (skillConfig) {
                skillsOutput[raceSkillId] = { ...skillConfig, currentLevel: 0, effectValue: 0 };
            }
        }
    }

    return skillsOutput;
}

// --- 3. دوال بناء الواجهة (UI Builders) ---

function buildHpBar(currentHp, maxHp) {
    currentHp = Math.max(0, currentHp);
    const percentage = (currentHp / maxHp) * 10;
    const filled = '█';
    const empty = '░';
    const bar = filled.repeat(Math.max(0, Math.floor(percentage))) + empty.repeat(Math.max(0, 10 - Math.floor(percentage)));
    return `[${bar}] ${currentHp}/${maxHp}`;
}

function buildSkillButtons(battleState, attackerId, page = 0) {
    const attacker = battleState.players.get(attackerId);
    const cooldowns = battleState.skillCooldowns[attackerId];

    const availableSkills = Object.values(attacker.skills).filter(s => s.currentLevel > 0);

    const skillsPerPage = 4;
    const totalPages = Math.ceil(availableSkills.length / skillsPerPage);
    page = Math.max(0, Math.min(page, totalPages - 1));
    battleState.skillPage = page;

    const startIndex = page * skillsPerPage;
    const endIndex = startIndex + skillsPerPage;
    const skillsToShow = availableSkills.slice(startIndex, endIndex);

    const skillButtons = new ActionRowBuilder();
    skillsToShow.forEach(skill => {
        const cooldown = cooldowns[skill.id] || 0;
        skillButtons.addComponents(
            new ButtonBuilder()
                .setCustomId(`pvp_skill_use_${skill.id}`)
                .setLabel(`${skill.name} (Lv.${skill.currentLevel})`)
                .setEmoji(skill.emoji)
                .setStyle(ButtonStyle.Primary)
                .setDisabled(cooldown > 0)
        );
    });

    const navigationButtons = new ActionRowBuilder();
    navigationButtons.addComponents(
        new ButtonBuilder().setCustomId('pvp_skill_back').setLabel('العودة').setStyle(ButtonStyle.Secondary)
    );

    if (totalPages > 1) {
        navigationButtons.addComponents(
            new ButtonBuilder()
                .setCustomId(`pvp_skill_page_${page - 1}`)
                .setLabel('◀️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === 0),
            new ButtonBuilder()
                .setCustomId(`pvp_skill_page_${page + 1}`)
                .setLabel('▶️')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(page === totalPages - 1)
        );
    }

    const components = [skillButtons, navigationButtons].filter(row => row.components.length > 0);
    return components;
}

function buildEffectsString(effects) {
    let effectsArray = [];
    if (effects.shield > 0) effectsArray.push(`🛡️ درع (${effects.shield} دور)`);
    if (effects.buff > 0) effectsArray.push(`💪 معزز (${effects.buff} دور)`);
    if (effects.weaken > 0) effectsArray.push(`📉 إضعاف (${effects.weaken} دور)`);
    if (effects.poison > 0) effectsArray.push(`☠️ تسمم (${effects.poison} دور)`);
    if (effects.penetrate > 0) effectsArray.push(`👻 اختراق (${effects.penetrate} دور)`);
    if (effects.rebound_active > 0) effectsArray.push(`🔄 ارتداد (${effects.rebound_active} دور)`);

    return effectsArray.length > 0 ? effectsArray.join('\n') : 'لا يوجد';
}

function buildBattleEmbed(battleState, skillSelectionMode = false, skillPage = 0) {
    const [attackerId, defenderId] = battleState.turn;
    const attacker = battleState.players.get(attackerId);
    const defender = battleState.players.get(defenderId);

    const cleanAttackerName = cleanDisplayName(attacker.member.user.displayName);
    const cleanDefenderName = cleanDisplayName(defender.member.user.displayName);

    const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${cleanAttackerName} 🆚 ${cleanDefenderName} ⚔️`)
        .setColor(Colors.Red)
        .setDescription(`الرهان: **${(battleState.bet * 2).toLocaleString()}** ${EMOJI_MORA}\n\n**الدور الآن لـ:** ${attacker.member}`)
        .addFields(
            {
                name: `${cleanAttackerName} (مهاجم)`,
                value: `**HP:** ${buildHpBar(attacker.hp, attacker.maxHp)}\n` +
                       `**الضرر:** \`${attacker.weapon ? attacker.weapon.currentDamage : 0} DMG\`\n` +
                       `**التأثيرات:** ${buildEffectsString(attacker.effects)}`,
                inline: true
            },
            {
                name: `${cleanDefenderName} (مدافع)`,
                value: `**HP:** ${buildHpBar(defender.hp, defender.maxHp)}\n` +
                       `**الضرر:** \`${defender.weapon ? defender.weapon.currentDamage : 0} DMG\`\n` +
                       `**التأثيرات:** ${buildEffectsString(defender.effects)}`,
                inline: true
            }
        );

    if (battleState.log.length > 0) {
        embed.addFields({ name: "آخر الأحداث:", value: battleState.log.slice(-3).join('\n'), inline: false });
    }

    if (skillSelectionMode) {
        const skillComponents = buildSkillButtons(battleState, attackerId, skillPage);
        embed.setTitle(`🌟 اختر مهارتك - Lv.${attacker.maxHp}`) // أنت تعرض maxHp هنا بدلاً من level، هذا مجرد نص
             .setDescription(`تكلفة التفعيل: دور واحد | **اختر بحكمة** (${attacker.member})`);

        return { embeds: [embed], components: skillComponents };
    }

    const mainButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pvp_action_attack').setLabel('هـجـوم').setStyle(ButtonStyle.Danger).setEmoji('⚔️'),
        new ButtonBuilder().setCustomId('pvp_action_skill').setLabel('مـهــارة').setStyle(ButtonStyle.Primary).setEmoji('<:goldgem:979098126591868928>'),
        new ButtonBuilder().setCustomId('pvp_action_forfeit').setLabel('انسحاب').setStyle(ButtonStyle.Secondary).setEmoji('🏳️')
    );

    return { embeds: [embed], components: [mainButtons] };
}


// --- 4. دوال منطق المعركة الأساسي (Core Battle Logic) ---

async function endBattle(battleState, winnerId, sql, reason = "win") {
    if (!activePvpBattles.has(battleState.message.channel.id)) {
        console.log(`[PvP End] Battle in ${battleState.message.channel.id} already ended.`);
        return;
    }

    activePvpChallenges.delete(battleState.message.channel.id);
    activePvpBattles.delete(battleState.message.channel.id);

    const collectors = battleState.collectors;
    if (collectors && collectors.button) {
        collectors.button.stop();
    }

    const getScore = battleState.message.client.getLevel;
    const setScore = battleState.message.client.setLevel;
    const guildId = battleState.message.guild.id;

    const loserId = Array.from(battleState.players.keys()).find(id => id !== winnerId);
    const winner = battleState.players.get(winnerId);
    const loser = battleState.players.get(loserId);

    if (!winner || !loser) {
        console.error(`[PvP End] Could not find winner or loser in battle state.`);
        const disabledRows = [];
        if (battleState.message && battleState.message.components && Array.isArray(battleState.message.components)) {
            battleState.message.components.forEach(row => {
                const newRow = new ActionRowBuilder();
                row.components.forEach(component => {
                    newRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
                });
                disabledRows.push(newRow);
            });
        }
        if (battleState.message) {
            await battleState.message.edit({ content: "انتهت المعركة، لكن حدث خطأ (ربما غادر أحد اللاعبين).", embeds: [], components: disabledRows }).catch(e => console.error("PvP: Failed to disable buttons on error end", e.message));
        }
        return;
    }

    const cleanWinnerName = cleanDisplayName(winner.member.user.displayName);
    const cleanLoserName = cleanDisplayName(loser.member.user.displayName);

    const moraMultiplier = calculateMoraBuff(winner.member, sql);
    const bonus = Math.floor(battleState.bet * moraMultiplier) - battleState.bet;
    const finalWinnings = battleState.totalPot + bonus;

    let bonusString = "";
    if (bonus > 0) {
        bonusString = ` ( +${bonus.toLocaleString()} ${EMOJI_MORA} )`;
    } else if (bonus < 0) {
        bonusString = ` ( ${bonus.toLocaleString()} ${EMOJI_MORA} )`;
    }

    let descriptionLines = [];
    let embed = new EmbedBuilder();

    if (reason === "forfeit") {
        const randomImage = FORFEIT_IMAGES[Math.floor(Math.random() * FORFEIT_IMAGES.length)];
        embed.setImage(randomImage);
        descriptionLines.push(`🏳️ **${cleanLoserName}** انسحب!`);
    } else {
        const randomImage = WIN_IMAGES[Math.floor(Math.random() * WIN_IMAGES.length)];
        embed.setImage(randomImage);
    }

    let winnerData = getScore.get(winnerId, guildId);
    winnerData.mora += finalWinnings;
    setScore.run(winnerData);

    const WINNER_BUFF_DURATION_MS = 5 * 60 * 1000;
    const winnerExpiresAt = Date.now() + WINNER_BUFF_DURATION_MS;
    try {
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)")
           .run(guildId, winnerId, 3, winnerExpiresAt, 'xp', 0.03);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)")
           .run(guildId, winnerId, 3, winnerExpiresAt, 'mora', 0.03);
    } catch (dbErr) {
         console.error(`[PvP Buff] Failed to apply winner buff to ${winnerId}:`, dbErr);
    }

    const WOUNDED_DURATION_MS = 15 * 60 * 1000;
    const loserExpiresAt = Date.now() + WOUNDED_DURATION_MS;
    try {
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)")
           .run(guildId, loserId, -15, loserExpiresAt, 'mora', -0.15);
        sql.prepare("INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)")
           .run(guildId, loserId, 0, loserExpiresAt, 'pvp_wounded', 0);
    } catch (dbErr) {
         console.error(`[PvP Debuff] Failed to apply wounded debuff to ${loserId}:`, dbErr);
    }

    descriptionLines.push(`✶ الـفـائـز: ${winner.member}`);
    descriptionLines.push(`✦ مبـلغ الرهـان: **${finalWinnings.toLocaleString()}** ${EMOJI_MORA}${bonusString}`);
    descriptionLines.push(`✦ حـصـل على تعزيـز اكس بي ومورا: +3% \` 5 د \` <a:buff:1438796257522094081>`);
    descriptionLines.push(``);
    descriptionLines.push(`✶ الـخـاسـر: ${loser.member}`);
    descriptionLines.push(`✦ اصبـح جـريـح وبطـور الشفـاء \` 15 د \``);
    descriptionLines.push(`✦ حـصـل عـلى اضـعـاف اكس بي ومورا: -15% \` 15 د \` <a:Nerf:1438795685280612423>`);

    embed.setTitle(`❖ انـتـهـى الـقـتـال <a:mTrophy:1438797228826300518>`)
         .setDescription(descriptionLines.join('\n'))
         .setColor(Colors.Gold)
         .setThumbnail(winner.member.displayAvatarURL());

    const disabledRows = [];
    if (battleState.message && battleState.message.components && Array.isArray(battleState.message.components)) {
        battleState.message.components.forEach(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(component => {
                newRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
            });
            disabledRows.push(newRow);
        });
    }

    if (battleState.message) {
        await battleState.message.edit({ embeds: battleState.message.embeds, components: disabledRows }).catch(e => console.error("PvP: Failed to disable buttons on end", e.message));
    }

    await battleState.message.channel.send({ embeds: [embed] });
}

function applyPersistentEffects(battleState, attackerId) {
    const attacker = battleState.players.get(attackerId);
    let logEntries = [];

    if (attacker.effects.poison > 0) {
        const poisonSkill = attacker.skills['skill_poison'] || attacker.skills['race_dark_elf_skill'];
        let poisonDamage = 0;

        if (poisonSkill && poisonSkill.id === 'skill_poison') {
            const baseWeaponDmg = attacker.weapon ? attacker.weapon.currentDamage : 10;
            poisonDamage = Math.floor(baseWeaponDmg * (poisonSkill.effectValue / 100));
        } else if (poisonSkill && poisonSkill.id === 'race_dark_elf_skill') {
            poisonDamage = poisonSkill.effectValue;
        }

        if (poisonDamage > 0) {
            attacker.hp -= poisonDamage;
            logEntries.push(`☠️ ${cleanDisplayName(attacker.member.user.displayName)} تلقى **${poisonDamage}** ضرر من السم!`);
        }
    }

    return logEntries;
}

async function startPvpBattle(i, client, sql, challengerMember, opponentMember, bet) {
    const getLevel = i.client.getLevel;
    const setLevel = i.client.setLevel;

    let challengerData = getLevel.get(challengerMember.id, i.guild.id);
    let opponentData = getLevel.get(opponentMember.id, i.guild.id);

    if (!challengerData) challengerData = { ...client.defaultData, user: challengerMember.id, guild: i.guild.id };
    if (!opponentData) opponentData = { ...client.defaultData, user: opponentMember.id, guild: i.guild.id };

    if (challengerData.mora < bet || opponentData.mora < bet) {
         activePvpChallenges.delete(i.channel.id);
         await i.followUp({ content: "أحد اللاعبين لم يعد يمتلك المورا الكافية. تم إلغاء التحدي." });
         return;
    }

    challengerData.mora -= bet;
    opponentData.mora -= bet;
    setLevel.run(challengerData);
    setLevel.run(opponentData);

    const challengerMaxHp = BASE_HP + (challengerData.level * HP_PER_LEVEL);
    const opponentMaxHp = BASE_HP + (opponentData.level * HP_PER_LEVEL);

    let challengerStartHp = challengerMaxHp;
    let opponentStartHp = opponentMaxHp;
    let battleLog = [];

    const now = Date.now();
    const challengerWound = sql.prepare("SELECT 1 FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'pvp_wounded' AND expiresAt > ?").get(challengerMember.id, i.guild.id, now);
    if (challengerWound) { 
        challengerStartHp = Math.floor(challengerMaxHp * 0.85); 
        battleLog.push(`🤕 ${cleanDisplayName(challengerMember.user.displayName)} يبدأ القتال وهو جريح! (HP -15%)`);
    }

    const opponentWound = sql.prepare("SELECT 1 FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'pvp_wounded' AND expiresAt > ?").get(opponentMember.id, i.guild.id, now);
    if (opponentWound) { 
        opponentStartHp = Math.floor(opponentMaxHp * 0.85); 
        battleLog.push(`🤕 ${cleanDisplayName(opponentMember.user.displayName)} يبدأ القتال وهو جريح! (HP -15%)`);
    }

    battleLog.push(`🔥 بدأ القتال! ${cleanDisplayName(opponentMember.user.displayName)} يبدأ أولاً!`);

    const allSkillIds = skillsConfig.map(s => s.id);
    const initialCooldowns = allSkillIds.reduce((acc, id) => { acc[id] = 0; return acc; }, {});

    const battleState = {
        message: null,
        bet: bet,
        totalPot: bet * 2,
        turn: [opponentMember.id, challengerMember.id],
        log: battleLog,
        skillPage: 0,
        processingTurn: false,
        skillCooldowns: {
            [challengerMember.id]: { ...initialCooldowns },
            [opponentMember.id]: { ...initialCooldowns }
        },
        players: new Map([
            [challengerMember.id, { member: challengerMember, hp: challengerStartHp, maxHp: challengerMaxHp, weapon: getWeaponData(sql, challengerMember), skills: getAllSkillData(sql, challengerMember), effects: { shield: 0, buff: 0, rebound_active: 0, weaken: 0, poison: 0, penetrate: 0 } }],
            [opponentMember.id, { member: opponentMember, hp: opponentStartHp, maxHp: opponentMaxHp, weapon: getWeaponData(sql, opponentMember), skills: getAllSkillData(sql, opponentMember), effects: { shield: 0, buff: 0, rebound_active: 0, weaken: 0, poison: 0, penetrate: 0 } }]
        ]),
        collectors: {}
    };

    activePvpBattles.set(i.channel.id, battleState);

    const { embeds, components } = buildBattleEmbed(battleState);
    const battleMessage = await i.channel.send({ embeds, components });
    battleState.message = battleMessage;

    const filter = (interaction) => battleState.players.has(interaction.user.id);
    const buttonCollector = battleMessage.createMessageComponentCollector({ filter, componentType: ComponentType.Button, time: 5 * 60 * 1000 });

    battleState.collectors = { button: buttonCollector };

    // --- ( ⬇️ هذا هو الإصلاح ⬇️ ) ---
    // تم حذف بلوك .on('collect') بالكامل
    // الكوليكتور ما زال يعمل في الخلفية ليقوم بتحديث التايمر (time)
    // والهاندلر العام في (index.js) هو الذي سيعالج الضغطات
    // --- ( ⬆️ نهاية الإصلاح ⬆️ ) ---

    buttonCollector.on('end', (collected, reason) => {
        const battleStateToEnd = activePvpBattles.get(i.channel.id);
        if (!battleStateToEnd) return; 

        if (reason === 'time') {
            const attackerId = battleStateToEnd.turn[0];
            const defenderId = battleStateToEnd.turn[1];
            console.log(`[PvP Timeout] Battle in ${i.channel.id} ended. ${attackerId} (attacker) timed out. ${defenderId} wins.`);
            endBattle(battleStateToEnd, defenderId, sql, "forfeit");
        }
    });
}

// --- 5. التصدير (Exports) ---
module.exports = {
    // الحالة
    activePvpChallenges,
    activePvpBattles,

    // الإعدادات
    BASE_HP,
    HP_PER_LEVEL,
    SKILL_COOLDOWN_TURNS,

    // الدوال المساعدة
    cleanDisplayName,
    getUserRace,
    getWeaponData,
    getAllSkillData,

    // دوال الواجهة
    buildBattleEmbed,

    // دوال المنطق الأساسي
    startPvpBattle,
    endBattle,
    applyPersistentEffects,
};