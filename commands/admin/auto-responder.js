const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, Colors } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('رد-تلقائي')
        .setDescription('إدارة نظام الردود التلقائية.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub => sub
            .setName('اضافة')
            .setDescription('إضافة رد تلقائي جديد.')
            .addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة أو الجملة التي تثير الرد.').setRequired(true))
            .addStringOption(opt => opt.setName('الرد').setDescription('الرد (افصل بين الردود العشوائية بـ | )').setRequired(true))
            .addStringOption(opt => opt.setName('الصور').setDescription('روابط صور (افصل بينها بمسافة) - اختياري').setRequired(false))
            .addStringOption(opt => opt.setName('المطابقة').setDescription('طريقة البحث عن الكلمة').setRequired(false)
                .addChoices({ name: 'تطابق تام (Exact)', value: 'exact' }, { name: 'يحتوي على (Contains)', value: 'contains' }))
            .addIntegerOption(opt => opt.setName('كولداون').setDescription('وقت الانتظار بالثواني بين الردود (لغير المالك)').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('حذف')
            .setDescription('حذف رد تلقائي.')
            .addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة المراد حذفها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('قائمة')
            .setDescription('عرض جميع الردود التلقائية.')
            .addIntegerOption(opt => opt.setName('صفحة').setDescription('رقم الصفحة').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('تخصيص-قناة')
            .setDescription('السماح أو المنع في قنوات معينة.')
            .addStringOption(opt => opt.setName('الكلمة').setDescription('الكلمة المستهدفة').setRequired(true))
            .addChannelOption(opt => opt.setName('القناة').setDescription('القناة المعنية').setRequired(true))
            .addStringOption(opt => opt.setName('الاجراء').setDescription('سماح أم منع؟').setRequired(true)
                .addChoices({ name: 'سماح فقط (Allow)', value: 'allow' }, { name: 'منع (Ignore)', value: 'ignore' }))
        ),

    name: 'auto-responder',
    category: "Admin",
    description: "نظام الردود التلقائية.",

    async execute(interaction) {
        if (!interaction.isChatInputCommand) return;
        await interaction.deferReply({ ephemeral: true });

        const sql = interaction.client.sql;
        const guildID = interaction.guild.id;
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'اضافة') {
                const trigger = interaction.options.getString('الكلمة').toLowerCase();
                const response = interaction.options.getString('الرد');
                const images = interaction.options.getString('الصور') || "";
                const matchType = interaction.options.getString('المطابقة') || 'exact';
                const cooldown = interaction.options.getInteger('كولداون') || 0;

                // التحقق من التكرار
                const exists = sql.prepare("SELECT id FROM auto_responses WHERE guildID = ? AND trigger = ?").get(guildID, trigger);
                if (exists) return interaction.editReply("❌ هذا الرد موجود مسبقاً. قم بحذفه أولاً للتعديل.");

                // تجهيز البيانات
                const responseData = {
                    text: response.split('|').map(t => t.trim()), // مصفوفة نصوص
                    images: images.split(/\s+/).filter(url => url.startsWith('http')) // مصفوفة صور
                };

                sql.prepare(`
                    INSERT INTO auto_responses (guildID, trigger, response, images, matchType, cooldown) 
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(guildID, trigger, JSON.stringify(responseData.text), JSON.stringify(responseData.images), matchType, cooldown);

                return interaction.editReply(`✅ تم إضافة الرد على: **"${trigger}"** بنجاح.\nنوع المطابقة: ${matchType}\nالكولداون: ${cooldown} ثانية.`);
            }

            if (sub === 'حذف') {
                const trigger = interaction.options.getString('الكلمة').toLowerCase();
                const result = sql.prepare("DELETE FROM auto_responses WHERE guildID = ? AND trigger = ?").run(guildID, trigger);
                
                if (result.changes > 0) return interaction.editReply(`✅ تم حذف الرد الخاص بـ **"${trigger}"**.`);
                return interaction.editReply(`❌ لم يتم العثور على رد لهذه الكلمة.`);
            }

            if (sub === 'قائمة') {
                const page = interaction.options.getInteger('صفحة') || 1;
                const rows = sql.prepare("SELECT trigger, matchType, cooldown FROM auto_responses WHERE guildID = ?").all(guildID);
                
                if (rows.length === 0) return interaction.editReply("📭 لا توجد ردود تلقائية مسجلة.");

                const itemsPerPage = 10;
                const totalPages = Math.ceil(rows.length / itemsPerPage);
                const start = (page - 1) * itemsPerPage;
                const currentItems = rows.slice(start, start + itemsPerPage);

                const desc = currentItems.map((r, i) => 
                    `**${start + i + 1}.** \`${r.trigger}\` (${r.matchType === 'exact' ? 'تطابق تام' : 'يحتوي'}) - ⏳ ${r.cooldown}ث`
                ).join('\n');

                const embed = new EmbedBuilder()
                    .setTitle(`📜 قائمة الردود التلقائية (${rows.length})`)
                    .setDescription(desc)
                    .setFooter({ text: `صفحة ${page} من ${totalPages}` })
                    .setColor(Colors.Blue);

                return interaction.editReply({ embeds: [embed] });
            }

            if (sub === 'تخصيص-قناة') {
                const trigger = interaction.options.getString('الكلمة').toLowerCase();
                const channel = interaction.options.getChannel('القناة');
                const action = interaction.options.getString('الاجراء');

                const row = sql.prepare("SELECT * FROM auto_responses WHERE guildID = ? AND trigger = ?").get(guildID, trigger);
                if (!row) return interaction.editReply("❌ هذا الرد غير موجود.");

                let allowed = row.allowedChannels ? JSON.parse(row.allowedChannels) : [];
                let ignored = row.ignoredChannels ? JSON.parse(row.ignoredChannels) : [];

                if (action === 'allow') {
                    if (!allowed.includes(channel.id)) allowed.push(channel.id);
                    // إزالة من القائمة الأخرى إذا وجد
                    ignored = ignored.filter(id => id !== channel.id);
                } else {
                    if (!ignored.includes(channel.id)) ignored.push(channel.id);
                    allowed = allowed.filter(id => id !== channel.id);
                }

                sql.prepare("UPDATE auto_responses SET allowedChannels = ?, ignoredChannels = ? WHERE id = ?")
                   .run(JSON.stringify(allowed), JSON.stringify(ignored), row.id);

                return interaction.editReply(`✅ تم تحديث إعدادات القناة للرد **"${trigger}"**.`);
            }

        } catch (err) {
            console.error(err);
            return interaction.editReply("❌ حدث خطأ أثناء تنفيذ الأمر.");
        }
    }
};
