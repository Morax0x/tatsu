const { EmbedBuilder, Colors, MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require("discord.js");
const { sendLevelUpMessage } = require('./handler-utils.js');
const farmAnimals = require('../json/farm-animals.json');
const shopItems = require('../json/shop-items.json');
const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577";

const XP_EXCHANGE_RATE = 3;

const BANNER_URL = 'https://i.postimg.cc/NMkWVyLV/line.png';
const THUMBNAILS = new Map([
    ['upgrade_weapon', 'https://i.postimg.cc/CMXxsXT1/tsmym-bdwn-ʿnwan-7.png'],
    ['upgrade_skill', 'https://i.postimg.cc/CMkxJJF4/tsmym-bdwn-ʿnwan-8.png'],
    ['exchange_xp', 'https://i.postimg.cc/2yKbQSd3/tsmym-bdwn-ʿnwan-6.png'],
    ['personal_guard_1d', 'https://i.postimg.cc/CMv2qp8n/tsmym-bdwn-ʿnwan-1.png'],
    ['streak_shield', 'https://i.postimg.cc/3rbLwCMj/tsmym-bdwn-ʿnwan-2.png'],
    ['streak_shield_media', 'https://i.postimg.cc/3rbLwCMj/tsmym-bdwn-ʿnwan-2.png'],
    ['xp_buff_1d_3', 'https://i.postimg.cc/TP9zNLK4/tsmym-bdwn-ʿnwan-3.png'],
    ['xp_buff_1d_7', 'https://i.postimg.cc/Gmn6cJYG/tsmym-bdwn-ʿnwan-4.png'],
    ['xp_buff_2d_10', 'https://i.postimg.cc/NFrPt5jN/tsmym-bdwn-ʿnwan-5.png'],
    ['vip_role_3d', 'https://i.postimg.cc/4drRpC7d/2.webp'],
    ['discord_effect_5', 'https://i.postimg.cc/50QZ4PPL/1.webp'],
    ['discord_effect_10', 'https://i.postimg.cc/tJHmX9nh/3.webp'],
    ['nitro_basic', 'https://i.postimg.cc/Qxmn3G8K/5.webp'],
    ['nitro_gaming', 'https://i.postimg.cc/kXJfw1Q4/6.webp'],
    ['change_race', 'https://i.postimg.cc/rs4mmjvs/tsmym-bdwn-ʿnwan-9.png']
]);


function getGeneralSkills() {
    return skillsConfig.filter(s => s.id.startsWith('skill_'));
}

function getRaceSkillConfig(raceName) {
    const skillId = `race_${raceName.toLowerCase().replace(' ', '_')}_skill`;
    return skillsConfig.find(s => s.id === skillId);
}

function getUserRace(member, sql) {
    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(member.guild.id);
    const userRoleIDs = member.roles.cache.map(r => r.id);
    const userRace = allRaceRoles.find(r => userRoleIDs.includes(r.roleID));
    return userRace || null;
}

function getAllUserAvailableSkills(member, sql) {
    const generalSkills = getGeneralSkills();
    const userRace = getUserRace(member, sql);
    let raceSkill = null;

    if (userRace) {
        raceSkill = getRaceSkillConfig(userRace.raceName);
    }

    let allSkills = [];
    if (raceSkill) {
        allSkills.push(raceSkill);
    }
    allSkills = allSkills.concat(generalSkills);

    return allSkills;
}


function getBuyableItems() {
    return shopItems.filter(it => !['upgrade_weapon', 'upgrade_skill', 'exchange_xp'].includes(it.id));
}

function buildPaginatedItemEmbed(selectedItemId) {
    const buyableItems = getBuyableItems();
    const itemIndex = buyableItems.findIndex(it => it.id === selectedItemId);
    if (itemIndex === -1) return null;

    const item = buyableItems[itemIndex];
    const totalItems = buyableItems.length;

    const prevIndex = (itemIndex - 1 + totalItems) % totalItems;
    const nextIndex = (itemIndex + 1) % totalItems;
    const prevItemId = buyableItems[prevIndex].id;
    const nextItemId = buyableItems[nextIndex].id;

    const detailEmbed = new EmbedBuilder()
        .setTitle(`${item.emoji} ${item.name}`)
        .setDescription(item.description)
        .addFields({ name: 'السعر', value: `**${item.price.toLocaleString()}** ${EMOJI_MORA}`, inline: true })
        .setColor(Colors.Greyple)
        .setImage(BANNER_URL)
        .setThumbnail(THUMBNAILS.get(item.id) || item.image || null)
        .setFooter({ text: `العنصر ${itemIndex + 1} / ${totalItems}` });

    const prevButton = new ButtonBuilder().setCustomId(`shop_paginate_item_${prevItemId}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary);
    const buyButton = new ButtonBuilder().setCustomId(`buy_item_${item.id}`).setLabel('شراء').setStyle(ButtonStyle.Success).setEmoji('<:mora:1435647151349698621>');
    const nextButton = new ButtonBuilder().setCustomId(`shop_paginate_item_${nextItemId}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(prevButton, buyButton, nextButton);
    return { embeds: [detailEmbed], components: [row] };
}


function buildSkillEmbedWithPagination(allUserSkills, pageIndex, sql, i) {
    pageIndex = parseInt(pageIndex) || 0;
    const totalSkills = allUserSkills.length;

    if (pageIndex < 0) pageIndex = totalSkills - 1;
    if (pageIndex >= totalSkills) pageIndex = 0;

    const skillConfig = allUserSkills[pageIndex];
    if (!skillConfig) return { content: '❌ خطأ: لم يتم العثور على المهارة.', embeds: [], components: [] };

    const prevIndex = (pageIndex - 1 + totalSkills) % totalSkills;
    const nextIndex = (pageIndex + 1) % totalSkills;

    let userSkill = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillID = ?").get(i.user.id, i.guild.id, skillConfig.id);
    let currentLevel = userSkill ? userSkill.skillLevel : 0;

    const isRaceSkill = skillConfig.id.startsWith('race_');
    const embedTitle = `${skillConfig.emoji} ${skillConfig.name}`;

    const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setDescription(skillConfig.description)
        .setColor(isRaceSkill ? Colors.Gold : Colors.Blue)
        .setImage(BANNER_URL)
        .setThumbnail(THUMBNAILS.get('upgrade_skill'))
        .setFooter({ text: `المهارة ${pageIndex + 1} / ${totalSkills}` });

    const navigationRow = new ActionRowBuilder();
    const buttonRow = new ActionRowBuilder();

    navigationRow.addComponents(
        new ButtonBuilder().setCustomId(`shop_skill_paginate_${prevIndex}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`shop_skill_paginate_${nextIndex}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary)
    );

    _buildSkillEmbedFields(embed, buttonRow, skillConfig, currentLevel);

    const components = [buttonRow, navigationRow].filter(r => r.components.length > 0);
    return { embeds: [embed], components: components };
}

function _buildSkillEmbedFields(embed, buttonRow, skillConfig, currentLevel) {
    let currentEffect, nextEffect, nextLevelPrice, buttonId, buttonLabel;
    const effectType = skillConfig.stat_type.includes('%') ? '%' : (skillConfig.stat_type === 'TrueDMG' || skillConfig.stat_type === 'RecoilDMG' ? ' DMG' : '');

    if (currentLevel === 0) {
        currentEffect = 0;
    } else if (skillConfig.max_level === 1) {
        currentEffect = skillConfig.base_value;
    } else {
        currentEffect = skillConfig.base_value + (skillConfig.value_increment * (currentLevel - 1));
    }

    embed.addFields(
        { name: "المستوى الحالي", value: `Lv. ${currentLevel}`, inline: true },
        { name: "التأثير الحالي", value: `${currentEffect}${effectType}`, inline: true }
    );

    if (currentLevel >= skillConfig.max_level) {
        embed.addFields({ name: "التطوير القادم", value: "وصلت للحد الأقصى!", inline: true });
        buttonRow.addComponents(
            new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true)
        );
    } else {
        if (currentLevel === 0) {
            nextLevelPrice = skillConfig.base_price;
            buttonLabel = `شراء (المستوى 1)`;
            buttonId = `buy_skill_${skillConfig.id}`;
        } else {
            nextLevelPrice = skillConfig.base_price + (skillConfig.price_increment * currentLevel);
            buttonLabel = `تطوير (المستوى ${currentLevel + 1})`;
            buttonId = `upgrade_skill_${skillConfig.id}`;
        }

        if (skillConfig.max_level === 1) {
            nextEffect = skillConfig.base_value;
        } else {
            nextEffect = skillConfig.base_value + (skillConfig.value_increment * currentLevel);
        }

        embed.addFields(
            { name: "المستوى القادم", value: `Lv. ${currentLevel + 1}`, inline: true },
            { name: "التأثير القادم", value: `${nextEffect}${effectType}`, inline: true },
            { name: "تكلفة التطوير", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true }
        );
        buttonRow.addComponents(
            new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️')
        );
    }
}

async function handleShopModal(i, client, sql) {
    if (i.customId === 'exchange_xp_modal') {
        await _handleXpExchangeModal(i, client, sql);
        return true;
    }

    const isBuyMarket = i.customId.startsWith('buy_modal_');
    const isSellMarket = i.customId.startsWith('sell_modal_');
    const isBuyFarm = i.customId.startsWith('buy_animal_');
    const isSellFarm = i.customId.startsWith('sell_animal_');

    if (isBuyMarket || isSellMarket || isBuyFarm || isSellFarm) {
        await _handleBuySellModal(i, client, sql, { isBuyMarket, isSellMarket, isBuyFarm, isSellFarm });
        return true;
    }

    return false;
}
async function _handleBuySellModal(i, client, sql, types) {
    const { isBuyMarket, isSellMarket, isBuyFarm, isSellFarm } = types;

    await i.deferReply({ ephemeral: false });
    try {
        const quantityString = i.fields.getTextInputValue('quantity_input');
        const quantity = parseInt(quantityString.trim().replace(/,/g, ''));
        if (isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
            return await i.editReply({ content: '❌ كمية غير صالحة. الرجاء إدخال رقم صحيح موجب فقط.' });
        }
        let userData = client.getLevel.get(i.user.id, i.guild.id);
        if (!userData) {
             userData = { ...client.defaultData, user: i.user.id, guild: i.guild.id };
        }
        let userMora = userData.mora || 0;
        if (isBuyFarm || isSellFarm) {
            const animalId = i.customId.replace(isBuyFarm ? 'buy_animal_' : 'sell_animal_', '');
            const animal = farmAnimals.find(a => a.id === animalId);
            if (!animal) return await i.editReply({ content: '❌ هذا الحيوان غير موجود.' });
            const insertFarm = sql.prepare("INSERT INTO user_farm (guildID, userID, animalID, purchaseTimestamp, lastCollected) VALUES (?, ?, ?, ?, ?)");
            const deleteFarm = sql.prepare("DELETE FROM user_farm WHERE id = ?");
            const getFarmCount = sql.prepare("SELECT COUNT(*) as count FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ?");
            if (isBuyFarm) {
                const totalCost = Math.floor(animal.price * quantity);
                if (userMora < totalCost) {
                    return await i.editReply({ content: `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}` });
                }
                userData.mora -= totalCost;
                const now = Date.now();
                for (let j = 0; j < quantity; j++) {
                    insertFarm.run(i.guild.id, i.user.id, animal.id, now, now);
                }
                userData.shop_purchases = (userData.shop_purchases || 0) + 1;
                client.setLevel.run(userData);

                const embed = new EmbedBuilder().setTitle('✅ تمت عملية الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity.toLocaleString()}** × ${animal.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n💰 الرصيد المتبقي: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
                return await i.editReply({ embeds: [embed] });
            } else if (isSellFarm) {
                const farmCount = getFarmCount.get(i.user.id, i.guild.id, animal.id).count;
                if (farmCount < quantity) {
                    return await i.editReply({ content: `❌ لا تملك هذه الكمية للبيع. تملك: **${farmCount}**` });
                }
                const animalsToDelete = sql.prepare("SELECT id FROM user_farm WHERE userID = ? AND guildID = ? AND animalID = ? ORDER BY purchaseTimestamp ASC LIMIT ?").all(i.user.id, i.guild.id, animal.id, quantity);
                sql.transaction(() => {
                    for (const animalInstance of animalsToDelete) {
                        deleteFarm.run(animalInstance.id);
                    }
                })();
                const sellPrice = Math.floor(animal.price * 0.70);
                const totalGain = sellPrice * quantity;
                userData.mora += totalGain;
                client.setLevel.run(userData);
                const embed = new EmbedBuilder().setTitle('✅ تمت عملية البيع').setColor(Colors.Green).setDescription(`📦 **${quantity.toLocaleString()}** × ${animal.name}\n💵 الأرباح: **${totalGain.toLocaleString()}** ${EMOJI_MORA} (بسعر ${sellPrice} للواحد)\n💰 الرصيد الجديد: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
                return await i.editReply({ embeds: [embed] });
            }
        }
        const assetId = i.customId.replace(isBuyMarket ? 'buy_modal_' : 'sell_modal_', '');
        const item = sql.prepare("SELECT * FROM market_items WHERE id = ?").get(assetId);
        if (!item) return await i.editReply({ content: '❌ الأصل غير موجود.' });
        if (item.currentPrice == null || isNaN(item.currentPrice) || item.currentPrice <= 0) {
            return await i.editReply({ content: '❌ سعر الأصل غير صالح حالياً.' });
        }
        const getPortfolio = sql.prepare("SELECT * FROM user_portfolio WHERE userID = ? AND guildID = ? AND itemID = ?");
        const updatePortfolioQty = sql.prepare("UPDATE user_portfolio SET quantity = ? WHERE id = ?");
        const insertPortfolio = sql.prepare("INSERT INTO user_portfolio (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?)");
        const deletePortfolio = sql.prepare("DELETE FROM user_portfolio WHERE guildID = ? AND userID = ? AND itemID = ?");
        if (isBuyMarket) {
            const totalCost = Math.floor(item.currentPrice * quantity);
            if (userMora < totalCost) {
                return await i.editReply({ content: `❌ رصيدك غير كافي! تحتاج: **${totalCost.toLocaleString()}** ${EMOJI_MORA}` });
            }
            userData.mora -= totalCost;
            userData.shop_purchases = (userData.shop_purchases || 0) + 1;
            client.setLevel.run(userData);
            let portfolioItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
            if (portfolioItem) {
                sql.prepare("UPDATE user_portfolio SET quantity = quantity + ? WHERE id = ?").run(quantity, portfolioItem.id);
            } else {
                insertPortfolio.run(i.guild.id, i.user.id, item.id, quantity);
            }
            const embed = new EmbedBuilder().setTitle('✅ تمت عملية الشراء').setColor(Colors.Green).setDescription(`📦 **${quantity.toLocaleString()}** × ${item.name}\n💵 التكلفة: **${totalCost.toLocaleString()}** ${EMOJI_MORA}\n💰 الرصيد المتبقي: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            await i.editReply({ embeds: [embed] });
        } else if (isSellMarket) {
            let portfolioItem = getPortfolio.get(i.user.id, i.guild.id, item.id);
            const userQuantity = portfolioItem ? portfolioItem.quantity : 0;
            if (userQuantity < quantity) {
                return await i.editReply({ content: `❌ لا تملك هذه الكمية للبيع. تملك: **${userQuantity.toLocaleString()}**` });
            }
            const totalGain = Math.floor(item.currentPrice * quantity);
            userData.mora += totalGain;
            client.setLevel.run(userData);
            const newPortfolioQuantity = userQuantity - quantity;
            if (newPortfolioQuantity > 0) {
                updatePortfolioQty.run(newPortfolioQuantity, portfolioItem.id);
            } else {
                deletePortfolio.run(i.guild.id, i.user.id, item.id);
            }
            const embed = new EmbedBuilder().setTitle('✅ تمت عملية البيع').setColor(Colors.Green).setDescription(`📦 **${quantity.toLocaleString()}** × ${item.name}\n💵 الأرباح: **${totalGain.toLocaleString()}** ${EMOJI_MORA}\n💰 الرصيد الجديد: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`).setAuthor({ name: i.user.username, iconURL: i.user.displayAvatarURL() });
            await i.editReply({ embeds: [embed] });
        }
    } catch (error) {
        console.error("خطأ في معالج المودال:", error);
        if (i.replied || i.deferred) {
            await i.editReply({ content: '❌ حدث خطأ داخلي أثناء معالجة الطلب.' });
        }
    }
}
async function _handleXpExchangeModal(i, client, sql) {
    try {
        await i.deferReply({ flags: MessageFlags.Ephemeral });

        const userId = i.user.id;
        const guildId = i.guild.id;

        const userLoan = sql.prepare("SELECT 1 FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0").get(userId, guildId);
        if (userLoan) {
            return await i.editReply({ 
                content: `❌ لا يمكنك تبديل الخبرة أثناء وجود قرض عليك. قم بسداد قرضك أولاً.`
            });
        }

        let userData = client.getLevel.get(userId, guildId);
        if (!userData) {
            userData = { ...client.defaultData, user: userId, guild: guildId };
        }

        const userMora = userData.mora || 0;
        const amountString = i.fields.getTextInputValue('xp_amount_input').trim().toLowerCase();
        let amountToBuy = 0;

        if (amountString === 'all' || amountString === 'كامل') {
            if (userMora < XP_EXCHANGE_RATE) {
                return await i.editReply({ content: '❌ ليس لديك مورا كافية لشراء أي خبرة.' });
            }
            amountToBuy = Math.floor(userMora / XP_EXCHANGE_RATE);
        } else {
            amountToBuy = parseInt(amountString.replace(/,/g, ''));
            if (isNaN(amountToBuy) || amountToBuy <= 0) {
                return await i.editReply({ content: '❌ الرجاء إدخال رقم صحيح موجب أو "all".' });
            }
        }

        const totalCost = amountToBuy * XP_EXCHANGE_RATE;
        if (userMora < totalCost) {
            return await i.editReply({ content: `❌ رصيدك غير كافي! لشراء **${amountToBuy.toLocaleString()} XP** تحتاج إلى **${totalCost.toLocaleString()}** مورا. (رصيدك: ${userMora.toLocaleString()})` });
        }

        userData.mora -= totalCost;
        userData.xp += amountToBuy;
        userData.totalXP += amountToBuy;

        let nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
        let levelUpOccurred = false;
        let finalLevel = userData.level;

        while (userData.xp >= nextXP) {
            const oldLevel = userData.level;
            userData.level++;
            userData.xp -= nextXP;
            nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
            levelUpOccurred = true;
            finalLevel = userData.level;

            await sendLevelUpMessage(i, i.member, finalLevel, oldLevel, userData, sql);
        }

        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);

        let replyMessage = `✅ تم شراء **${amountToBuy.toLocaleString()} XP** مقابل **${totalCost.toLocaleString()}** مورا.\n` +
                            `💰 رصيدك الحالي: ${userData.mora.toLocaleString()} \n` +
                            `📈 خبرتك الجديدة: ${userData.xp.toLocaleString()} / ${nextXP.toLocaleString()} XP.`;

        if (levelUpOccurred) {
             replyMessage += `\n🎉 **ووصلت إلى المستوى ${finalLevel}!**`;
        }

        await i.editReply({ content: replyMessage });

    } catch (error) {
        console.error("خطأ في مودال شراء الخبرة:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ أثناء عملية التبادل.', flags: MessageFlags.Ephemeral });
        }
    }
}


async function handleShopSelectMenu(i, client, sql) {
    try {
        const selectedItemId = i.values[0];

        if (selectedItemId === 'upgrade_weapon') {
            await i.deferReply({ ephemeral: true });
            const userRace = getUserRace(i.member, sql);

            if (!userRace) {
                return await i.editReply({ content: '❌ يجب أن تمتلك رتبة عرق أولاً لتتمكن من شراء أو تطوير سلاحك.' });
            }

            const weaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
            if (!weaponConfig) {
                return await i.editReply({ content: '❌ لم يتم العثور على بيانات سلاح لهذا العرق.' });
            }

            let userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(i.user.id, i.guild.id, userRace.raceName);
            let currentLevel = userWeapon ? userWeapon.weaponLevel : 0;
            let currentDamage = (currentLevel === 0) ? 0 : weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));

            const embed = new EmbedBuilder()
                .setTitle(`${weaponConfig.emoji} سلاح العرق: ${weaponConfig.name}`)
                .setColor(Colors.Blue)
                .setImage(BANNER_URL)
                .setThumbnail(THUMBNAILS.get('upgrade_weapon'))
                .addFields(
                    { name: "العرق الخاص بك", value: userRace.raceName, inline: true },
                    { name: "المستوى الحالي", value: `Lv. ${currentLevel}`, inline: true },
                    { name: "الضرر الحالي", value: `${currentDamage}  DMG`, inline: true }
                );

            const row = new ActionRowBuilder();

            if (currentLevel >= weaponConfig.max_level) {
                embed.addFields({ name: "التطوير القادم", value: "وصلت للحد الأقصى!", inline: true });
                row.addComponents(new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true));
            } else {
                 const nextLevelPrice = (currentLevel === 0) ? weaponConfig.base_price : weaponConfig.base_price + (weaponConfig.price_increment * currentLevel);
                 const nextDamage = weaponConfig.base_damage + (weaponConfig.damage_increment * currentLevel);
                 const buttonId = (currentLevel === 0) ? `buy_weapon_${userRace.raceName}` : `upgrade_weapon_${userRace.raceName}`;
                 const buttonLabel = (currentLevel === 0) ? `شراء (المستوى 1)` : `تطوير (المستوى ${currentLevel + 1})`;

                 embed.addFields(
                     { name: "المستوى القادم", value: `Lv. ${currentLevel + 1}`, inline: true },
                     { name: "التأثير القادم", value: `${nextDamage} DMG`, inline: true },
                     { name: "تكلفة التطوير", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true }
                );
                 row.addComponents(new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️'));
            }
            return await i.editReply({ embeds: [embed], components: [row] });

        } else if (selectedItemId === 'upgrade_skill') {
            await i.deferReply({ ephemeral: true });

            const allUserSkills = getAllUserAvailableSkills(i.member, sql);
            if (allUserSkills.length === 0) {
                 return await i.editReply({ content: '❌ لم يتم العثور على أي مهارات متاحة لك.' });
            }

            const skillOptions = allUserSkills.map(skill => {
                return new StringSelectMenuOptionBuilder()
                    .setLabel(skill.name)
                    .setDescription(skill.description.substring(0, 100))
                    .setValue(skill.id)
                    .setEmoji(skill.emoji);
            });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('shop_skill_select_menu')
                .setPlaceholder('اختر المهارة لعرض التفاصيل والتطوير...')
                .addOptions(skillOptions);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            return await i.editReply({ content: 'اختر مهارة من القائمة:', components: [row] });
        }

        if (selectedItemId === 'exchange_xp') {
            const userLoan = sql.prepare("SELECT 1 FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0").get(i.user.id, i.guild.id);
            if (userLoan) {
                return await i.reply({ 
                    content: `❌ لا يمكنك تبديل الخبرة أثناء وجود قرض عليك. قم بسداد قرضك أولاً.`,
                    flags: MessageFlags.Ephemeral 
                });
            }

            const exchangeButton = new ButtonBuilder().setCustomId('open_xp_modal').setLabel('بدء تبادل الخبرة').setStyle(ButtonStyle.Primary).setEmoji('🪙');
            const embed = new EmbedBuilder()
                .setTitle(`🪙 تبديل الخبرة`)
                .setDescription(`هنا يمكنك تحويل المورا إلى خبرة.\n**السعر: ${XP_EXCHANGE_RATE} مورا = 1 إكس بي**`)
                .setColor(Colors.Blue)
                .setImage(BANNER_URL)
                .setThumbnail(THUMBNAILS.get('exchange_xp'));

            return await i.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(exchangeButton)], flags: MessageFlags.Ephemeral });
        }

        const buyableItems = getBuyableItems();
        const item = buyableItems.find(it => it.id === selectedItemId);

        if (item) {
            const paginationEmbed = buildPaginatedItemEmbed(selectedItemId);
            if (paginationEmbed) {
                return await i.reply({ ...paginationEmbed, flags: MessageFlags.Ephemeral });
            }
        }

        return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error("خطأ في قائمة المتجر:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        }
    }
}

