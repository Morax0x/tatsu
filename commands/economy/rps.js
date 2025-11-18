const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, SlashCommandBuilder } = require("discord.js");
const { calculateMoraBuff } = require('../../streak-handler.js');
const MAX_BET = 100;
const COOLDOWN_MS = 1 * 60 * 60 * 1000;

const CHOICES = {
    rock: { name: 'حجرة', emoji: '🪨' },
    paper: { name: 'ورقة', emoji: '📄' },
    scissors: { name: 'مقص', emoji: '✂️' }
};

const getWinner = (choice1, choice2) => {
    if (choice1 === choice2) return 'tie';
    if (
        (choice1 === 'rock' && choice2 === 'scissors') ||
        (choice1 === 'paper' && choice2 === 'rock') ||
        (choice1 === 'scissors' && choice2 === 'paper')
    ) {
        return 'player1';
    }
    return 'player2';
};

function getResultEmbed(title, description, color) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('حجرة')
        .setDescription(`تلعب حجرة ورقة مقص ضد البوت أو لاعب آخر.`)
        .addIntegerOption(option =>
            option.setName('المبلغ')
            .setDescription('مبلغ الرهان')
            .setRequired(true)
            .setMinValue(1))
        .addUserOption(option =>
            option.setName('الخصم')
            .setDescription('اللاعب الذي تريد تحديه (اختياري)')
            .setRequired(false)),

    name: 'rps',
    aliases: ['حجرة', 'rps'],
    category: "Economy",
    description: `تلعب حجرة ورقة مقص ضد البوت أو لاعب آخر (الحد الأقصى ${MAX_BET} ضد البوت).`,

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, author, authorMember;
        let opponent, bet;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            author = interaction.user;
            authorMember = interaction.member;
            bet = interaction.options.getInteger('المبلغ');
            opponent = interaction.options.getMember('الخصم');
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            author = message.author;
            authorMember = message.member;
            opponent = message.mentions.members.first();
            bet = parseInt(args[0]);
        }

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
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

        const sql = client.sql;

        if (isNaN(bet) || bet <= 0) {
            return replyError(`الاستخدام: \`/حجرة <مبلغ الرهان> [@لاعب]\``);
        }

        if (!opponent && bet > MAX_BET) {
            return replyError(`لا يمكنك المراهنة بأكثر من **${MAX_BET}** <:mora:1435647151349698621> ضد البوت!`);
        }

        const getScore = client.getLevel;
        const setScore = client.setLevel;
        let authorData = getScore.get(author.id, guild.id);

        if (!authorData) {
            authorData = { ...client.defaultData, user: author.id, guild: guild.id };
        }

        const now = Date.now();
        const timeLeft = (authorData.lastRPS || 0) + COOLDOWN_MS - now;

        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60000);
            const seconds = Math.floor((timeLeft % 60000) / 1000);
            return replyError(`🕐 يمكنك لعب حجرة ورقة مقص مرة واحدة كل ساعة. يرجى الانتظار **${minutes} دقيقة و ${seconds} ثانية**.`);
        }

        if (!authorData || authorData.mora < bet) {
            return replyError(`ليس لديك مورا كافية لهذا الرهان! (رصيدك: ${authorData.mora})`);
        }

        authorData.lastRPS = now;
        setScore.run(authorData);

        if (!opponent) {
            await playAgainstBot(interactionOrMessage, reply, authorMember, bet, authorData, getScore, setScore, sql);
        } else {
            await playAgainstPlayer(interactionOrMessage, reply, replyError, authorMember, opponent, bet, authorData, getScore, setScore, sql);
        }
    }
};

