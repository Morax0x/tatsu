const { PermissionsBitField, ChannelType, SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اختصار')
        .setDescription('يضيف اختصاراً (كلمة بدون بريفكس) لتشغيل أمر في قناة معينة.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option => 
            option.setName('القناة')
                .setDescription('القناة التي سيعمل فيها الاختصار')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        .addStringOption(option =>
            option.setName('الكلمة')
                .setDescription('الكلمة التي ستكتبها لتشغيل الأمر (بدون بريفكس)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('الأمر')
                .setDescription('اسم الأمر (البرمجي) الذي سيتم تشغيله')
                .setRequired(true)),

    name: 'add-shortcut',
    aliases: ['اختصار'],
    category: "Leveling",
    description: 'يضيف اختصاراً (كلمة) لتشغيل أمر في قناة معينة.',

    async execute(interactionOrMessage, args) {

        let interaction, message, member, guild, client, sql;
        let channel, shortcutWords, commandName;

        const isSlash = !!interactionOrMessage.isChatInputCommand;

        if (isSlash) {
            interaction = interactionOrMessage;
            member = interaction.member;
            guild = interaction.guild;
            client = interaction.client;
            sql = client.sql;

            channel = interaction.options.getChannel('القناة');
            
            // 🌟 التحقق من القيم قبل استخدامها 🌟
            const rawWord = interaction.options.getString('الكلمة');
            const rawCommand = interaction.options.getString('الأمر');

            if (!rawWord || !rawCommand) {
                return interaction.reply({ content: "❌ يرجى تعبئة جميع الحقول.", ephemeral: true });
            }

            shortcutWords = [rawWord.toLowerCase()]; 
            commandName = rawCommand.toLowerCase();

        } else {
            message = interactionOrMessage;
            member = message.member;
            guild = message.guild;
            client = message.client;
            sql = client.sql;

            channel = message.mentions.channels.first();
            // التحقق من وجود الـ Args
            if (!args || args.length < 3) {
                 commandName = null;
            } else {
                 commandName = args[args.length - 1]?.toLowerCase();
                 shortcutWords = args.slice(1, -1).map(w => w.toLowerCase());
            }
        }

        const reply = async (content, ephemeral = false) => {
            if (isSlash) {
                return interaction.reply({ content, ephemeral });
            } else {
                return message.reply(content);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | أنت بحاجة إلى صلاحية `ManageGuild`.', true);
        }

        if (!channel || !shortcutWords || shortcutWords.length === 0 || !commandName) {
            return reply(
                '**الاستخدام:** `-اختصار <#channel> <الكلمة> <اسم_الأمر>`\n' +
                'مثال: `-اختصار #general راتب daily`'
            );
        }

        if (channel.type !== ChannelType.GuildText) {
             return reply('❌ | يرجى اختيار قناة كتابية.', true);
        }

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

            const transaction = sql.transaction((shortcuts) => {
                for (const word of shortcuts) {
                    insert.run(guild.id, channel.id, word, command.name);
                }
            });

            transaction(shortcutWords);

            return reply(`✅ | تم! الآن عند كتابة **"${shortcutWords.join('", "')}"** في ${channel} سيعمل الأمر \`${command.name}\` تلقائياً.`);

        } catch (err) {
            console.error(err);
            return reply('❌ | حدث خطأ أثناء تحديث قاعدة البيانات.', true);
        }
    }
};