async function handleSkillSelectMenu(i, client, sql) {
    try {
        await i.deferUpdate(); 
        const skillId = i.values[0];

        const allUserSkills = getAllUserAvailableSkills(i.member, sql);
        const skillIndex = allUserSkills.findIndex(s => s.id === skillId);

        if (skillIndex === -1) {
             return await i.editReply({ content: "خطأ: لم يتم العثور على المهارة." });
        }

        const paginationEmbed = buildSkillEmbedWithPagination(allUserSkills, skillIndex, sql, i);

        await i.editReply({ content: null, ...paginationEmbed });

    } catch (error) {
        console.error("خطأ في قائمة اختيار المهارة:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        }
    }
}


async function handleShopInteractions(i, client, sql) {

    if (i.customId.startsWith('shop_paginate_item_')) {
        try {
            await i.deferUpdate();
            const selectedItemId = i.customId.replace('shop_paginate_item_', '');
            const paginationEmbed = buildPaginatedItemEmbed(selectedItemId);
            if (paginationEmbed) {
                await i.editReply(paginationEmbed);
            }
        } catch (error) { console.error("خطأ في تقليب العناصر:", error); }
        return;
    }

    if (i.customId.startsWith('shop_skill_paginate_')) {
        try {
            await i.deferUpdate();
            const pageIndex = i.customId.replace('shop_skill_paginate_', '');
            const allUserSkills = getAllUserAvailableSkills(i.member, sql);
            const paginationEmbed = buildSkillEmbedWithPagination(allUserSkills, pageIndex, sql, i);
            if (paginationEmbed) {
                await i.editReply(paginationEmbed);
            }
        } catch (error) { console.error("خطأ في تقليب المهارات:", error); }
        return;
    }

    if (i.customId === 'open_xp_modal') {
        const userLoan = sql.prepare("SELECT 1 FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0").get(i.user.id, i.guild.id);
        if (userLoan) {
            return await i.reply({ 
                content: `لا يمـكن اجراء عملية شراء الخبرة عـليـك قـرض قـم بـسداده اولا <:stop:1436337453098340442>`,
                flags: MessageFlags.Ephemeral 
            });
        }

        const xpModal = new ModalBuilder().setCustomId('exchange_xp_modal').setTitle('شراء خبرة (XP)');
        const amountInput = new TextInputBuilder().setCustomId('xp_amount_input').setLabel(`كم XP تريد شراء؟ (${XP_EXCHANGE_RATE} مورا = 1 XP)`).setPlaceholder('اكتب رقماً أو "all" لتبديل كل المورا').setStyle(TextInputStyle.Short).setRequired(true);
        xpModal.addComponents(new ActionRowBuilder().addComponents(amountInput));
        await i.showModal(xpModal);
        return;
    }

    if (i.customId === 'cancel_purchase') {
        await i.deferUpdate();
        await i.editReply({ content: '👍 تم إلغاء العملية.', components: [], embeds: [] });
        return;
    }

    if (i.customId.startsWith('buy_weapon_') || i.customId.startsWith('upgrade_weapon_')) {
        await _handleWeaponUpgrade(i, client, sql);
        return;
    }

    if (i.customId.startsWith('buy_skill_') || i.customId.startsWith('upgrade_skill_')) {
        await _handleSkillUpgrade(i, client, sql);
        return;
    }

    if (i.customId.startsWith('buy_item_')) {
        await _handleShopButton(i, client, sql);
    } else if (i.customId.startsWith('replace_buff_')) {
        await _handleReplaceBuffButton(i, client, sql);
    }
}

async function _handleSkillUpgrade(i, client, sql) {
    try {
        await i.deferUpdate();
        const userId = i.user.id;
        const guildId = i.guild.id;
        const isBuy = i.customId.startsWith('buy_skill_');
        const skillId = i.customId.replace(isBuy ? 'buy_skill_' : 'upgrade_skill_', '');

        const skillConfig = skillsConfig.find(s => s.id === skillId);
        if (!skillConfig) {
            return await i.followUp({ content: '❌ خطأ: لم يتم العثور على بيانات هذه المهارة.', ephemeral: true });
        }

        let userData = client.getLevel.get(userId, guildId);
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };

        let userSkill = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillID = ?").get(userId, guildId, skillId);
        let currentLevel = userSkill ? userSkill.skillLevel : 0;
        let price = 0;

        if (currentLevel >= skillConfig.max_level) {
            return await i.followUp({ content: '❌ لقد وصلت للحد الأقصى للتطوير بالفعل!', ephemeral: true });
        }

        price = (currentLevel === 0) ? skillConfig.base_price : skillConfig.base_price + (skillConfig.price_increment * currentLevel);

        if (userData.mora < price) {
            return await i.followUp({ content: `❌ رصيدك غير كافي! تحتاج إلى **${price.toLocaleString()}** ${EMOJI_MORA}`, ephemeral: true });
        }

        userData.mora -= price;
        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);

        const newLevel = currentLevel + 1;
        if (isBuy) {
            sql.prepare("INSERT INTO user_skills (userID, guildID, skillID, skillLevel) VALUES (?, ?, ?, ?)")
               .run(userId, guildId, skillId, newLevel);
        } else {
            sql.prepare("UPDATE user_skills SET skillLevel = ? WHERE id = ?")
               .run(newLevel, userSkill.id);
        }

        const allUserSkills = getAllUserAvailableSkills(i.member, sql);
        const currentPageIndex = allUserSkills.findIndex(s => s.id === skillId);

        const updatedEmbed = buildSkillEmbedWithPagination(allUserSkills, currentPageIndex, sql, i);

        await i.editReply(updatedEmbed);
        await i.followUp({ content: `🎉 تم التطوير بنجاح إلى المستوى ${newLevel}!`, flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error("خطأ في زر تطوير المهارة:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        }
    }
}

async function _handleWeaponUpgrade(i, client, sql) {
    try {
        await i.deferUpdate();
        const userId = i.user.id;
        const guildId = i.guild.id;
        const isBuy = i.customId.startsWith('buy_weapon_');
        const raceName = i.customId.replace(isBuy ? 'buy_weapon_' : 'upgrade_weapon_', '');

        const weaponConfig = weaponsConfig.find(w => w.race === raceName);
        if (!weaponConfig) {
            return await i.followUp({ content: '❌ خطأ: لم يتم العثور على بيانات هذا السلاح.', ephemeral: true });
        }

        let userData = client.getLevel.get(userId, guildId);
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };

        let userWeapon = sql.prepare("SELECT * FROM user_weapons WHERE userID = ? AND guildID = ? AND raceName = ?").get(userId, guildId, raceName);
        let currentLevel = userWeapon ? userWeapon.weaponLevel : 0;
        let price = 0;

        if (currentLevel >= weaponConfig.max_level) {
            return await i.followUp({ content: '❌ لقد وصلت للحد الأقصى للتطوير بالفعل!', ephemeral: true });
        }

        price = (currentLevel === 0) ? weaponConfig.base_price : weaponConfig.base_price + (weaponConfig.price_increment * currentLevel);

        if (userData.mora < price) {
             return await i.followUp({ content: `❌ رصيدك غير كافي! تحتاج إلى **${price.toLocaleString()}** ${EMOJI_MORA}`, ephemeral: true });
        }

        userData.mora -= price;
        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);

        const newLevel = currentLevel + 1;
        if (isBuy) {
            sql.prepare("INSERT INTO user_weapons (userID, guildID, raceName, weaponLevel) VALUES (?, ?, ?, ?)")
               .run(userId, guildId, raceName, newLevel);
        } else {
            sql.prepare("UPDATE user_weapons SET weaponLevel = ? WHERE id = ?")
               .run(newLevel, userWeapon.id);
        }

        const newDamage = weaponConfig.base_damage + (weaponConfig.damage_increment * (newLevel - 1));
        const embed = new EmbedBuilder()
            .setTitle(`${weaponConfig.emoji} سلاح العرق: ${weaponConfig.name}`)
            .setColor(Colors.Blue)
            .setImage(BANNER_URL)
            .setThumbnail(THUMBNAILS.get('upgrade_weapon'))
            .addFields(
                { name: "العرق الخاص بك", value: raceName, inline: true },
                { name: "المستوى الحالي", value: `Lv. ${newLevel}`, inline: true },
                { name: "الضرر الحالي", value: `${newDamage}  DMG`, inline: true }
            );

        const row = new ActionRowBuilder();

        if (newLevel >= weaponConfig.max_level) {
            embed.addFields({ name: "التطوير القادم", value: "وصلت للحد الأقصى!", inline: true });
            row.addComponents(new ButtonBuilder().setCustomId('max_level').setLabel('الحد الأقصى').setStyle(ButtonStyle.Success).setDisabled(true));
        } else {
            const nextLevelPrice = weaponConfig.base_price + (weaponConfig.price_increment * newLevel);
            const nextDamage = newDamage + weaponConfig.damage_increment;
            const buttonId = `upgrade_weapon_${raceName}`;
            const buttonLabel = `تطوير (المستوى ${newLevel + 1})`;

            embed.addFields(
                { name: "المستوى القادم", value: `Lv. ${newLevel + 1}`, inline: true },
                { name: "التأثير القادم", value: `${nextDamage} DMG`, inline: true },
                { name: "تكلفة التطوير", value: `${nextLevelPrice.toLocaleString()} ${EMOJI_MORA}`, inline: true }
            );
            row.addComponents(new ButtonBuilder().setCustomId(buttonId).setLabel(buttonLabel).setStyle(ButtonStyle.Success).setEmoji('⬆️'));
        }

        await i.editReply({ embeds: [embed], components: [row] });
        await i.followUp({ content: `🎉 تم التطوير بنجاح إلى المستوى ${newLevel}!`, flags: MessageFlags.Ephemeral });

    } catch (error) {
        console.error("خطأ في زر تطوير السلاح:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        }
    }
}

async function _handleShopButton(i, client, sql) {
    try {
        const userId = i.user.id;
        const guildId = i.guild.id;
        const boughtItemId = i.customId.replace('buy_item_', '');
        const item = shopItems.find(it => it.id === boughtItemId);

        if (!item) {
            return await i.reply({ content: '❌ هذا العنصر غير موجود!', flags: MessageFlags.Ephemeral });
        }

        let userData = client.getLevel.get(userId, guildId);
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };

        if (userData.mora < item.price) {
            return await i.reply({ content: `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`, flags: MessageFlags.Ephemeral });
        }

        if (item.id.startsWith('xp_buff_')) {
            const getActiveBuff = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'xp' AND expiresAt > ?");
            const activeBuff = getActiveBuff.get(userId, guildId, Date.now());

            if (activeBuff) {
                const replaceButton = new ButtonBuilder().setCustomId(`replace_buff_${item.id}`).setLabel("إلغاء القديم وشراء الجديد").setStyle(ButtonStyle.Danger);
                const cancelButton = new ButtonBuilder().setCustomId('cancel_purchase').setLabel("إلغاء").setStyle(ButtonStyle.Secondary);
                const row = new ActionRowBuilder().addComponents(replaceButton, cancelButton);
                return await i.reply({ content: `⚠️ لديك معزز خبرة فعال بالفعل! هل تريد إلغاءه وشراء هذا المعزز الجديد؟`, components: [row], embeds: [], flags: MessageFlags.Ephemeral });
            }
        }

        const RESTRICTED_ITEMS = ['nitro_basic', 'nitro_gaming', 'discord_effect_5', 'discord_effect_10'];
        if (RESTRICTED_ITEMS.includes(item.id)) {
            const userLoan = sql.prepare("SELECT 1 FROM user_loans WHERE userID = ? AND guildID = ? AND remainingAmount > 0").get(userId, guildId);
            if (userLoan) {
                return await i.reply({ 
                    content: `عـليـك قـرض قـم بـسداده اولا <:stop:1436337453098340442>`, 
                    flags: MessageFlags.Ephemeral 
                });
            }
        }

        userData.mora -= item.price;
        let successMessage = `✅ تم شراء **${item.name}** بنجاح!`;

        switch (item.id) {
            case 'personal_guard_1d':
                userData.hasGuard = (userData.hasGuard || 0) + 3;
                userData.guardExpires = 0;
                successMessage = `✅ تم توقيع عقد الحراسة **${item.name}**!<:thief:1436331309961187488> سيحميـك الحـارس من 3 عمليات سرقـة`;
                break;
            case 'streak_shield': {
                const setStreak = sql.prepare("INSERT OR REPLACE INTO streaks (id, guildID, userID, streakCount, lastMessageTimestamp, hasGracePeriod, hasItemShield, nicknameActive, hasReceivedFreeShield, separator, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMessageTimestamp, @hasGracePeriod, @hasItemShield, @nicknameActive, @hasReceivedFreeShield, @separator, @dmNotify, @highestStreak);");
                const existingStreak = sql.prepare("SELECT * FROM streaks WHERE userID = ? AND guildID = ?").get(userId, guildId);
                if (existingStreak && existingStreak.hasItemShield === 1) {
                    userData.mora += item.price; 
                    return await i.reply({ content: '🔥 لديك درع ستريك جاهز بالفعل!', flags: MessageFlags.Ephemeral });
                }
                const fullStreakData = { id: existingStreak?.id || `${guildId}-${userId}`, guildID: guildId, userID: userId, streakCount: existingStreak?.streakCount || 0, lastMessageTimestamp: existingStreak?.lastMessageTimestamp || 0, hasGracePeriod: existingStreak?.hasGracePeriod || 0, hasItemShield: 1, nicknameActive: existingStreak?.nicknameActive ?? 1, hasReceivedFreeShield: existingStreak?.hasReceivedFreeShield || 0, separator: existingStreak?.separator || '|', dmNotify: existingStreak?.dmNotify ?? 1, highestStreak: existingStreak?.highestStreak || 0 };
                setStreak.run(fullStreakData);
                break;
            }
            case 'streak_shield_media': {
                const setMediaStreak = sql.prepare("INSERT OR REPLACE INTO media_streaks (id, guildID, userID, streakCount, lastMediaTimestamp, hasGracePeriod, hasItemShield, hasReceivedFreeShield, dmNotify, highestStreak) VALUES (@id, @guildID, @userID, @streakCount, @lastMediaTimestamp, @hasGracePeriod, @hasItemShield, @hasReceivedFreeShield, @dmNotify, @highestStreak);");
                const existingMediaStreak = sql.prepare("SELECT * FROM media_streaks WHERE userID = ? AND guildID = ?").get(userId, guildId);
                if (existingMediaStreak && existingMediaStreak.hasItemShield === 1) {
                    userData.mora += item.price; 
                    return await i.reply({ content: '📸 لديك درع ستريك ميديا جاهز بالفعل!', flags: MessageFlags.Ephemeral });
                }
                const fullMediaStreakData = { 
                    id: existingMediaStreak?.id || `${guildId}-${userId}`, 
                    guildID: guildId, 
                    userID: userId, 
                    streakCount: existingMediaStreak?.streakCount || 0, 
                    lastMediaTimestamp: existingMediaStreak?.lastMediaTimestamp || 0, 
                    hasGracePeriod: existingMediaStreak?.hasGracePeriod || 0, 
                    hasItemShield: 1,
                    hasReceivedFreeShield: existingMediaStreak?.hasReceivedFreeShield || 0, 
                    dmNotify: existingMediaStreak?.dmNotify ?? 1, 
                    highestStreak: existingMediaStreak?.highestStreak || 0 
                };
                setMediaStreak.run(fullMediaStreakData);
                break;
            }
            case 'xp_buff_1d_3':
                sql.prepare("INSERT INTO user_buffs (userID, guildID, buffType, multiplier, expiresAt, buffPercent) VALUES (?, ?, ?, ?, ?, ?)")
                   .run(userId, guildId, 'xp', 0.03, Date.now() + (24 * 60 * 60 * 1000), 3);
                break;
            case 'xp_buff_1d_7':
                sql.prepare("INSERT INTO user_buffs (userID, guildID, buffType, multiplier, expiresAt, buffPercent) VALUES (?, ?, ?, ?, ?, ?)")
                   .run(userId, guildId, 'xp', 0.07, Date.now() + (24 * 60 * 60 * 1000), 7);
                break;
            case 'xp_buff_2d_10':
                 sql.prepare("INSERT INTO user_buffs (userID, guildID, buffType, multiplier, expiresAt, buffPercent) VALUES (?, ?, ?, ?, ?, ?)")
                   .run(userId, guildId, 'xp', 0.10, Date.now() + (2 * 24 * 60 * 60 * 1000), 10);
                break;
            case 'vip_role_3d':
                const settings = sql.prepare("SELECT vipRoleID FROM settings WHERE guild = ?").get(guildId);
                const VIP_ROLE_ID = settings ? settings.vipRoleID : null;

                if (!VIP_ROLE_ID) {
                    userData.mora += item.price; 
                    return await i.reply({ content: '❌ لم يقم أي إداري بتحديد رتبة الـ VIP لهذا السيرفر بعد! لن تتم عملية الشراء.', flags: MessageFlags.Ephemeral });
                }

                const member = await i.guild.members.fetch(userId);
                await member.roles.add(VIP_ROLE_ID);
                const expiresAt = Date.now() + (3 * 24 * 60 * 60 * 1000);
                sql.prepare("INSERT OR REPLACE INTO temporary_roles (userID, guildID, roleID, expiresAt) VALUES (?, ?, ?, ?)")
                   .run(userId, guildId, VIP_ROLE_ID, expiresAt);
                successMessage = `✅ تم شراء **${item.name}**! تم منحك الرتبة, توجه لـ انشاء الرتب لانشاء رتبتك الخاصة <a:Danceowo:1435658634750201876>`;
                break;
            case 'discord_effect_5':
            case 'discord_effect_10':
            case 'nitro_basic':
            case 'nitro_gaming':
                const owner = await client.users.fetch(OWNER_ID);
                if (owner) {
                    owner.send(`🔔 تنبيه شراء!\n\nالعضو: ${i.user.tag} (${i.user.id})\nاشترى: **${item.name}**\nالمبلغ: ${item.price.toLocaleString()} ${EMOJI_MORA}`).catch(console.error);
                }
                successMessage = `✅ تمت عملية الشراء! فضلاً، قم بفتح "مجلس خاص" (تكت) لاستلام طلبك.`;
                break;

            case 'change_race': {
                let removedRoleName = "لا يوجد";
                try {
                    const allRaceRoles = sql.prepare("SELECT roleID, raceName FROM race_roles WHERE guildID = ?").all(i.guild.id);
                    const raceRoleIDs = allRaceRoles.map(r => r.roleID);
                    const userRaceRole = i.member.roles.cache.find(r => raceRoleIDs.includes(r.id));

                    if (userRaceRole) {
                        await i.member.roles.remove(userRaceRole);
                        removedRoleName = userRaceRole.name;
                    }
                } catch (err) {
                    console.error("[Shop Change Race] Failed to remove race role:", err);
                }

                const durationMs = (item.duration || 7) * 24 * 60 * 60 * 1000;
                const expiresAt = Date.now() + durationMs;

                const debuffPercent = -5;
                const debuffMultiplier = -0.05; 

                try {
                    sql.prepare(
                        "INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)"
                    ).run(i.guild.id, i.user.id, debuffPercent, expiresAt, 'xp', debuffMultiplier);

                    sql.prepare(
                        "INSERT INTO user_buffs (guildID, userID, buffPercent, expiresAt, buffType, multiplier) VALUES (?, ?, ?, ?, ?, ?)"
                    ).run(i.guild.id, i.user.id, debuffPercent, expiresAt, 'mora', debuffMultiplier);

                } catch (dbErr) {
                     console.error("[Shop Change Race] Failed to insert debuffs:", dbErr);
                }

                successMessage = `🧬 **تم تغيير العرق (مع نيرف)!**\n` +
                                 `تمت إزالة رتبة العرق السابقة: **${removedRoleName}**.\n` +
                                 `**تحذير:** تم تطبيق تخفيض **${debuffPercent}%** (XP/Mora) لمدة 7 أيام.`;
                break;
            }
        }

        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);

        await i.reply({ content: `${successMessage}\nرصيدك المتبقي: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`, components: [], embeds: [], flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error("خطأ في زر المتجر:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        } else {
             await i.reply({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        }
    }
}

async function _handleReplaceBuffButton(i, client, sql) {
    try {
        await i.deferUpdate();
        const userId = i.user.id;
        const guildId = i.guild.id;
        const newItemId = i.customId.replace('replace_buff_', '');
        const item = shopItems.find(it => it.id === newItemId);

        if (!item) {
            return await i.editReply({ content: '❌ هذا العنصر غير موجود!', components: [], embeds: [] });
        }

        let userData = client.getLevel.get(userId, guildId);
        if (!userData) userData = { ...client.defaultData, user: userId, guild: guildId };

        if (userData.mora < item.price) {
            return await i.editReply({ content: `❌ رصيدك غير كافي! تحتاج إلى **${item.price.toLocaleString()}** ${EMOJI_MORA}`, components: [], embeds: [] });
        }

        userData.mora -= item.price;
        sql.prepare("DELETE FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'xp'").run(userId, guildId);

        let expiresAt, multiplier, buffPercent;
        switch (item.id) {
            case 'xp_buff_1d_3':
                multiplier = 0.03; buffPercent = 3; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
            case 'xp_buff_1d_7':
                multiplier = 0.07; buffPercent = 7; expiresAt = Date.now() + (24 * 60 * 60 * 1000); break;
            case 'xp_buff_2d_10':
                multiplier = 0.10; buffPercent = 10; expiresAt = Date.now() + (2 * 24 * 60 * 60 * 1000); break;
        }
        sql.prepare("INSERT INTO user_buffs (userID, guildID, buffType, multiplier, expiresAt, buffPercent) VALUES (?, ?, ?, ?, ?, ?)")
           .run(userId, guildId, 'xp', multiplier, expiresAt, buffPercent);

        userData.shop_purchases = (userData.shop_purchases || 0) + 1;
        client.setLevel.run(userData);

        await i.editReply({ content: `✅ تم إلغاء معززك القديم وشراء **${item.name}** بنجاح!\nرصيدك المتبقي: **${userData.mora.toLocaleString()}** ${EMOJI_MORA}`, components: [], embeds: [] });

    } catch (error) {
         console.error("خطأ في زر استبدال المعزز:", error);
        if (i.replied || i.deferred) {
            await i.followUp({ content: '❌ حدث خطأ.', flags: MessageFlags.Ephemeral });
        }
    }
}


module.exports = {
    handleShopModal,
    handleShopSelectMenu,
    handleShopInteractions,
    handleSkillSelectMenu
};