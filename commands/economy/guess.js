const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, Colors, SlashCommandBuilder, Collection } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');
const EMOJI_MORA = '<:mora:1435647151349698621>';

const MIN_BET = 25;
const MAX_BET = 100;
const MAX_PLAYERS = 5;
const SOLO_ATTEMPTS = 7;
const COOLDOWN_MS = 1 * 60 * 60 * 1000;

const activeGames = new Set();

function formatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');

    if (hours > 0) {
        return `${hh}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('تخمين')
        .setDescription('تحدي البوت (فردي) أو أصدقائك (جماعي) في لعبة تخمين الرقم.')
        .addIntegerOption(option =>
            option.setName('الرهان')
                .setDescription(`المبلغ الذي تريد المراهنة به (بين ${MIN_BET} و ${MAX_BET})`)
                .setRequired(true)
                .setMinValue(MIN_BET)
                .setMaxValue(MAX_BET))
        .addUserOption(option => option.setName('الخصم1').setDescription('الخصم الأول (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم2').setDescription('الخصم الثاني (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم3').setDescription('الخصم الثالث (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم4').setDescription('الخصم الرابع (لعبة جماعية)').setRequired(false))
        .addUserOption(option => option.setName('الخصم5').setDescription('الخصم الخامس (لعبة جماعية)').setRequired(false)),

    name: 'guess',
    aliases: ['خمن', 'g', 'تخمين'],
    category: "Economy",
    description: `تحدي البوت (فردي) أو تحدي أصدقائك (جماعي) في لعبة تخمين الرقم.`,

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, author, client, guild, sql, channel, channelId;
        let bet, opponents = new Collection();

        try {
            if (isSlash) {
                interaction = interactionOrMessage;
                author = interaction.member;
                client = interaction.client;
                guild = interaction.guild;
                sql = client.sql;
                channel = interaction.channel;
                channelId = interaction.channel.id;

                bet = interaction.options.getInteger('الرهان');

                for (let i = 1; i <= MAX_PLAYERS; i++) {
                    const user = interaction.options.getUser(`الخصم${i}`);
                    if (user) {
                        const member = await guild.members.fetch(user.id).catch(() => null);
                        if (member) {
                            opponents.set(member.id, member);
                        }
                    }
                }
                await interaction.deferReply();

            } else {
                message = interactionOrMessage;
                author = message.member;
                client = message.client;
                guild = message.guild;
                sql = client.sql;
                channel = message.channel;
                channelId = message.channel.id;

                bet = parseInt(args[0]);
                opponents = message.mentions.members;
            }

            const reply = async (payload) => {
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.channel.send(payload);
                }
            };

            const replyError = async (content) => {
                const payload = { content, ephemeral: true };
                if (isSlash) {
                    return interaction.editReply(payload);
                } else {
                    return message.reply(payload);
                }
            };

            if (activeGames.has(channelId)) {
                return replyError("هناك لعبة نشطة بالفعل في هذه القناة!");
            }

            if (isNaN(bet)) {
                return replyError(`الاستخدام: \`/تخمين الرهان: <المبلغ> [الخصوم...]\``);
            }
            if (bet < MIN_BET) {
                return replyError(`الحد الأدنى للرهان هو **${MIN_BET}** ${EMOJI_MORA} !`);
            }
            if (bet > MAX_BET) {
                return replyError(`الحد الأقصى للرهان هو **${MAX_BET}** ${EMOJI_MORA} !`);
            }

            const getScore = client.getLevel;
            const setScore = client.setLevel;
            let authorData = getScore.get(author.id, guild.id);

            if (!authorData) {
                authorData = { ...client.defaultData, user: author.id, guild: guild.id };
            }

            const now = Date.now();
            const timeLeft = (authorData.lastGuess || 0) + COOLDOWN_MS - now;

            if (timeLeft > 0) {
                const timeString = formatTime(timeLeft);
                return replyError(`🕐 يمكنك لعب تخمين الرقم مرة واحدة كل ساعة. يرجى الانتظار **\`${timeString}\`**.`);
            }

            if (!authorData || authorData.mora < bet) {
                return replyError(`ليس لديك مورا كافية لهذا الرهان! (رصيدك: ${authorData.mora})`);
            }

            activeGames.add(channelId);
            authorData.lastGuess = now;

            if (opponents.size === 0) {
                await playSolo(channel, author, bet, authorData, getScore, setScore, sql, reply);
            } else {
                await playChallenge(channel, author, opponents, bet, authorData, getScore, setScore, sql, reply);
            }

        } catch (error) {
            console.error("Error in guess command:", error);
            const errorPayload = { content: "حدث خطأ أثناء بدء اللعبة.", ephemeral: true };
            if (isSlash) {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(errorPayload);
                } else {
                    await interaction.reply(errorPayload);
                }
            } else {
                message.reply(errorPayload.content);
            }
            activeGames.delete(channelId);
        }
    }
};