async function playAgainstBot(interactionOrMessage, reply, authorMember, bet, authorData, getScore, setScore, sql) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_rock').setLabel('🪨 حجرة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_paper').setLabel('📄 ورقة').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rps_scissors').setLabel('✂️ مقص').setStyle(ButtonStyle.Secondary)
    );

    const embed = new EmbedBuilder()
        .setTitle('⚔️ تحدي البوت!')
        .setDescription(`الرهان: **${bet}** <:mora:1435647151349698621>\nاختر سلاحك:`)
        .setColor("Blue");

    const msg = await reply({ embeds: [embed], components: [row] });

    const filter = i => i.user.id === authorMember.id;
    const collector = msg.createMessageComponentCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async i => {
        const userChoiceKey = i.customId.split('_')[1];
        const userChoice = CHOICES[userChoiceKey];
        const botChoiceKey = Object.keys(CHOICES)[Math.floor(Math.random() * 3)];
        const botChoice = CHOICES[botChoiceKey];

        const winner = getWinner(userChoiceKey, botChoiceKey);
        let resultEmbed;

        if (winner === 'tie') {
            const desc = [
                `✶ قـمت بـ اختيـار ${userChoice.emoji}`,
                `✶ قـام البوت بـ اختيـار ${botChoice.emoji}`,
                `\nانتهت اللعبة بالتعادل!`
            ].join('\n');
            resultEmbed = getResultEmbed('✥ تـعـادل!', desc, 'Grey');

        } else if (winner === 'player1') {
            const moraMultiplier = calculateMoraBuff(authorMember, sql);
            const finalAmount = Math.floor(bet * moraMultiplier);

            authorData.mora += finalAmount;
            setScore.run(authorData);
            const desc = [
                `✶ قـمت بـ اختيـار ${userChoice.emoji}`,
                `✶ قـام البوت بـ اختيـار ${botChoice.emoji}`,
                `\nربـحت **${finalAmount}** <:mora:1435647151349698621>!`
            ].join('\n');
            resultEmbed = getResultEmbed(`✥ الـفـائـز ${authorMember.displayName}`, desc, 'Green')
                .setThumbnail(authorMember.user.displayAvatarURL());
        } else {
            authorData.mora -= bet;
            setScore.run(authorData);
            const desc = [
                `✶ قـمت بـ اختيـار ${userChoice.emoji}`,
                `✶ قـام البوت بـ اختيـار ${botChoice.emoji}`,
                `\nخسرت **${bet}** <:mora:1435647151349698621>.`
            ].join('\n');
            resultEmbed = getResultEmbed(`✥ الـفـائـز هو البوت!`, desc, 'Red')
                .setThumbnail(interactionOrMessage.client.user.displayAvatarURL());
        }

        await i.update({ embeds: [resultEmbed], components: [] });
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            msg.edit({ content: 'انتهى الوقت ولم تختر.', components: [] });
        }
    });
}

