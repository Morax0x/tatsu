const { PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-المهمات-الخاصة')
        .setDescription('تحديد إعدادات المهام المتقدمة (للمطور/الادمن).')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('بوت-الشجرة')
            .setDescription('تحديد بوت الشجرة للمراقبة.')
            .addStringOption(opt => opt.setName('id-البوت').setDescription('ID الخاص بالبوت').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('قناة-الشجرة')
            .setDescription('تحديد قناة الشجرة للمراقبة.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('قناة-العد')
            .setDescription('تحديد قناة العد للمراقبة.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('قناة-المهمات')
            .setDescription('تحديد قناة إشعارات المهام.')
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('رول-القيصر')
            .setDescription('تحديد رول إنجاز القيصر.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة').setRequired(true)))
        .addSubcommand(sub => sub
            .setName('رول-الشجرة')
            .setDescription('تحديد رول إنجاز الشجرة.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة').setRequired(true))),

    name: 'set-quest-configs',
    aliases: ['setquest', 'sqc'],
    category: "Admin",
    description: 'تحديد إعدادات المهام (للادمن فقط).',

    async execute(message, args) {

        const isSlash = message.isChatInputCommand ? message.isChatInputCommand() : false;
        let interaction, guild, client, member;

        if (isSlash) {
            interaction = message;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = false; 
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError("❌ هذا الأمر للمشرفين فقط.");
        }

        let method, value;

        if (isSlash) {
            const subcommand = interaction.options.getSubcommand();
            switch (subcommand) {
                case 'بوت-الشجرة':
                    method = 'treebot';
                    value = interaction.options.getString('id-البوت');
                    break;
                case 'قناة-الشجرة':
                    method = 'treechannel';
                    value = interaction.options.getChannel('القناة').id;
                    break;
                case 'قناة-العد':
                    method = 'countchannel';
                    value = interaction.options.getChannel('القناة').id;
                    break;
                case 'قناة-المهمات':
                    method = 'questchannel';
                    value = interaction.options.getChannel('القناة').id;
                    break;
                case 'رول-القيصر':
                    method = 'caesarrole';
                    value = interaction.options.getRole('الرتبة').id;
                    break;
                case 'رول-الشجرة':
                    method = 'treerole';
                    value = interaction.options.getRole('الرتبة').id;
                    break;
            }
        } else {
            method = args[0] ? args[0].toLowerCase() : null;
            let rawValue = args[1];
            // تنظيف المدخلات في حالة المنشن (Legacy Command)
            if (rawValue) {
                value = rawValue.replace(/[<@!&#>]/g, ""); // يحذف الرموز ويبقى الرقم فقط
            }
        }

        if (!method) {
            return replyError(
                "الاستخدام:\n" +
                "`-sqc treebot <Bot_ID>`\n" +
                "`-sqc treechannel <Channel_ID>`\n" +
                "`-sqc countchannel <Channel_ID>`\n" +
                "`-sqc questchannel <Channel_ID>`\n" +
                "`-sqc caesarrole <Role_ID>`\n" +
                "`-sqc treerole <Role_ID>`\n"
            );
        }

        const guildID = guild.id;

        // 1. معالجة الرولات (تخزن في جدول quest_achievement_roles)
        if (method === 'caesarrole' || method === 'treerole') {
            if (!value) return replyError("يرجى تحديد ID الرول.");
            
            const achievementMap = {
                'caesarrole': 'ach_caesar_role',
                'treerole': 'ach_tree_role'
            };
            const achievementID = achievementMap[method];
            const roleName = method === 'caesarrole' ? 'القيصر' : 'إشعار الشجرة';

            try {
                // التأكد من وجود الجدول
                sql.prepare("CREATE TABLE IF NOT EXISTS quest_achievement_roles (guildID TEXT, roleID TEXT, achievementID TEXT)").run();
                
                sql.prepare("DELETE FROM quest_achievement_roles WHERE guildID = ? AND achievementID = ?").run(guildID, achievementID);
                sql.prepare("INSERT INTO quest_achievement_roles (guildID, roleID, achievementID) VALUES (?, ?, ?)").run(guildID, value, achievementID);
                
                return reply(`✅ تم تحديد رول ${roleName} لإنجاز: <@&${value}>`);
            } catch (e) {
                console.error(e);
                return replyError("حدث خطأ في قاعدة البيانات.");
            }
        }

        // 2. معالجة الإعدادات العامة (تخزن في جدول settings)
        if (!value) return replyError("يرجى تحديد قيمة (ID).");

        let dbColumn;
        let successMessage;

        switch (method) {
            case 'treebot':
                dbColumn = 'treeBotID';
                successMessage = `✅ تم تحديد بوت الشجرة: <@${value}>`;
                break;
            case 'treechannel':
                dbColumn = 'treeChannelID';
                successMessage = `✅ تم تحديد قناة الشجرة: <#${value}>`;
                break;
            case 'countchannel':
                dbColumn = 'countingChannelID';
                successMessage = `✅ تم تحديد قناة العد: <#${value}>`;
                break;
            case 'questchannel':
                dbColumn = 'questChannelID';
                successMessage = `✅ تم تحديد قناة نشر المهام والإنجازات: <#${value}>`;
                break;
            default:
                return replyError("أمر غير معروف.");
        }

        try {
            // التأكد من وجود الأعمدة في جدول settings لتجنب الكراش
            try { sql.prepare(`ALTER TABLE settings ADD COLUMN ${dbColumn} TEXT`).run(); } catch (e) {}

            sql.prepare(`INSERT INTO settings (guild, ${dbColumn}) VALUES (?, ?) ON CONFLICT(guild) DO UPDATE SET ${dbColumn} = excluded.${dbColumn}`).run(guildID, value);
            reply(successMessage);
        } catch (e) {
            console.error(e);
            replyError("حدث خطأ أثناء تحديث الإعدادات.");
        }
    }
};