async function playSolo(channel, author, bet, authorData, getScore, setScore, sql, replyFunction) {
    const channelId = channel.id;
    const targetNumber = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;

    const startingPrize = bet * 7;
    let currentWinnings = startingPrize;
    const penaltyPerGuess = Math.floor(startingPrize / SOLO_ATTEMPTS);

    const embed = new EmbedBuilder()
        .setTitle('🎲 لعبة التخـمـين )')
        .setDescription(`الرهان: **${bet}** ${EMOJI_MORA}\nالجائزة الحالية: **${currentWinnings}** ${EMOJI_MORA}\nاختر رقماً سريــاً بين 1 و 100.\nلديك **${SOLO_ATTEMPTS}** محاولات.\n\nاكتب تخمينك في الشات!`)
        .setColor("Random")
        .setImage('https://i.postimg.cc/Vs9bp19q/download-3.gif')
        .setFooter({ text: `المحاولات المتبقية: ${SOLO_ATTEMPTS}` });

    await replyFunction({ embeds: [embed] });

    const filter = (m) => m.author.id === author.id;
    const collector = channel.createMessageCollector({ filter, time: 60000, max: SOLO_ATTEMPTS });

    collector.on('collect', (msg) => {
        const guess = parseInt(msg.content);
        if (isNaN(guess)) return;

        attempts++;
        const attemptsLeft = SOLO_ATTEMPTS - attempts;

        if (guess === targetNumber) {
            const moraMultiplier = calculateMoraBuff(author, sql);
            const finalWinnings = Math.floor(currentWinnings * moraMultiplier);

            authorData.mora += finalWinnings;
            setScore.run(authorData);

            let buffString = "";
            const buffPercent = (moraMultiplier - 1) * 100;
            if (buffPercent > 0) {
                buffString = ` (+${buffPercent.toFixed(0)}%)`;
            } else if (buffPercent < 0) {
                buffString = ` (${buffPercent.toFixed(0)}%)`;
            }

            const winEmbed = new EmbedBuilder()
                .setTitle(`✥ الـفـائـز ${author.displayName}!`)
                .setDescription(`✶ نجح في تخمين الرقم الصحيح **${targetNumber}**!\n\nربـح **${finalWinnings.toLocaleString()}** ${EMOJI_MORA}!${buffString}`)
                .setColor("Green")
                .setImage('https://i.postimg.cc/NfMfDwp4/download-2.gif')
                .setThumbnail(author.displayAvatarURL());

            channel.send({ embeds: [winEmbed] });
            collector.stop('win');
        } else if (attemptsLeft > 0) {
            currentWinnings -= penaltyPerGuess;
            if (currentWinnings < 0) currentWinnings = 0;

            const hint = guess > targetNumber ? 'أصغر 🔽' : 'أكبر 🔼';
            const hintEmbed = new EmbedBuilder()
                .setTitle(`محاولة خاطئة...`)
                .setDescription(`الـرقـم  **${hint}** من ${guess}.\nالجائزة المتبقية: **${currentWinnings}** ${EMOJI_MORA}`)
                .setColor("Orange")
                .setFooter({ text: `المحاولات المتبقية: ${attemptsLeft}` });
            channel.send({ embeds: [hintEmbed] });
        } else {
            collector.stop('lose');
        }
    });

    collector.on('end', (collected, reason) => {
        activeGames.delete(channelId);

        if (reason === 'lose' || reason === 'time') {
            authorData.mora -= bet;
            setScore.run(authorData);

            const loseEmbed = new EmbedBuilder()
                .setTitle(reason === 'time' ? '⏰ انتهى الوقت! لقد خسرت...' : '💔 لقد خسرت...')
                .setDescription(
                    reason === 'time' ?
                    `لقد استغرقت وقتاً طويلاً.\nكـان الـرقـم **${targetNumber}**.\n\nخسرت **${bet}** ${EMOJI_MORA}.`
                    :
                    `لقد استهلكت كل محاولاتك.\nكـان الـرقـم **${targetNumber}**.\n\nخسرت **${bet}** ${EMOJI_MORA}.`
                )
                .setColor("Red")
                .setImage('https://i.postimg.cc/SNsNdpgq/download.jpg');
            channel.send({ embeds: [loseEmbed] });
        }
    });
}