async function playAgainstPlayer(interactionOrMessage, reply, replyError, authorMember, opponent, bet, authorData, getScore, setScore, sql) {
    if (opponent.id === authorMember.id) return replyError("لا يمكنك تحدي نفسك!");
    if (opponent.user.bot) return replyError("لا يمكنك تحدي بوت!");

    let opponentData = getScore.get(opponent.id, interactionOrMessage.guild.id);
    if (!opponentData || opponentData.mora < bet) {
        return replyError(`خصمك ${opponent.displayName} لا يملك مورا كافية لهذا الرهان!`);
    }
    if (!opponentData) {
        opponentData = { ...interactionOrMessage.client.defaultData, user: opponent.id, guild: interactionOrMessage.guild.id };
    }


    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rps_pvp_accept').setLabel('قبول').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rps_pvp_decline').setLabel('رفض').setStyle(ButtonStyle.Danger)
    );

    const description = [
        `✥ قـام ${authorMember}`,
        `✶ بدعـوتـك ${opponent}`,
        `على تـحدي حـجرة ورقـة مقـص`,
        `مـبـلغ الـرهـان ${bet} <:mora:1435647151349698621>`
    ].join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`تـحـدي حـجـرة ورقـة مقـص !`)
        .setDescription(description)
        .setColor("Orange");

    const challengeMsg = await reply({ content: `${opponent}`, embeds: [embed], components: [row] });

    const challengeCollector = challengeMsg.createMessageComponentCollector({ time: 60000 });

    challengeCollector.on('collect', async i => {

        if (i.user.id !== opponent.id) {
            return i.reply({
                content: `✥ هـاه؟ التحدي مرسل الى ${opponent.displayName} مو لـك <a:Danceowo:1435658634750201876>`,
                ephemeral: true
            });
        }

        challengeCollector.stop();

        if (i.customId === 'rps_pvp_decline') {
            return i.update({
                content: `✬ رفـض التـحدي الجبـان خايـف على المـورا الي عنـده <:mirkk:1435648219488190525>`,
                embeds: [],
                components: []
            });
        }

        if (i.customId === 'rps_pvp_accept') {
            await i.update({ content: `✶ قبـل التـحدي اختـاروا اسلحـكـم !`, embeds: [], components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('rps_pvp_rock').setLabel('🪨').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('rps_pvp_paper').setLabel('📄').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('rps_pvp_scissors').setLabel('✂️').setStyle(ButtonStyle.Secondary)
                )
            ]});

            let authorChoice = null;
            let opponentChoice = null;

            const gameFilter = i => i.user.id === authorMember.id || i.user.id === opponent.id;
            const gameCollector = challengeMsg.createMessageComponentCollector({ filter: gameFilter, time: 60000 });

            gameCollector.on('collect', async gi => {
                let choiceKey;
                if (gi.user.id === authorMember.id) {
                    authorChoice = gi.customId.split('_')[2];
                    choiceKey = authorChoice;
                } else if (gi.user.id === opponent.id) {
                    opponentChoice = gi.customId.split('_')[2];
                    choiceKey = opponentChoice;
                }

                const choiceEmoji = CHOICES[choiceKey].emoji;

                await gi.reply({
                    content: `✦ تـم اختـرت ${choiceEmoji} ننتـظر خصـمك <a:HypedDance:1435572391190204447>`,
                    ephemeral: true
                });

                if (authorChoice && opponentChoice) {
                    gameCollector.stop('both_chose');
                }
            });

            gameCollector.on('end', (collected, reason) => {
                let authorChoiceFull = authorChoice ? CHOICES[authorChoice] : null;
                let opponentChoiceFull = opponentChoice ? CHOICES[opponentChoice] : null;
                let resultEmbed;

                if (!authorChoice || !opponentChoice) {
                    if (!authorChoice && !opponentChoice) {
                        resultEmbed = getResultEmbed('✥ انتهى الوقت!', 'لـم يخـتر كـلا اللاعبـيـن اي شيء وتـم الغـاء التحدي', 'Grey');
                    } else if (!authorChoice) {
                        const moraMultiplier = calculateMoraBuff(opponent, sql);
                        const finalAmount = Math.floor(bet * moraMultiplier);

                        opponentData.mora += finalAmount;
                        authorData.mora -= bet;
                        setScore.run(opponentData);
                        setScore.run(authorData);
                        resultEmbed = getResultEmbed(`✥ الـفـائـز ${opponent.displayName}`, `✶ ${authorMember} لم يختر في الوقت المحدد.\n\nربـح ${opponent} **${finalAmount}** <:mora:1435647151349698621> وتم خصمها من الخـاسـر.`, 'Red')
                            .setThumbnail(opponent.displayAvatarURL());
                    } else {
                        const moraMultiplier = calculateMoraBuff(authorMember, sql);
                        const finalAmount = Math.floor(bet * moraMultiplier);

                        authorData.mora += finalAmount;
                        opponentData.mora -= bet;
                        setScore.run(authorData);
                        setScore.run(opponentData);
                        resultEmbed = getResultEmbed(`✥ الـفـائـز ${authorMember.displayName}`, `✶ ${opponent} لم يختر في الوقت المحدد.\n\nربـح ${authorMember} **${finalAmount}** <:mora:1435647151349698621> وتم خصمها من الخـاسـر.`, 'Green')
                            .setThumbnail(authorMember.displayAvatarURL());
                    }
                } else {
                    const winner = getWinner(authorChoice, opponentChoice);
                    if (winner === 'tie') {
                        const desc = [
                            `✶ قـام ${authorMember} بـ اختيـار ${authorChoiceFull.emoji}`,
                            `✶ قـام ${opponent} بـ اختيـار ${opponentChoiceFull.emoji}`,
                            `\nانتهت اللعبة بالتعادل!`
                        ].join('\n');
                        resultEmbed = getResultEmbed('✥ تـعـادل!', desc, 'Grey');
                    } else if (winner === 'player1') {
                        const moraMultiplier = calculateMoraBuff(authorMember, sql);
                        const finalAmount = Math.floor(bet * moraMultiplier);

                        authorData.mora += finalAmount;
                        opponentData.mora -= bet;
                        setScore.run(authorData);
                        setScore.run(opponentData);
                        const desc = [
                            `✶ قـام ${authorMember} بـ اختيـار ${authorChoiceFull.emoji}`,
                            `✶ قـام ${opponent} بـ اختيـار ${opponentChoiceFull.emoji}`,
                            `\nربـح **${finalAmount}** <:mora:1435647151349698621> وتم خصمها من الخـاسـر.`
                        ].join('\n');
                        resultEmbed = getResultEmbed(`✥ الـفـائـز ${authorMember.displayName}`, desc, 'Green')
                            .setThumbnail(authorMember.displayAvatarURL());
                    } else {
                        const moraMultiplier = calculateMoraBuff(opponent, sql);
                        const finalAmount = Math.floor(bet * moraMultiplier);

                        opponentData.mora += finalAmount;
                        authorData.mora -= bet;
                        setScore.run(opponentData);
                        setScore.run(authorData);
                        const desc = [
                            `✶ قـام ${opponent} بـ اختيـار ${opponentChoiceFull.emoji}`,
                            `✶ قـام ${authorMember} بـ اختيـار ${authorChoiceFull.emoji}`,
                            `\nربـح **${finalAmount}** <:mora:1435647151349698621> وتم خصمها من الخـاسـر.`
                        ].join('\n');
                        resultEmbed = getResultEmbed(`✥ الـفـائـز ${opponent.displayName}`, desc, 'Red')
                            .setThumbnail(opponent.displayAvatarURL());
                    }
                }
                challengeMsg.edit({ content: " ", embeds: [resultEmbed], components: [] });
            });
        }
    });

    challengeCollector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            challengeMsg.edit({ content: `✶ انتـهـى الـوقـت لـم يقـبل التحـدي <:mirkk:1435648219488190525> !`, embeds: [], components: [] });
        }
    });
}