// --- ( ⬇️ هذا هو السطر المهم الذي تم تصحيحه ⬇️ ) ---
const { MessageFlags, EmbedBuilder, ActionRowBuilder, ButtonBuilder, Colors } = require("discord.js");
const core = require('./pvp-core.js'); 

/**
 * يعالج تفاعلات قبول أو رفض التحدي
 */
async function handlePvpChallenge(i, client, sql) {
    const parts = i.customId.split('_');
    const action = parts[1];
    const challengerId = parts[2];
    const opponentId = parts[3];
    const bet = parseInt(parts[4]);

    if (i.user.id !== opponentId && (action === 'accept' || action === 'decline')) {
        // --- ( ⬇️ تم الإصلاح هنا ⬇️ ) ---
        return i.reply({ content: "أنت لست الشخص المطلوب في هذا التحدي.", flags: [MessageFlags.Ephemeral] });
    }

    // سماح للمتحدي بإلغاء التحدي
    if (i.user.id === challengerId && action === 'decline') {
        if (!core.activePvpChallenges.has(i.channel.id)) return i.update({ content: "انتهى وقت هذا التحدي.", embeds: [], components: [] });
        core.activePvpChallenges.delete(i.channel.id);

        const challengerData = client.getLevel.get(challengerId, i.guild.id);
        if (challengerData) {
            challengerData.lastPVP = 0; // إرجاع الكول داون
            client.setLevel.run(challengerData);
        }

        const declineEmbed = new EmbedBuilder()
            .setTitle('⚔️ تم إلغاء التحدي')
            .setDescription(`قام ${core.cleanDisplayName(i.member.user.displayName)} بإلغاء التحدي.`)
            .setColor(Colors.Grey);
        return i.update({ embeds: [declineEmbed], components: [] });
    }

    // الخصم يرفض
    if (action === 'decline') {
        if (!core.activePvpChallenges.has(i.channel.id)) return i.update({ content: "انتهى وقت هذا التحدي.", embeds: [], components: [] });
        core.activePvpChallenges.delete(i.channel.id);

        const challengerData = client.getLevel.get(challengerId, i.guild.id);
        if (challengerData) {
            challengerData.lastPVP = 0; // إرجاع الكول داون
            client.setLevel.run(challengerData);
        }

        const declineEmbed = new EmbedBuilder()
            .setTitle('🛡️ تم رفض التحدي')
            .setDescription(`لقد قام ${core.cleanDisplayName(i.member.user.displayName)} برفض التحدي.`)
            .setColor(Colors.Red);
        return i.update({ embeds: [declineEmbed], components: [] });

    } else if (action === 'accept') {
        if (!core.activePvpChallenges.has(i.channel.id)) return i.update({ content: "انتهى وقت هذا التحدي.", embeds: [], components: [] });

        const opponentMember = i.member;
        const challengerMember = await i.guild.members.fetch(challengerId).catch(() => null);

        if (!challengerMember) {
             const challengerData = client.getLevel.get(challengerId, i.guild.id);
             if (challengerData) {
                    challengerData.lastPVP = 0;
                    client.setLevel.run(challengerData);
             }
            return i.update({ content: "لم يتم العثور على المتحدي، ربما غادر السيرفر. تم إلغاء الكول داون.", embeds: [], components: [] });
        }

        // التحقق من جاهزية الخصم (الذي ضغط قبول)
        const opponentRace = core.getUserRace(opponentMember, sql);
        const opponentWeapon = core.getWeaponData(sql, opponentMember);

        if (!opponentRace || !opponentWeapon || opponentWeapon.currentLevel === 0) {
            // --- ( ⬇️ تم الإصلاح هنا ⬇️ ) ---
            return i.reply({
                content: `❌ | لا يمكنك قبول التحدي وأنت لست جاهزاً! (تحتاج إلى عرق + سلاح مستوى 1 على الأقل).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // التحقق من جاهزية المتحدي (ربما غير سلاحه أو عرقه أثناء الانتظار)
        const challengerRace = core.getUserRace(challengerMember, sql);
        const challengerWeapon = core.getWeaponData(sql, challengerMember);

        if (!challengerRace || !challengerWeapon || challengerWeapon.currentLevel === 0) {
            const challengerData = client.getLevel.get(challengerId, i.guild.id);
            if (challengerData) {
                challengerData.lastPVP = 0; // إرجاع الكول داون
                client.setLevel.run(challengerData);
            }
            return i.update({
                content: `❌ | تم إلغاء التحدي! المتحدي (${core.cleanDisplayName(challengerMember.user.displayName)}) ليس جاهزاً للقتال (يحتاج إلى عرق + سلاح).`,
                embeds: [], components: []
            });
        }

        core.activePvpChallenges.delete(i.channel.id);
        await i.deferUpdate(); 

        // تعطيل أزرار التحدي
        const disabledRows = [];
        if (i.message.components && Array.isArray(i.message.components)) {
            i.message.components.forEach(row => {
                const newRow = new ActionRowBuilder();
                row.components.forEach(component => {
                    newRow.addComponents(ButtonBuilder.from(component).setDisabled(true));
                });
                disabledRows.push(newRow);
            });
        }
        await i.editReply({ components: disabledRows });

        const acceptEmbed = new EmbedBuilder()
            .setTitle('🔥 تم قبول التحدي!')
            .setDescription(`**${core.cleanDisplayName(opponentMember.user.displayName)}** قبل التحدي!\nجاري تحضير ساحة القتال...`)
            .setColor(Colors.Green);
        await i.followUp({ embeds: [acceptEmbed] });

        // بدء المعركة
        await core.startPvpBattle(i, client, sql, challengerMember, opponentMember, bet);
    }
}


/**
 * يعالج تفاعلات المعركة (هجوم، مهارة، الخ)
 */
async function handlePvpTurn(i, client, sql) {
    const battleState = core.activePvpBattles.get(i.channel.id);
    if (!battleState) {
        if (i.customId.startsWith('pvp_')) {
             return i.update({ content: "انتهت هذه المعركة.", components: [] }).catch(() => {});
        }
        return;
    }

    const attackerId = battleState.turn[0];
    const defenderId = battleState.turn[1];

    if (i.user.id !== attackerId) {
        // --- ( ⬇️ تم الإصلاح هنا ⬇️ ) ---
        return i.reply({ content: "ليس دورك!", flags: [MessageFlags.Ephemeral] });
    }

    // --- 1. معالجة الأزرار التي لا تستهلك الدور (بدون قفل) ---
    // (مثل فتح قائمة المهارات، العودة، تقليب الصفحات)
    try {
        if (i.customId === 'pvp_action_skill') {
            const { embeds, components } = core.buildBattleEmbed(battleState, true, battleState.skillPage);
            return await i.update({ embeds, components });
        }
        if (i.customId === 'pvp_skill_back') {
            const { embeds, components } = core.buildBattleEmbed(battleState, false);
            return await i.update({ embeds, components });
        }
        if (i.customId.startsWith('pvp_skill_page_')) {
            const page = parseInt(i.customId.split('_')[3]);
            const { embeds, components } = core.buildBattleEmbed(battleState, true, page);
            return await i.update({ embeds, components });
        }
        if (i.customId.startsWith('pvp_skill_use_')) {
            const skillId = i.customId.replace('pvp_skill_use_', '');
            const attacker = battleState.players.get(attackerId);
            const skill = Object.values(attacker.skills).find(s => s.id === skillId);

            // إذا كانت المهارة في فترة تبريد، فقط قم بتحديث الواجهة (لا تستهلك الدور)
            if (!skill || battleState.skillCooldowns[attackerId][skillId] > 0) {
                const { embeds, components } = core.buildBattleEmbed(battleState, true, battleState.skillPage);
                return await i.update({ embeds, components });
            }
            // إذا كانت المهارة جاهزة، لا تفعل شيئاً هنا، دع الكود يكمل إلى القسم 2
        }
    } catch (e) {
        if (e.code === 10062) { // Unknown Interaction (سبام)
            console.warn(`[PvP] Ignored spam click (fast action): ${i.customId}`);
            return; 
        }
        throw e; 
    }


    // --- 2. معالجة الأزرار التي تستهلك الدور (مع قفل) ---
    // (مثل الهجوم، استخدام مهارة جاهزة، انسحاب)
    if (battleState.processingTurn) {
        // --- ( ⬇️ تم الإصلاح هنا ⬇️ ) ---
        return i.reply({ content: "⌛ جاري معالجة دورك... يرجى الانتظار لحظة.", flags: [MessageFlags.Ephemeral] });
    }
    battleState.processingTurn = true; // <-- قفل الدور

    try {
        try {
            await i.deferUpdate(); // <-- تأكيد استلام الضغطة
        } catch (e) {
            if (e.code === 10062) {
                 console.error(`[PvP] Failed to defer turn-consuming action (interaction: ${i.id}): ${e.message}`);
                 battleState.processingTurn = false;
                 return; 
            }
             console.error(`[PvP] Failed to defer turn-consuming action (interaction: ${i.id}): ${e.message}`);
             battleState.processingTurn = false;
             return; 
        }

        const attacker = battleState.players.get(attackerId);
        const defender = battleState.players.get(defenderId);
        const cleanAttackerName = core.cleanDisplayName(attacker.member.user.displayName);
        const cleanDefenderName = core.cleanDisplayName(defender.member.user.displayName);

        // تطبيق تأثيرات (مثل السم) قبل أن يبدأ اللاعب دوره
        const persistentEffectsLog = core.applyPersistentEffects(battleState, attackerId);
        battleState.log.push(...persistentEffectsLog);

        // التحقق إذا مات اللاعب بسبب السم
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            const { embeds: preEmbeds, components: preComponents } = core.buildBattleEmbed(battleState);
            await i.editReply({ embeds: preEmbeds, components: preComponents });
            await core.endBattle(battleState, defenderId, sql, "win");
            return; 
        }

        // تقليل مدة التأثيرات والكول داون (لأن الدور سيبدأ الآن)
        Object.keys(attacker.effects).forEach(effect => {
            if (attacker.effects[effect] > 0) attacker.effects[effect]--;
        });
        Object.keys(battleState.skillCooldowns[attackerId]).forEach(skill => {
            if (battleState.skillCooldowns[attackerId][skill] > 0) {
                battleState.skillCooldowns[attackerId][skill]--;
            }
        });

        // معالجة الانسحاب
        if (i.customId === 'pvp_action_forfeit') {
            await i.editReply({ content: 'تم الانسحاب...', embeds: [], components: [] });
            await core.endBattle(battleState, defenderId, sql, "forfeit");
            return; 
        }

        let actionLog = "";

        // معالجة استخدام المهارة (التي تم التأكد من أنها جاهزة في القسم 1)
        if (i.customId.startsWith('pvp_skill_use_')) {
            const skillId = i.customId.replace('pvp_skill_use_', '');
            const skill = Object.values(attacker.skills).find(s => s.id === skillId);

            battleState.skillCooldowns[attackerId][skillId] = core.SKILL_COOLDOWN_TURNS + 1; // +1 لأنه سيتم تقليله فوراً

            switch (skillId) {
                case 'skill_healing':
                    const healAmount = Math.floor(attacker.maxHp * (skill.effectValue / 100));
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
                    actionLog = `❤️‍🩹 ${cleanAttackerName} استخدم الشفاء واستعاد **${healAmount}** HP!`;
                    break;
                case 'skill_shielding':
                    attacker.effects.shield = 2; // يستمر للدور القادم (سيصبح 1)
                    actionLog = `🛡️ ${cleanAttackerName} استخدم الدرع! (يقلل الضرر بنسبة ${skill.effectValue}% للدور القادم)`;
                    break;
                case 'skill_buffing':
                    attacker.effects.buff = 2;
                    actionLog = `💪 ${cleanAttackerName} استخدم التعزيز! (+${skill.effectValue}% ضرر)`;
                    break;
                case 'skill_rebound':
                     attacker.effects.rebound_active = 2;
                     actionLog = `🔄 ${cleanAttackerName} قام بتفعيل الارتداد العكسي!`;
                     break;
                case 'skill_weaken':
                    defender.effects.weaken = 2;
                    actionLog = `📉 ${cleanAttackerName} استخدم الإضعاف! سيتم تقليل ضرر ${cleanDefenderName} القادم بنسبة ${skill.effectValue}%.`;
                    break;
                case 'skill_dispel':
                    defender.effects.shield = 0;
                    defender.effects.buff = 0;
                    defender.effects.rebound_active = 0;
                    defender.effects.penetrate = 0;
                    actionLog = `💨 ${cleanAttackerName} استخدم تبديد السحر! أزال كل تأثيرات ${cleanDefenderName} الإيجابية.`;
                    break;
                case 'skill_cleanse':
                    attacker.effects.weaken = 0;
                    attacker.effects.poison = 0;
                    const cleanseHeal = Math.floor(attacker.maxHp * (skill.effectValue / 100));
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + cleanseHeal);
                    actionLog = `✨ ${cleanAttackerName} استخدم تطهير ذاتي! أزال التأثيرات السلبية واستعاد **${cleanseHeal}** HP.`;
                    break;
                case 'skill_poison':
                    defender.effects.poison = 4; // يستمر 3 أدوار قادمة
                    const basePoisonDmg = skill.effectValue;
                    defender.hp -= basePoisonDmg;
                    actionLog = `☠️ ${cleanAttackerName} استخدم تسميم! ألحق **${basePoisonDmg}** ضرر فوري وسيستمر الضرر لـ 3 أدوار.`;
                    break;
                case 'skill_gamble':
                    const baseDmg = attacker.weapon ? attacker.weapon.currentDamage : 10;
                    let gambleDamage = 0;
                    if (Math.random() < 0.5) {
                        gambleDamage = Math.floor(baseDmg * 1.5);
                        actionLog = `🎲 ${cleanAttackerName} قام بالمقامرة... نجاح باهر! ألحق **${gambleDamage}** ضرر مدمر!`;
                    } else {
                        gambleDamage = Math.floor(baseDmg * 0.25);
                        actionLog = `🎲 ${cleanAttackerName} قام بالمقامرة... حظ سيء! ألحق **${gambleDamage}** ضرر ضعيف.`;
                    }
                    defender.hp -= gambleDamage;
                    break;
                case 'race_dragon_skill':
                    const trueDamage = skill.effectValue;
                    defender.hp -= trueDamage;
                    actionLog = `🔥 ${cleanAttackerName} استخدم نفس التنين! ألحق **${trueDamage}** ضرر حقيقي يتجاهل الدرع!`;
                    break;
                case 'race_human_skill':
                    attacker.effects.shield = 2;
                    attacker.effects.buff = 2;
                    actionLog = `🛡️💪 ${cleanAttackerName} استخدم الإرادة البشرية! حصل على درع وتعزيز بنصف القوة (${skill.effectValue}%).`;
                    break;
                case 'race_seraphim_skill':
                    const seraphDmg = skill.effectValue;
                    const seraphHeal = Math.floor(attacker.maxHp * 0.10);
                    defender.hp -= seraphDmg;
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + seraphHeal);
                    actionLog = `✨ ${cleanAttackerName} استخدم حكم سماوي! ألحق **${seraphDmg}** ضرر واستعاد **${seraphHeal}** HP.`;
                    break;
                case 'race_demon_skill':
                    const recoilDmg = skill.effectValue;
                    const selfDmg = Math.floor(attacker.hp * 0.10);
                    defender.hp -= recoilDmg;
                    attacker.hp -= selfDmg;
                    actionLog = `🩸 ${cleanAttackerName} استخدم عهد الدم! ألحق **${recoilDmg}** ضرر مدمر، ولكنه خسر **${selfDmg}** HP.`;
                    break;
                case 'race_elf_skill':
                    const multiHitDmg = Math.floor((attacker.weapon ? attacker.weapon.currentDamage : 10) * (skill.effectValue / 100));
                    defender.hp -= multiHitDmg;
                    defender.hp -= multiHitDmg;
                    actionLog = `🏹 ${cleanAttackerName} استخدم رمية مزدوجة! ألحق **${multiHitDmg}** + **${multiHitDmg}** ضرر!`;
                    break;
                case 'race_dark_elf_skill':
                    const deBaseDmg = Math.floor(skill.effectValue / 2);
                    defender.hp -= deBaseDmg;
                    defender.effects.poison = 4;
                    actionLog = `🗡️ ${cleanAttackerName} استخدم سم الظلال! ألحق **${deBaseDmg}** ضرر فوري وتسبب بسم قوي.`;
                    break;
                case 'race_vampire_skill':
                    const lifestealBase = Math.floor((attacker.weapon ? attacker.weapon.currentDamage : 10) * (skill.effectValue / 100));
                    const lifestealHeal = Math.floor(lifestealBase * 0.50);
                    defender.hp -= lifestealBase;
                    attacker.hp = Math.min(attacker.maxHp, attacker.hp + lifestealHeal);
                    actionLog = `🦇 ${cleanAttackerName} استخدم التهام! ألحق **${lifestealBase}** ضرر واستعاد **${lifestealHeal}** HP.`;
                    break;
                case 'race_hybrid_skill':
                    const rand = Math.random();
                    if (rand < 0.33) {
                        attacker.effects.shield = 2;
                        actionLog = `🌀 ${cleanAttackerName} استخدم تكيف وحصل على درع! (${skill.effectValue}%)`;
                    } else if (rand < 0.66) {
                        attacker.effects.buff = 2;
                        actionLog = `🌀 ${cleanAttackerName} استخدم تكيف وحصل على تعزيز! (${skill.effectValue}%)`;
                    } else {
                        const hybridHeal = Math.floor(attacker.maxHp * (skill.effectValue / 100));
                        attacker.hp = Math.min(attacker.maxHp, attacker.hp + hybridHeal);
                        actionLog = `🌀 ${cleanAttackerName} استخدم تكيف واستعاد **${hybridHeal}** HP!`;
                    }
                    break;
                case 'race_spirit_skill':
                    attacker.effects.penetrate = 2;
                    actionLog = `👻 ${cleanAttackerName} استخدم اختراق! هجومه القادم سيتجاهل الدرع.`;
                    break;
                case 'race_dwarf_skill':
                    attacker.effects.shield = 2;
                    actionLog = `⛰️ ${cleanAttackerName} استخدم تحصين! حصل على درع هائل (${skill.effectValue}%) لكنه يستهلك الدور.`;
                    break;
                case 'race_ghoul_skill':
                    const ghoulDmg = Math.floor((attacker.weapon ? attacker.weapon.currentDamage : 10) * (skill.effectValue / 100));
                    defender.hp -= ghoulDmg;
                    defender.effects.weaken = 2;
                    actionLog = `🤢 ${cleanAttackerName} استخدم هجوم بائس! ألحق **${ghoulDmg}** ضرر وأضعف الخصم (10%).`;
                    break;
            }
            battleState.log.push(actionLog);
        }

        // معالجة الهجوم
        if (i.customId === 'pvp_action_attack') {
            if (!attacker.weapon || attacker.weapon.currentLevel === 0) {
                 battleState.log.push(`❌ ${cleanAttackerName} حاول الهجوم لكنه لا يملك سلاحاً!`);
            } else {
                let damage = attacker.weapon.currentDamage;
                if (attacker.effects.buff > 0) {
                    const buffSkill = attacker.skills['skill_buffing'] || attacker.skills['race_human_skill'];
                    if (buffSkill) { damage *= (1 + (buffSkill.effectValue / 100)); }
                }
                if (attacker.effects.weaken > 0) {
                    const weakenSkill = defender.skills['skill_weaken'] || defender.skills['race_ghoul_skill'];
                    let weakenPercent = 0.10;
                    if (weakenSkill && weakenSkill.id === 'skill_weaken') { weakenPercent = weakenSkill.effectValue / 100; }
                    damage *= (1 - weakenPercent);
                }

                let damageTaken = Math.floor(damage);

                if (attacker.effects.penetrate > 0) {
                    battleState.log.push(`👻 ${cleanAttackerName} تجاهل درع الخصم!`);
                } else if (defender.effects.shield > 0) {
                    const shieldSkill = defender.skills['skill_shielding'] || defender.skills['race_human_skill'] || defender.skills['race_dwarf_skill'];
                    if (shieldSkill) { damageTaken = Math.floor(damageTaken * (1 - (shieldSkill.effectValue / 100))); }
                }

                defender.hp -= damageTaken;
                battleState.log.push(`⚔️ ${cleanAttackerName} هاجم وألحق **${damageTaken}** ضرر بـ ${cleanDefenderName}!`);

                // معالجة الارتداد
                if (defender.effects.rebound_active > 0 && defender.skills['skill_rebound']) {
                    const reboundSkill = defender.skills['skill_rebound'];
                    const reboundPercent = reboundSkill.effectValue / 100;
                    const reboundDamage = Math.floor(damageTaken * reboundPercent);
                    if (reboundDamage > 0) {
                        attacker.hp -= reboundDamage;
                        battleState.log.push(`🔄 ${cleanDefenderName} عكس **${reboundDamage}** ضرر إلى ${cleanAttackerName}!`);
                    }
                }
            }
        }

        // التحقق من نهاية المعركة
        if (defender.hp <= 0) {
            defender.hp = 0;
            const { embeds, components } = core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components });
            await core.endBattle(battleState, attackerId, sql, "win");
            return;
        }
        if (attacker.hp <= 0) {
            attacker.hp = 0;
            const { embeds, components } = core.buildBattleEmbed(battleState);
            await i.editReply({ embeds, components });
            await core.endBattle(battleState, defenderId, sql, "win");
            return;
        }

        // تبديل الدور
        battleState.turn = [defenderId, attackerId];
        const { embeds, components } = core.buildBattleEmbed(battleState, false); // <-- العودة للواجهة الرئيسية
        await i.editReply({ embeds, components });

    } finally {
        // --- تحرير القفل ---
        if (battleState) {
            battleState.processingTurn = false;
        }
    }
}


/**
 * الموجه الرئيسي لتفاعلات الـ PvP
 * (هذا ما يجب أن يستدعيه ملف index.js)
 */
async function handlePvpInteraction(i, client, sql) {
    try {
        if (i.customId.startsWith('pvp_accept_') || i.customId.startsWith('pvp_decline_')) {
            await handlePvpChallenge(i, client, sql);
        } else {
            await handlePvpTurn(i, client, sql);
        }
    } catch (error) {
        if (error.code === 10062) { // Unknown Interaction
            console.warn(`[PvP Handler] Failed to respond to interaction (maybe user spammed or interaction is old): ${error.message}`);
            const battleState = core.activePvpBattles.get(i.channel.id);
            if (battleState && battleState.processingTurn) {
                battleState.processingTurn = false;
            }
            return;
        }

        console.error("[PvP Handler] A critical error occurred:", error);

        // --- ( ⬇️ إصلاح للخطأ الفادح ⬇️ ) ---
        if (!i.replied && !i.deferred) {
            await i.reply({ content: "حدث خطأ غير متوقع.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
        } else {
            await i.followUp({ content: "حدث خطأ غير متوقع أثناء معالجة دورك.", flags: [MessageFlags.Ephemeral] }).catch(() => {});
        }
        // --- ( ⬆️ نهاية الإصلاح ⬆️ ) ---

        // محاولة إنهاء المعركة اضطرارياً
        const battleState = core.activePvpBattles.get(i.channel.id);
        if (battleState) {
            console.error(`[PvP Handler] Force-ending battle in channel ${i.channel.id} due to error.`);
            const participants = Array.from(battleState.players.keys());
            // جعل اللاعب الذي ليس عليه الدور هو الفائز افتراضياً
            const winner = battleState.turn[1] || participants.find(p => p !== battleState.turn[0]);
            if(winner) {
                await core.endBattle(battleState, winner, sql, "forfeit");
            } else {
                 core.activePvpBattles.delete(i.channel.id); // إذا لم نجد فائزاً، فقط احذف المعركة
            }
        }
    }
}

module.exports = {
    handlePvpInteraction,
    activePvpChallenges: core.activePvpChallenges,
    activePvpBattles: core.activePvpBattles,
};