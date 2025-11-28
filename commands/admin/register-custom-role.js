const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تسجيل-رتبة-خاصة')
        .setDescription('إدارة تسجيل الرتب الخاصة للأعضاء.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('تسجيل-جماعي')
            .setDescription('يسجل رتبة معينة لجميع الأعضاء الذين يملكونها حالياً.')
            .addRoleOption(opt => opt.setName('الرتبة').setDescription('الرتبة التي تريد تسجيلها للأعضاء').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('تسجيل-فردي')
            .setDescription('ربط رتبة بعضو محدد (يدوياً).')
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
        ),

    name: 'register-custom-role',
    aliases: ['rcr', 'regrole', 'تسجيل-رتبة'],
    category: "Admin",
    description: "إدارة تسجيل الرتب الخاصة.",

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
                payload.ephemeral = true; 
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

        if (isSlash) {
            subcommand = interaction.options.getSubcommand();
        } else {
            subcommand = args[0] ? args[0].toLowerCase() : 'قائمة';
            // (دعم بسيط للبريفكس)
            if (subcommand === 'mass' || subcommand === 'جماعي') {
                subcommand = 'تسجيل-جماعي';
                targetRole = message.mentions.roles.first();
            } else if (subcommand === 'single' || subcommand === 'فردي') {
                subcommand = 'تسجيل-فردي';
                targetUser = message.mentions.users.first();
                targetRole = message.mentions.roles.first();
            }
        }

        try {
            // --- 1. تسجيل جماعي (الميزة الجديدة) ---
            if (subcommand === 'تسجيل-جماعي') {
                if (isSlash) targetRole = interaction.options.getRole('الرتبة');
                if (!targetRole) return reply("❌ يجب تحديد الرتبة.");

                // جلب الأعضاء الذين لديهم الرتبة
                // (قد نحتاج لعمل fetch للتأكد من تحميل الجميع)
                await guild.members.fetch(); 
                const membersWithRole = targetRole.members.filter(m => !m.user.bot); // استبعاد البوتات

                if (membersWithRole.size === 0) {
                    return reply(`⚠️ لا يوجد أي أعضاء (بشر) يمتلكون الرتبة ${targetRole} حالياً.`);
                }

                let successCount = 0;
                const stmt = sql.prepare("INSERT OR REPLACE INTO custom_roles (id, guildID, userID, roleID) VALUES (?, ?, ?, ?)");

                const transaction = sql.transaction(() => {
                    membersWithRole.forEach(mem => {
                        stmt.run(`${guild.id}-${mem.id}`, guild.id, mem.id, targetRole.id);
                        successCount++;
                    });
                });
                
                transaction();

                const embed = new EmbedBuilder()
                    .setTitle("✅ تم التسجيل الجماعي بنجاح")
                    .setDescription(`تم تسجيل الرتبة ${targetRole} لـ **${successCount}** عضو.\nالآن يمكنهم جميعاً التحكم بهذه الرتبة من خلال اللوحة.`)
                    .setColor(Colors.Green)
                    .setFooter({ text: "ملاحظة: هذا الأمر يقوم بتحديث البيانات فقط، ولا يعطي الرتبة لأحد في ديسكورد." });

                return reply({ embeds: [embed] });
            }

            // --- 2. تسجيل فردي (Add) ---
            if (subcommand === 'تسجيل-فردي') {
                if (isSlash) {
                    targetUser = interaction.options.getUser('العضو');
                    targetRole = interaction.options.getRole('الرتبة');
                }
                if (!targetUser || !targetRole) return reply("❌ يجب تحديد العضو والرتبة.");

                sql.prepare("INSERT OR REPLACE INTO custom_roles (id, guildID, userID, roleID) VALUES (?, ?, ?, ?)")
                   .run(`${guild.id}-${targetUser.id}`, guild.id, targetUser.id, targetRole.id);

                // (اختياري) التأكد من أن العضو يملك الرتبة
                const guildMember = await guild.members.fetch(targetUser.id).catch(() => null);
                if (guildMember && !guildMember.roles.cache.has(targetRole.id)) {
                    await guildMember.roles.add(targetRole).catch(() => {});
                }

                return reply(`✅ تم تسجيل الرتبة ${targetRole} للعضو ${targetUser} بنجاح.`);
            }

            // --- 3. إزالة (Remove) ---
            if (subcommand === 'ازالة') {
                if (isSlash) targetUser = interaction.options.getUser('العضو');
                if (!targetUser) return reply("❌ يجب تحديد العضو.");

                const result = sql.prepare("DELETE FROM custom_roles WHERE guildID = ? AND userID = ?").run(guild.id, targetUser.id);
                
                if (result.changes > 0) return reply(`✅ تم إلغاء تسجيل الرتبة الخاصة للعضو ${targetUser}.`);
                return reply(`❌ هذا العضو ليس لديه رتبة مسجلة.`);
            }

            // --- 4. قائمة (List) ---
            if (subcommand === 'قائمة') {
                if (isSlash) page = interaction.options.getInteger('صفحة') || 1;
                
                const allRoles = sql.prepare("SELECT userID, roleID FROM custom_roles WHERE guildID = ?").all(guild.id);
                if (allRoles.length === 0) return reply("📭 لا توجد أي رتب خاصة مسجلة.");

                const itemsPerPage = 10;
                const totalPages = Math.ceil(allRoles.length / itemsPerPage);
                if (page > totalPages) page = 1;

                const startIndex = (page - 1) * itemsPerPage;
                const pageItems = allRoles.slice(startIndex, startIndex + itemsPerPage);

                const description = pageItems.map((item, index) => 
                    `**${startIndex + index + 1}.** <@${item.userID}> : <@&${item.roleID}>`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📜 الرتب المسجلة (${allRoles.length})`)
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
