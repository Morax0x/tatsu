const { EmbedBuilder, Colors, SlashCommandBuilder } = require("discord.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');
const skillsConfig = require('../../json/skills-config.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';

module.exports = {
    // --- بيانات السلاش ---
    data: new SlashCommandBuilder()
        .setName('مهاراتي')
        .setDescription('عرض مهاراتك القتالية وتفاصيل سلاحك.')
        .addUserOption(option => 
            option.setName('المستخدم')
            .setDescription('عرض مهارات عضو آخر (اختياري)')
            .setRequired(false)),

    name: 'my-skills',
    aliases: ['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'],
    category: "Economy",
    description: 'عرض مهاراتك القتالية وتفاصيل سلاحك.',

    async execute(interactionOrMessage, args) {

        // --- إعداد المتغيرات (نظام هجين) ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        const sql = client.sql;
        const targetUser = targetMember.user;
        const cleanName = cleanDisplayName(targetUser.displayName);

        // 1. جلب بيانات العرق والسلاح
        const userRace = getUserRace(targetMember, sql);
        const weaponData = getWeaponData(sql, targetMember);

        // 2. جلب المهارات المشتراة من قاعدة البيانات
        const userSkillsDB = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillLevel > 0").all(targetUser.id, guild.id);

        const embed = new EmbedBuilder()
            .setTitle(`⚔️ السجل القتالي لـ ${cleanName}`)
            .setColor(Colors.Gold)
            .setThumbnail(targetUser.displayAvatarURL());

        // --- قسم السلاح ---
        let weaponField = "لا يوجد سلاح مجهز.";
        if (userRace && weaponData) {
            weaponField = 
                `**السلاح:** ${weaponData.emoji} **${weaponData.name}**\n` +
                `**المستوى:** \`Lv.${weaponData.currentLevel}\`\n` +
                `**الضرر:** \`${weaponData.currentDamage}\` DMG`;
        } else if (userRace && !weaponData) {
            weaponField = `العرق: **${userRace.raceName}** (بدون سلاح)`;
        } else {
            weaponField = "لم يتم اختيار عرق بعد.";
        }

        embed.addFields({ name: "🗡️ العتاد الحالي", value: weaponField, inline: false });

        // --- قسم المهارات ---
        let skillsList = [];

        // أ) مهارة العرق (تضاف تلقائياً إذا كان لديه عرق)
        if (userRace) {
            // تحويل اسم العرق لصيغة الآيدي (مثال: Dark Elf -> race_dark_elf_skill)
            const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/ /g, '_')}_skill`;
            const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
            
            if (raceSkillConfig) {
                skillsList.push(`**${raceSkillConfig.emoji} ${raceSkillConfig.name}** (مهارة العرق)\n> ${raceSkillConfig.description}`);
            }
        }

        // ب) المهارات المشتراة
        if (userSkillsDB.length > 0) {
            for (const dbSkill of userSkillsDB) {
                const skillConfig = skillsConfig.find(s => s.id === dbSkill.skillID);
                if (skillConfig) {
                    let effectDesc = "";
                    // حساب قوة المهارة الحالية
                    const currentValue = skillConfig.base_value + (skillConfig.value_increment * (dbSkill.skillLevel - 1));
                    
                    if (skillConfig.id === 'skill_healing') effectDesc = `شفاء: ${currentValue}%`;
                    else if (skillConfig.id === 'skill_shielding') effectDesc = `درع: ${currentValue}%`;
                    else if (skillConfig.id === 'skill_buffing') effectDesc = `تضخيم ضرر: ${currentValue}%`;
                    else if (skillConfig.id === 'skill_poison') effectDesc = `ضرر سم: ${currentValue}`;
                    else effectDesc = `Lv.${dbSkill.skillLevel}`;

                    skillsList.push(`**${skillConfig.emoji} ${skillConfig.name}** \`(Lv.${dbSkill.skillLevel})\`\n> التأثير: ${effectDesc}`);
                }
            }
        }

        if (skillsList.length > 0) {
            embed.addFields({ name: "🌟 المهارات والقدرات", value: skillsList.join('\n\n'), inline: false });
        } else {
            embed.addFields({ name: "🌟 المهارات والقدرات", value: "لا توجد مهارات مكتسبة حالياً.", inline: false });
        }

        // إضافة تذييل
        embed.setFooter({ text: "يمكنك تطوير مهاراتك وشراء المزيد من المتجر." });

        await reply({ embeds: [embed] });
    }
};
