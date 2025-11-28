const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تسجيل-رتبة-خاصة')
        .setDescription('ربط رتبة موجودة بعضو معين ليتمكن من إدارتها عبر اللوحة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('تسجيل')
            .setDescription('ربط رتبة بعضو.')
            .addUserOption(opt => opt.setName('العضو').setDescription('العضو المالك للرتبة').setRequired(true))
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة المراد تسجيلها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('ازالة')
            .setDescription('إلغاء ربط رتبة خاصة بعضو (لا يحذف الرتبة من السيرفر).')
            .addUserOption(opt => opt.setName('العضو').setDescription('العضو المراد إلغاء رتبته').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('قائمة')
            .setDescription('عرض قائمة الرتب الخاصة المسجلة.')
            .addIntegerOption(opt => opt.setName('صفحة').setDescription('رقم الصفحة').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('فحص')
            .setDescription('فحص ما إذا كان العضو يمتلك رتبة مسجلة.')
            .addUserOption(opt => opt.setName('العضو').setDescription('العضو المراد فحصه').setRequired(true))
        ),

    name: 'register-custom-role',
    aliases: ['rcr', 'regrole', 'تسجيل-رتبة'],
    category: "Admin",
    description: "ربط رتبة موجودة بعضو معين ليتمكن من إدارتها.",

    async execute(interactionOrMessage, args) {
        
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            if (isSlash) {
                payload.ephemeral = true; // (مخفي للإداري)
                return interaction.editReply(payload);
            }
            return message.reply(payload);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return reply(`❌ ليس لديك صلاحية إدارة الرتب!`);
        }

        let subcommand;
        let targetUser, targetRole;
        let page = 1;

        // --- معالجة المدخلات ---
        if (isSlash) {
            subcommand = interaction.options.getSubcommand();
            targetUser = interaction.options.getUser('العضو');
            targetRole = interaction.options.getRole('الرتبة');
            page = interaction.options.getInteger('صفحة') || 1;
        } else {
            subcommand = args[0] ? args[0].toLowerCase() : 'قائمة';
            
            // محاولة تخمين المدخلات للبريفكس
            if (subcommand === 'تسجيل' || subcommand === 'add') {
                subcommand = 'تسجيل';
                targetUser = message.mentions.users.first();
                targetRole = message.mentions.roles.first();
            } else if (subcommand === 'ازالة' || subcommand === 'remove') {
                subcommand = 'ازالة';
                targetUser = message.mentions.users.first();
            } else if (subcommand === 'فحص' || subcommand === 'check') {
                subcommand = 'فحص';
                targetUser = message.mentions.users.first();
            } else if (subcommand === 'قائمة' || subcommand === 'list') {
                subcommand = 'قائمة';
                page = parseInt(args[1]) || 1;
            }
        }

        try {
            // --- 1. تسجيل (Add) ---
            if (subcommand === 'تسجيل') {
                if (!targetUser || !targetRole) return reply("❌ يجب تحديد العضو والرتبة.");
                
                // التحقق هل العضو لديه رتبة مسجلة بالفعل
                const existing = sql.prepare("SELECT roleID FROM custom_roles WHERE guildID = ? AND userID = ?").get(guild.id, targetUser.id);
                
                if (existing) {
                    return reply(`⚠️ هذا العضو لديه رتبة مسجلة بالفعل (<@&${existing.roleID}>). يجب إزالتها أولاً.`);
                }

                // التحقق هل الرتبة مسجلة لشخص آخر
                const roleUsed = sql.prepare("SELECT userID FROM custom_roles WHERE guildID = ? AND roleID = ?").get(guild.id, targetRole.id);
                if (roleUsed) {
                    return reply(`⚠️ هذه الرتبة مسجلة بالفعل باسم عضو آخر (<@${roleUsed.userID}>).`);
                }

                // التسجيل
                sql.prepare("INSERT INTO custom_roles (id, guildID, userID, roleID) VALUES (?, ?, ?, ?)")
                   .run(`${guild.id}-${targetUser.id}`, guild.id, targetUser.id, targetRole.id);

                // التأكد من أن العضو يملك الرتبة في ديسكورد
                const guildMember = await guild.members.fetch(targetUser.id).catch(() => null);
                if (guildMember && !guildMember.roles.cache.has(targetRole.id)) {
                    await guildMember.roles.add(targetRole).catch(() => console.log("Failed to add role to user in discord"));
                }

                const embed = new EmbedBuilder()
                    .setTitle("✅ تم تسجيل الرتبة الخاصة بنجاح")
                    .setDescription(`تم ربط الرتبة ${targetRole} بالعضو ${targetUser}.\nالآن يمكن للعضو التحكم بها من خلال لوحة الرتب.`)
                    .setColor(Colors.Green);
                
                return reply({ embeds: [embed] });
            }

            // --- 2. إزالة (Remove) ---
            if (subcommand === 'ازالة') {
                if (!targetUser) return reply("❌ يجب تحديد العضو.");

                const result = sql.prepare("DELETE FROM custom_roles WHERE guildID = ? AND userID = ?").run(guild.id, targetUser.id);

                if (result.changes > 0) {
                    return reply(`✅ تم إلغاء ربط الرتبة الخاصة بالعضو ${targetUser}. (لم يتم حذف الرتبة من السيرفر، فقط من قاعدة البيانات).`);
                } else {
                    return reply(`❌ هذا العضو ليس لديه رتبة خاصة مسجلة.`);
                }
            }

            // --- 3. فحص (Check) ---
            if (subcommand === 'فحص') {
                if (!targetUser) return reply("❌ يجب تحديد العضو.");

                const data = sql.prepare("SELECT roleID FROM custom_roles WHERE guildID = ? AND userID = ?").get(guild.id, targetUser.id);

                if (data) {
                    return reply(`ℹ️ العضو ${targetUser} يمتلك الرتبة الخاصة: <@&${data.roleID}>`);
                } else {
                    return reply(`ℹ️ العضو ${targetUser} لا يمتلك أي رتبة خاصة مسجلة.`);
                }
            }

            // --- 4. قائمة (List) ---
            if (subcommand === 'قائمة') {
                const allRoles = sql.prepare("SELECT userID, roleID FROM custom_roles WHERE guildID = ?").all(guild.id);
                
                if (allRoles.length === 0) {
                    return reply("📭 لا توجد أي رتب خاصة مسجلة في هذا السيرفر.");
                }

                const itemsPerPage = 10;
                const totalPages = Math.ceil(allRoles.length / itemsPerPage);
                if (page > totalPages || page < 1) page = 1;

                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = page * itemsPerPage;
                const pageItems = allRoles.slice(startIndex, endIndex);

                const description = pageItems.map((item, index) => {
                    return `**${startIndex + index + 1}.** <@${item.userID}> : <@&${item.roleID}>`;
                }).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📜 قائمة الرتب الخاصة المسجلة (${allRoles.length})`)
                    .setDescription(description)
                    .setFooter({ text: `صفحة ${page} من ${totalPages}` })
                    .setColor(Colors.Blue);

                return reply({ embeds: [embed] });
            }

        } catch (e) {
            console.error(e);
            return reply("❌ حدث خطأ أثناء تنفيذ الأمر.");
        }
    }
};
