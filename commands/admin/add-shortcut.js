const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    // --- ( ⬇️ تمت إضافة هذا الجزء بالكامل ⬇️ ) ---
    data: new SlashCommandBuilder()
        .setName('اختصار') // (الاسم العربي للسلاش، يجب أن يكون كلمة واحدة)
        .setDescription('يضيف اختصاراً (كلمة) لتشغيل أمر في قناة معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild) // (تحديد الصلاحية المطلوبة)
        .addChannelOption(option => 
            option.setName('القناة')
                .setDescription('القناة التي سيعمل فيها الاختصار')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)) // (يجبر المستخدم على اختيار قناة نصية فقط)
        .addStringOption(option =>
            option.setName('الاختصار')
                .setDescription('الكلمة التي ستكتبها لتشغيل الأمر (كلمة واحدة فقط)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('الأمر')
                .setDescription('اسم الأمر (البرمجي) الذي سيتم تشغيله')
                .setRequired(true)),
    // --- ( ⬆️ نهاية الإضافة ⬆️ ) ---

    // (معلومات البريفكس القديمة تبقى كما هي)
    name: 'add-shortcut',
    aliases: ['اختصار'],
    category: "Leveling",
    description: 'يضيف اختصاراً (كلمة) لتشغيل أمر في قناة معينة.',

    // --- ( ⬇️ تم تعديل الدالة لتقبل النوعين ⬇️ ) ---
    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let channel, shortcutWords, commandName;

        // التحقق إذا كان الأمر سلاش أم بريفكس
        const isSlash = !!!!interactionOrMessage.isChatInputCommand;;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            // جلب الخيارات من أمر السلاش
            channel = interaction.options.getChannel('القناة');
            // (أمر السلاش يدعم اختصار واحد كل مرة لتبسيط الواجهة)
            shortcutWords = [interaction.options.getString('الاختصار').toLowerCase()]; 
            commandName = interaction.options.getString('الأمر').toLowerCase();
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            // جلب الخيارات من أمر البريفكس
            channel = message.mentions.channels.first();
            commandName = args[args.length - 1]?.toLowerCase();
            shortcutWords = args.slice(1, -1).map(w => w.toLowerCase());
        }

        // --- (دالة موحدة للرد) ---
        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                // الرد المؤقت (ephemeral) يظهر فقط لمنفذ الأمر
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        // 1. التحقق من الصلاحيات
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', true);
        }

        // 2. التحقق من المدخلات (لأمر البريفكس فقط، السلاش يتحقق تلقائياً)
        if (!isSlash && (!channel || shortcutWords.length === 0 || !commandName)) {
            return reply(
                '**الاستخدام:** `-add-shortcut <#channel> <الكلمة> <اسم_الأمر>`\n' +
                '**لإضافة عدة اختصارات:** `-add-shortcut <#channel> <كلمة1> <كلمة2> <اسم_الأمر>`'
            );
        }

        // 3. التحقق من نوع القناة
        if (channel.type !== ChannelType.GuildText) {
             return reply('❌ | يرجى اختيار قناة كتابية.', true);
        }

        // 4. التحقق من وجود الأمر
        const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
        if (!command) {
            return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`, true);
        }

        // 5. تنفيذ الكود في قاعدة البيانات
        try {
            const insert = sql.prepare(`
                INSERT INTO command_shortcuts (guildID, channelID, shortcutWord, commandName) 
                VALUES (?, ?, ?, ?)
                ON CONFLICT(guildID, channelID, shortcutWord) DO UPDATE SET 
                commandName = excluded.commandName
            `);

            const transaction = sql.transaction((shortcuts) => {
                for (const word of shortcuts) {
                    insert.run(guild.id, channel.id, word, command.name);
                }
            });

            transaction(shortcutWords);

            return reply(`✅ | تم تحديد الاختصارات! الآن كتابة \`${shortcutWords.join('`, `')}\` في ${channel} ستشغل أمر \`${command.name}\`.`);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};