const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اختصار')
        .setDescription('يضيف اختصارات (بدون بريفكس) لتشغيل أمر في قناة معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option => 
            option.setName('القناة')
                .setDescription('القناة التي سيعمل فيها الاختصار')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        .addStringOption(option =>
            option.setName('الكلمات')
                .setDescription('اكتب الكلمات وافصل بينها بمسافة (مثال: راتب يومي فلوس)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('الأمر')
                .setDescription('اسم الأمر البرمجي (مثال: daily)')
                .setRequired(true)),

    name: 'add-shortcut',
    aliases: ['اختصار'],
    category: "Leveling",
    description: 'يضيف اختصاراً لتشغيل أمر في قناة معينة.',

    async execute(interactionOrMessage, args) {
        let interaction, message, member, guild, client, sql;
        let channel, inputWordsString, commandName;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            channel = interaction.options.getChannel('القناة');
            inputWordsString = interaction.options.getString('الكلمات');
            commandName = interaction.options.getString('الأمر').toLowerCase();
        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            channel = message.mentions.channels.first();
            // نتوقع آخر شيء هو اسم الأمر، وقبله الكلمات
            if (!args || args.length < 2) return message.reply("الاستخدام الخاطئ.");
            commandName = args[args.length - 1]?.toLowerCase();
            // نجمع الكلمات في الوسط
            inputWordsString = args.slice(1, -1).join(' '); 
        }

        const reply = async (content, ephemeral = false) => {
            if (isSlash) return interaction.reply({ content, ephemeral });
            return message.reply(content);
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', true);
        }

        if (!channel || !inputWordsString || !commandName) {
            return reply('❌ | البيانات ناقصة.');
        }

        // تحويل النص إلى مصفوفة كلمات (فصل بالمسافة)
        const shortcutWords = inputWordsString.split(/\s+/).map(w => w.trim().toLowerCase()).filter(w => w.length > 0);

        // التحقق من وجود الأمر
        const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
        if (!command) {
            return reply(`❌ | لم يتم العثور على أمر باسم \`${commandName}\`.`, true);
        }

        try {
            sql.prepare(`
                CREATE TABLE IF NOT EXISTS command_shortcuts (
                    guildID TEXT, 
                    channelID TEXT, 
                    shortcutWord TEXT, 
                    commandName TEXT, 
                    PRIMARY KEY (guildID, channelID, shortcutWord)
                )
            `).run();

            const insert = sql.prepare(`
                INSERT INTO command_shortcuts (guildID, channelID, shortcutWord, commandName) 
                VALUES (?, ?, ?, ?)
                ON CONFLICT(guildID, channelID, shortcutWord) DO UPDATE SET 
                commandName = excluded.commandName
            `);

            const transaction = sql.transaction((words) => {
                for (const word of words) {
                    insert.run(guild.id, channel.id, word, command.name);
                }
            });

            transaction(shortcutWords);

            return reply(`✅ | تم إضافة **${shortcutWords.length}** اختصار في ${channel}.\nالكلمات: \`${shortcutWords.join('`, `')}\`\nتشغل الأمر: \`${command.name}\``);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ في قاعدة البيانات.', true);
        }
    }
};
