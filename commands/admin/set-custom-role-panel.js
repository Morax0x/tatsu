const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");

// (دالة للتحقق من أن اللون هو كود هيكس سليم)
function isValidHexColor(hex) {
    if (!hex) return false;
    return /^#[0-9A-F]{6}$/i.test(hex);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-لوحة-الرتب')
        .setDescription('تخصيص محتوى لوحة الرتب المخصصة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addSubcommand(sub => sub
            .setName('العنوان')
            .setDescription('تحديد عنوان اللوحة.')
            .addStringOption(opt => opt.setName('النص').setDescription('نص العنوان الجديد').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('الوصف')
            .setDescription('تحديد الوصف (المحتوى الرئيسي) للوحة.')
            .addStringOption(opt => opt.setName('النص').setDescription('اكتب الوصف كاملاً (استخدم \\n لسطر جديد)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('نسخ-الوصف')
            .setDescription('نسخ محتوى رسالة موجودة واستخدامه كوصف للوحة.')
            .addStringOption(opt => opt.setName('رابط-الرسالة').setDescription('رابط الرسالة التي تريد نسخ محتواها').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('الصورة')
            .setDescription('تحديد رابط الصورة (البانر) للوحة.')
            .addStringOption(opt => opt.setName('الرابط').setDescription('رابط الصورة (يجب أن يبدأ بـ https://)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('اللون')
            .setDescription('تحديد لون الشريط الجانبي للوحة.')
            .addStringOption(opt => opt.setName('كود-اللون').setDescription('كود اللون (مثل #FF0000)').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('عرض-الاعدادات')
            .setDescription('عرض الإعدادات الحالية للوحة.')
        ),

    name: 'set-custom-role-panel',
    aliases: ['scps'],
    category: "Admin",
    description: "تخصيص محتوى لوحة الرتب المخصصة.",

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, channel;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            channel = interaction.channel;
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            channel = message.channel;
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };
        const replyError = async (content) => {
            if (isSlash) return interaction.editReply({ content, ephemeral: true });
            return message.reply({ content, ephemeral: true });
        };

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return replyError(`ليس لديك صلاحية الإدارة!`);
        }

        let subcommand, value;
        if (isSlash) {
            subcommand = interaction.options.getSubcommand();
            value = interaction.options.getString(Object.keys(interaction.options._options)[0]);
        } else {
            subcommand = args[0] ? args[0].toLowerCase() : 'عرض-الاعدادات';
            value = args.slice(1).join(' ');
        }

        // (تجهيز جدول settings)
        sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(guild.id);

        try {
            switch (subcommand) {
                case 'العنوان':
                case 'title':
                    sql.prepare("UPDATE settings SET customRolePanelTitle = ? WHERE guild = ?").run(value, guild.id);
                    return reply(`✅ تم تحديث **العنوان** بنجاح.`);

                case 'الوصف':
                case 'desc':
                    // (للسماح بـ \n في أوامر البريفكس)
                    const description = isSlash ? value : value.replace(/\\n/g, '\n');
                    sql.prepare("UPDATE settings SET customRolePanelDescription = ? WHERE guild = ?").run(description, guild.id);
                    return reply(`✅ تم تحديث **الوصف** بنجاح.`);

                case 'نسخ-الوصف':
                case 'msg':
                    const match = value.match(/discord\.com\/channels\/(\d+)\/(\d+)\/(\d+)/);
                    if (!match) return replyError("الرابط غير صالح. الرجاء نسخ رابط الرسالة (Message Link).");

                    const [, guildId, channelId, messageId] = match;
                    if (guildId !== guild.id) return replyError("هذه الرسالة من سيرفر آخر.");

                    try {
                        const fetchedChannel = await client.channels.fetch(channelId);
                        if (!fetchedChannel || !fetchedChannel.isTextBased()) return replyError("القناة الموجودة في الرابط غير صالحة.");

                        const fetchedMessage = await fetchedChannel.messages.fetch(messageId);
                        if (!fetchedMessage || !fetchedMessage.content) return replyError("لم أتمكن من العثور على محتوى في هذه الرسالة.");

                        sql.prepare("UPDATE settings SET customRolePanelDescription = ? WHERE guild = ?").run(fetchedMessage.content, guild.id);
                        return reply(`✅ تم نسخ الوصف بنجاح من الرسالة.`);
                    } catch (e) {
                        console.error(e);
                        return replyError("فشل في جلب الرسالة. تأكد من أن الرابط صحيح وأن البوت يمتلك صلاحية قراءة القناة.");
                    }

                case 'الصورة':
                case 'image':
                    if (!value.startsWith('https://')) return replyError("الرابط غير صالح، يجب أن يبدأ بـ `https://`.");
                    sql.prepare("UPDATE settings SET customRolePanelImage = ? WHERE guild = ?").run(value, guild.id);
                    return reply(`✅ تم تحديث **الصورة** بنجاح.`);

                case 'اللون':
                case 'color':
                    if (!isValidHexColor(value)) return replyError("كود اللون غير صالح. يجب أن يكون بصيغة HEX (مثل #FFFFFF).");
                    sql.prepare("UPDATE settings SET customRolePanelColor = ? WHERE guild = ?").run(value, guild.id);
                    return reply(`✅ تم تحديث **اللون** بنجاح.`);

                case 'عرض-الاعدادات':
                case 'view':
                    const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
                    const embed = new EmbedBuilder()
                        .setTitle("الإعدادات الحالية للوحة الرتب المخصصة")
                        .setColor(settings.customRolePanelColor ? parseInt(settings.customRolePanelColor.replace('#', ''), 16) : Colors.Blue)
                        .addFields(
                            { name: "العنوان", value: settings.customRolePanelTitle || "*(لم يحدد)*" },
                            { name: "الوصف", value: (settings.customRolePanelDescription || "*(لم يحدد)*").substring(0, 1020) + "..." },
                            { name: "اللون", value: settings.customRolePanelColor || "*(لم يحدد)*" }
                        )
                        .setImage(settings.customRolePanelImage || null);
                    return reply({ embeds: [embed] });

                default:
                    return replyError("أمر غير معروف.");
            }
        } catch (err) {
            console.error(err);
            return replyError("حدث خطأ في قاعدة البيانات.");
        }
    }
};