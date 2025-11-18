const { PermissionsBitField, SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
    // 1. إعدادات السلاش كوماند
    data: new SlashCommandBuilder()
        .setName('تحديد-قناة-المهام')
        .setDescription('تعيين القناة التي سيتم إرسال إشعارات المهام والإنجازات فيها.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addChannelOption(option =>
            option.setName('القناة')
            .setDescription('اختر القناة المراد تعيينها')
            .setRequired(true)),

    // 2. إعدادات الرسائل العادية (Prefix)
    name: 'setquestchannel',
    aliases: ['sqc', 'setach', 'تحديد-قناة-الانجازات'],
    category: "Admin",
    description: 'تعيين القناة التي سيتم إرسال إشعارات المهام والإنجازات فيها.',

    async execute(interactionOrMessage, args) {
        // تحديد نوع الأمر (سلاش أو رسالة)
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, member, user, channel;

        // تجهيز المتغيرات بناءً على المصدر
        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            member = interaction.member;
            user = interaction.user;
            channel = interaction.options.getChannel('القناة');
            await interaction.deferReply({ ephemeral: true });
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            member = message.member;
            user = message.author;
            channel = message.mentions.channels.first() || guild.channels.cache.get(args[0]);
        }

        const sql = client.sql;

        // دالة موحدة للرد
        const reply = async (content, embeds = []) => {
            const payload = { content: content || null, embeds: embeds, ephemeral: true };
            if (isSlash) return interaction.editReply(payload);
            return message.reply(payload);
        };

        // --- 1. التحقق من الصلاحيات (للعضو) ---
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return reply('❌ | عذراً، أنت بحاجة إلى صلاحية `ManageGuild` (إدارة السيرفر) لاستخدام هذا الأمر.');
        }

        // --- 2. التحقق من القناة ---
        if (!channel) {
            return reply('❌ | يرجى تحديد قناة صحيحة.\nمثال: `-setquestchannel #quests`');
        }
        
        if (!channel.isTextBased()) {
            return reply('❌ | يجب أن تكون القناة المختارة قناة نصية.');
        }

        // --- 3. التحقق من صلاحيات البوت في القناة المختارة ---
        const botPerms = channel.permissionsFor(guild.members.me);
        if (!botPerms.has([PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.AttachFiles])) {
            return reply(`⚠️ | ليس لدي صلاحيات كافية في القناة ${channel}.\nتأكد من إعطائي الصلاحيات التالية في إعدادات القناة:\n- \`View Channel\`\n- \`Send Messages\`\n- \`Attach Files\``);
        }

        try {
            // --- 4. عمليات قاعدة البيانات ---
            
            // أ. إنشاء الجدول إذا لم يكن موجوداً
            sql.prepare(`CREATE TABLE IF NOT EXISTS settings (guild TEXT PRIMARY KEY, questChannelID TEXT)`).run();
            
            // ب. محاولة إضافة العمود (للنسخ القديمة من قاعدة البيانات)
            try {
                sql.prepare("ALTER TABLE settings ADD COLUMN questChannelID TEXT;").run();
            } catch (e) {
                // نتجاهل الخطأ إذا كان العمود موجوداً بالفعل
            }

            // ج. الحفظ أو التحديث (Upsert)
            // نستخدم INSERT OR REPLACE لضمان وجود سجل واحد فقط لكل سيرفر
            const stmt = sql.prepare("INSERT OR REPLACE INTO settings (guild, questChannelID) VALUES (?, ?)");
            
            // إذا كان هناك إعدادات أخرى في الجدول وتريد الحفاظ عليها، نستخدم UPDATE بدلاً من REPLACE الكامل
            // الطريقة الآمنة جداً للحفاظ على البيانات الأخرى:
            const existingCheck = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
            if (existingCheck) {
                sql.prepare("UPDATE settings SET questChannelID = ? WHERE guild = ?").run(channel.id, guild.id);
            } else {
                sql.prepare("INSERT INTO settings (guild, questChannelID) VALUES (?, ?)").run(guild.id, channel.id);
            }

            // --- 5. الرد بالنجاح ---
            const successEmbed = new EmbedBuilder()
                .setColor(0x57F287) // لون أخضر
                .setTitle('✅ تم الحفظ بنجاح')
                .setDescription(`تم تعيين قناة المهام والإنجازات إلى: ${channel}\nسيتم إرسال جميع التنبيهات هناك.`)
                .setFooter({ text: `بواسطة: ${user.tag}`, iconURL: user.displayAvatarURL() })
                .setTimestamp();
            
            await reply(null, [successEmbed]);

            // --- 6. إرسال رسالة ترحيبية للقناة الهدف ---
            const welcomeEmbed = new EmbedBuilder()
                .setColor(0xFEE75C) // لون ذهبي
                .setTitle('🏆 قناة الإنجازات والمهام')
                .setDescription('**مرحباً بكم!**\nتم تعيين هذه القناة رسمياً لاستقبال:\n\n📜 **المهام اليومية والأسبوعية**\n🎖️ **إعلانات الإنجازات والأوسمة**\n\nشدوا حيلكم يا أبطال! 💪')
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setTimestamp();

            await channel.send({ embeds: [welcomeEmbed] });

        } catch (err) {
            console.error("[SetQuestChannel Error]", err);
            return reply('❌ | حدث خطأ غير متوقع في قاعدة البيانات. يرجى مراجعة الكونسول.');
        }
    }
};
