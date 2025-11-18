const { EmbedBuilder, PermissionsBitField } = require("discord.js");

// --- ( ⬇️ تم تصحيح الدوال الحسابية لتبدأ من لفل 1 ⬇️ ) ---
function recalculateLevel(totalXP) {
    if (totalXP < 0) totalXP = 0;
    let level = 0;
    let xp = totalXP;
    let nextXP = 100; // XP للوصول من لفل 1 إلى 2
    while (xp >= nextXP) {
        xp -= nextXP;
        level++;
        // (اللفل هنا هو 1، 2، 3...)
        nextXP = 5 * (level ** 2) + (50 * level) + 100;
    }
    // (level + 1) لأننا نبدأ من لفل 1
    return { level: level + 1, xp: Math.floor(xp), totalXP: totalXP };
}

function calculateTotalXP(level) {
    // (level - 1) لأننا لا نحسب الـ XP للفل 1 (فهو 0)
    if (level <= 1) return 0;
    let totalXP = 0;
    for (let i = 0; i < (level - 1); i++) {
        // (i) تمثل اللفل (0 = لفل 1، 1 = لفل 2، ...)
        totalXP += (5 * (i ** 2) + (50 * i) + 100);
    }
    return totalXP;
}
// --- ( ⬆️ نهاية تصحيح الدوال ⬆️ ) ---


module.exports = {
    name: 'set-level',
    aliases: ['levelset'],
    category: "Leveling",
    description: "Set user Level and XP",
    cooldown: 3,
    async execute(message, args) {

        const user = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return message.reply(`You do not have permission to use this command!`);
        }

        const levelArgs = parseInt(args[1]);

        const getScore = message.client.getLevel;
        const setScore = message.client.setLevel;

        if (!user) {
            return message.reply(`Please mention an user!`)
        } else {
            // --- ( ⬇️ تم التعديل: يجب أن يكون اللفل 1 أو أعلى ⬇️ ) ---
            if (isNaN(levelArgs) || levelArgs < 1) {
                return message.reply(`Please provide a valid number (1 or higher)!`)
            } else {
                // (طريقة جلب البيانات هذه ممتازة وصحيحة)
                let score = getScore.get(user.id, message.guild.id);

                score = {
                    ...message.client.defaultData,
                    ...score,
                    user: user.id,
                    guild: message.guild.id
                };

                // (نستخدم الدوال المصححة)
                const newTotalXP = calculateTotalXP(levelArgs);
                const recalculated = recalculateLevel(newTotalXP);

                score.level = recalculated.level;
                score.xp = recalculated.xp;
                score.totalXP = recalculated.totalXP;

                let embed = new EmbedBuilder()
                    .setTitle(`Success!`)
                    .setDescription(`Successfully set ${user.toString()}'s level to ${levelArgs}!`)
                    .setColor("Random");

                // 1. حفظ البيانات
                setScore.run(score);

                // --- ( ⬇️ تمت إضافة دالة الرتب هنا ⬇️ ) ---
                // 2. استدعاء دالة الرتب يدوياً
                await message.client.checkAndAwardLevelRoles(user, score.level);
                // --- ( ⬆️ نهاية الإضافة ⬆️ ) ---

                return message.channel.send({ embeds: [embed] });
            }
        }
    }
}