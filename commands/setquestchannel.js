const { EmbedBuilder, PermissionsBitField, SlashCommandBuilder } = require("discord.js");

module.exports = {
    data: new SlashCommandBuilder()
        .setName('تحديد-قناة-المهام')
        .setDescription('تعيين القناة التي سيتم إرسال إشعارات المهام والإنجازات فيها.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
            .setDescription('القناة التي ستستقبل الإشعارات')
            .setRequired(true)),

    name: 'setquestchannel',
    aliases: ['sqc', 'تعيين-قناة-المهام'],
    category: "Admin",
    description: 'تعيين القناة التي سيتم إرسال إشعارات المهام والإنجازات فيها',
    usage: '-setquestchannel <#channel>',
    permissions: ['ManageGuild'],

    async execute(interactionOrMessage, args) {

        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, user; // (تم إضافة user هنا)

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            user = interaction.user; // (تعريف المستخدم للسلاش)
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            user = message.author; // (تعريف المستخدم للرسائل)
        }

        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        const replyError = async (content) => {
            const payload = { content, ephemeral: true };
            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                return message.reply(payload);
            }
        };

        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return replyError('❌ ليس لديك صلاحية `إدارة السيرفر` لاستخدام هذا الأمر!');
        }

        let channel;
        if (isSlash) {
            channel = interaction.options.getChannel('القناة');
        } else {
            if (!args[0]) {
                return replyError('❌ يجب عليك تحديد القناة!\nمثال: `-setquestchannel #quests`');
            }
            channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]);
        }

        if (!channel) {
            return replyError('❌ لم أتمكن من العثور على القناة المحددة!');
        }

        // التأكد من نوع القناة (0 = نصية، 5 = إعلانات)
        if (channel.type !== 0 && channel.type !== 5) {
            return replyError('❌ يجب أن تكون القناة المحددة قناة نصية أو إعلانية!');
        }

        const botPerms = channel.permissionsFor(guild.members.me);
        if (!botPerms.has(PermissionsBitField.Flags.SendMessages) || !botPerms.has(PermissionsBitField.Flags.ViewChannel)) {
            return replyError('❌ ليس لدي صلاحية الإرسال في هذه القناة!');
        }

        try {
            // التأكد من وجود الجدول في قاعدة البيانات (للاحتياط)
            sql.prepare(`CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, questChannelID TEXT)`).run();

            // التحقق إذا كان السجل موجوداً أم لا
            let settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);

            if (!settings) {
                // إذا لم يكن موجوداً، ننشئ صفاً جديداً
                // ملاحظة: قد تحتاج لإضافة باقي الأعمدة الافتراضية إذا كان جدولك يحتوي على أعمدة أخرى غير قابلة للقيم الفارغة (NOT NULL)
                // لكن عادة في sqlite القيم الافتراضية تكون null، وهذا جيد
                sql.prepare("INSERT INTO settings (guild, questChannelID) VALUES (?, ?)").run(guild.id, channel.id);
            } else {
                // إذا كان موجوداً، نحدثه
                sql.prepare("UPDATE settings SET questChannelID = ? WHERE guild = ?").run(channel.id, guild.id);
            }

            const embed = new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle('✅ تم تعيين قناة المهام بنجاح!')
                .setDescription(`سيتم إرسال جميع إشعارات المهام والإنجازات في ${channel}`)
                .setFooter({ text: `تم التعيين بواسطة ${user.tag}` })
                .setTimestamp();

            await reply({ embeds: [embed] });

            // إرسال رسالة ترحيبية للقناة للتأكد من الصلاحيات
            const welcomeEmbed = new EmbedBuilder()
                .setColor(0xFEE75C)
                .setTitle('🎉 مرحباً بكم في قناة المهام!')
                .setDescription('سيتم إرسال جميع إشعارات المهام والإنجازات هنا.\nحظاً موفقاً للجميع! 🏆')
                .setTimestamp();

            await channel.send({ embeds: [welcomeEmbed] });

        } catch (err) {
            console.error("Error in setquestchannel command:", err);
            
            // في حال كان الخطأ بسبب عدم وجود العمود في الجدول القديم
            if (err.message.includes("no such column")) {
                try {
                    // محاولة إضافة العمود وإعادة المحاولة
                    sql.prepare("ALTER TABLE settings ADD COLUMN questChannelID TEXT;").run();
                    sql.prepare("UPDATE settings SET questChannelID = ? WHERE guild = ?").run(channel.id, guild.id);
                    return reply('✅ تم تحديث قاعدة البيانات وتعيين القناة بنجاح!');
                } catch (alterErr) {
                    console.error("Failed to alter table:", alterErr);
                }
            }

            return replyError('❌ حدث خطأ أثناء تعيين القناة! (راجع الكونسول للتفاصيل)');
        }
    }
};