async function playChallenge(channel, author, opponents, bet, authorData, getScore, setScore, sql, replyFunction) {
    const channelId = channel.id;

    if (opponents.size > MAX_PLAYERS) {
        activeGames.delete(channelId);
        return replyFunction({ content: `لا يمكنك تحدي أكثر من ${MAX_PLAYERS} لاعبين في نفس الوقت.`, ephemeral: true });
    }

    const opponentNames = opponents.map(o => o.displayName).join(', ');
    const requiredOpponents = opponents.map(o => o.id);

    for (const opponent of opponents.values()) {
        if (opponent.id === author.id) {
            activeGames.delete(channelId);
            return replyFunction({ content: "لا يمكنك تحدي نفسك!", ephemeral: true });
        }
        let opponentData = getScore.get(opponent.id, channel.guild.id);
        if (!opponentData || opponentData.mora < bet) {
            activeGames.delete(channelId);
            return replyFunction({ content: `أحد اللاعبين (${opponent.displayName}) لا يملك مورا كافية لهذا الرهان!`, ephemeral: true });
        }
    }

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('guess_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('guess_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
    );

    const totalPot = bet * (opponents.size + 1);

    const description = [
        `✥ قـام ${author}`,
        `✶ بدعـوتـك ${opponents.map(o => o.toString()).join(', ')}`,
        `على سـباق تخـمين الأرقـام!`,
        `مـبـلغ الـرهـان ${bet} ${EMOJI_MORA} (لكل شخص)`,
        `الجائـزة الكـبرى (للفائز فقط): **${totalPot.toLocaleString()}** ${EMOJI_MORA}`
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`🏁 تـحـدي تـخمـين الأرقـام!`)
        .setDescription(description)
        .setColor("Orange")
        .setImage('https://i.postimg.cc/Vs9bp19q/download-3.gif');

    const challengeMsg = await replyFunction({ content: opponents.map(o => o.toString()).join(' '), embeds: [embed], components: [row], fetchReply: true });

    const acceptedOpponents = new Set();
    const challengeCollector = challengeMsg.createMessageComponentCollector({ time: 60000 });

    challengeCollector.on('collect', async i => {
        if (!requiredOpponents.includes(i.user.id)) {
            return i.reply({
                content: `✥ هـاه؟ التحدي مرسل الى ${opponentNames} مو لـك <a:Danceowo:1435658634750201876>`,
                ephemeral: true
            });
        }

        if (i.customId === 'guess_pvp_decline') {
            challengeCollector.stop('decline');
            return i.update({
                content: `✬ رفـض ${i.member.displayName} التـحدي الجبـان خايـف على المـورا الي عنـده <:mirkk:1435648219488190525>`,
                embeds: [],
                components: []
            });
        }

        if (i.customId === 'guess_pvp_accept') {
            acceptedOpponents.add(i.member);
            await i.reply({ content: `✦ تـم قبول التحدي! ننتـظر باقي اللاعبين... <a:HypedDance:1435572391190204447>`, ephemeral: true });
        }
    });

    challengeCollector.on('end', async (collected, reason) => {
        if (reason === 'decline') {
            activeGames.delete(channelId);
            setScore.run(authorData);
            return;
        }

        if (acceptedOpponents.size < 1) {
            activeGames.delete(channelId);
            setScore.run(authorData);
            return challengeMsg.edit({ content: `✶ انتـهـى الـوقـت لـم يقـبل الجـميع التحـدي <:mirkk:1435648219488190525> !`, embeds: [], components: [] });
        }

        const finalPlayers = [author, ...acceptedOpponents.values()];
        const finalPlayerIDs = finalPlayers.map(p => p.id);

        for (const player of finalPlayers) {
            let data = getScore.get(player.id, channel.guild.id);
            if (!data) data = { ...channel.client.defaultData, user: player.id, guild: channel.guild.id };
            data.mora -= bet;
            if (player.id !== author.id) {
                 data.lastGuess = now;
            }
            setScore.run(data);
        }

        const targetNumber = Math.floor(Math.random() * 100) + 1;

        const gameEmbed = new EmbedBuilder()
            .setTitle('🏁 بدأ السباق!')
            .setDescription(`✶ قبـل ${acceptedOpponents.map(p => p.displayName).join(', ')} التـحدي! ابـدأوا التـخمـين!\n\nالرقم السري بين 1 و 100. أول من يخمنه يربح **${totalPot.toLocaleString()}** ${EMOJI_MORA}!\n(لديكم 60 ثانية)`)
            .setColor("Blue")
            .setImage('https://i.postimg.cc/Vs9bp19q/download-3.gif');

        await challengeMsg.edit({ content: finalPlayers.map(p => p.toString()).join(' '), embeds: [gameEmbed], components: [] });

        const filter = (m) => finalPlayerIDs.includes(m.author.id) && !isNaN(parseInt(m.content));
        const gameCollector = channel.createMessageCollector({ filter, time: 60000 });

        gameCollector.on('collect', (msg) => {
            const guess = parseInt(msg.content);
            if (isNaN(guess)) return;

            if (guess === targetNumber) {
                let winnerData = getScore.get(msg.author.id, channel.guild.id);

                const moraMultiplier = calculateMoraBuff(msg.member, sql);
                const bonus = Math.floor(bet * moraMultiplier) - bet;
                const finalWinnings = totalPot + bonus;

                winnerData.mora += finalWinnings;
                setScore.run(winnerData);

                let bonusString = "";
                if (bonus > 0) {
                    bonusString = `\n+ **${bonus}** ${EMOJI_MORA} `;
                } else if (bonus < 0) {
                    bonusString = `\n- **${Math.abs(bonus)}** ${EMOJI_MORA} `;
                }

                const winEmbed = new EmbedBuilder()
                    .setTitle(`✥ الـفـائـز ${msg.member.displayName}!`)
                    .setDescription(`✶ نجح ${msg.member} في تخمين الرقم الصحيح **${targetNumber}**!\n\nربـح الجائـزة الكـبرى **${totalPot.toLocaleString()}** ${EMOJI_MORA}!${bonusString}`)
                    .setColor("Green")
                    .setImage('https://i.postimg.cc/NfMfDwp4/download-2.gif')
                    .setThumbnail(msg.author.displayAvatarURL());

                channel.send({ embeds: [winEmbed] });
                gameCollector.stop('win');

            } else if (guess > targetNumber) {
                channel.send(`**${msg.member.displayName}**: أصغر 🔽!`);
            } else if (guess < targetNumber) {
                channel.send(`**${msg.member.displayName}**: أكبر 🔼!`);
            }
        });

        collector.on('end', (collected, reason) => {
            activeGames.delete(channelId);
            if (reason !== 'win') {
                const loseEmbed = new EmbedBuilder()
                    .setTitle('✥ انتهى الوقت!')
                    .setDescription(`لـم يتمكن أحـد من تخمين الرقم الصحيح (**${targetNumber}**).\n\nتـم إرجـاع **${bet}** ${EMOJI_MORA} إلـى جـميع الـمشاركين.`)
                    .setColor("Red")
                    .setImage('https://i.postimg.cc/SNsNdpgq/download.jpg');

                channel.send({ embeds: [loseEmbed] });

                for (const player of finalPlayers) {
                    let data = getScore.get(player.id, channel.guild.id);
                    data.mora += bet;
                    setScore.run(data);
                }
            }
        });
    });
}