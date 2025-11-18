const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ApplicationCommandOptionType } = require("discord.js");
const { loadRoleSettings, setGhostRole } = require("../../handlers/reaction-role-handler.js");

function cleanRoleIds(input) {
    if (!input) return [];
    return input.split(/[\s,]+/)
        .map(id => id.trim())
        .filter(id => id.length > 0 && !isNaN(id));
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('اعدادات-الرولات')
        .setDescription('تحديد خصائص الرول (مضاد، قابل للإزالة) أو رول الروح.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles)
        .addSubcommand(sub => sub
            .setName('اعدادات-رول')
            .setDescription('تحديد خصائص الرول (مضاد، قابل للإزالة).')
            .addRoleOption(opt => opt.setName('الرول_المستهدف').setDescription('الرول المراد إعداد خصائصه.').setRequired(true))
            .addStringOption(opt => opt.setName('آيديات_مضادة').setDescription('آيديات الرولات التي ستُزال (فواصل، فراغات).').setRequired(false))
            .addBooleanOption(opt => opt.setName('قابل_للإزالة').setDescription('هل يمكن للعضو إزالة الرول ذاتيًا؟ (الافتراضي: نعم)').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('رول-الروح')
            .setDescription('يحدد رول الروح الهائمة الذي يُمنح في حالة تضارب الرتب.')
            .addRoleOption(opt => opt.setName('آيدي_الرول').setDescription('الرول الذي سيُمنح عند التضارب.').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('عرض-الاعدادات')
            .setDescription('يعرض جميع إعدادات الرولات المضادة والقابلة للإزالة حالياً في إيمبد.')
        ),

    name: 'rr-settings', // (اسم احتياطي للبريفكس)
    category: "Admin",

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
            return interactionOrMessage.reply("هذا الأمر متاح كأمر سلاش (/) فقط.");
        }

        const sql = client.sql;

        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return interaction.editReply({ content: '❌ ليس لديك صلاحية إدارة الأدوار.' });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'اعدادات-رول') {
            const role = interaction.options.getRole('الرول_المستهدف');
            const antiRolesIdsStr = interaction.options.getString('آيديات_مضادة') || '';
            const removable = interaction.options.getBoolean('قابل_للإزالة') ?? true;

            const antiRolesList = cleanRoleIds(antiRolesIdsStr);

            if (antiRolesList.includes(role.id)) {
                return interaction.editReply({ content: "❌ لا يمكن تحديد الرول المضاد كـ الرول نفسه." });
            }

            const antiRolesStr = antiRolesList.join(',');
            const isRemovableInt = removable ? 1 : 0;

            await sql.prepare(`
                INSERT INTO role_settings (role_id, anti_roles, is_removable)
                VALUES (?, ?, ?)
                ON CONFLICT(role_id) DO UPDATE SET
                    anti_roles = excluded.anti_roles,
                    is_removable = excluded.is_removable
            `).run(role.id, antiRolesStr, isRemovableInt);

            await loadRoleSettings(sql, client.antiRolesCache);

            const embed = new EmbedBuilder()
                .setTitle(`✅ تم تحديث خصائص الرول ${role.name}`)
                .addFields(
                    { name: "الرولات المضادة:", value: antiRolesList.length > 0 ? antiRolesList.map(r_id => `<@&${r_id}>`).join(', ') : "لا يوجد", inline: false },
                    { name: "قابل للإزالة ذاتيًا:", value: removable ? "نعم" : "لا (رول ثابت)", inline: false }
                )
                .setColor('Green');

            return interaction.editReply({ embeds: [embed] });

        } else if (subcommand === 'رول-الروح') {
            const role = interaction.options.getRole('آيدي_الرول');
            setGhostRole(role.id); // (تحديث المتغير العام في الـ Handler)
            return interaction.editReply({ 
                content: `✅ تم تعيين **رول الروح الهائمة** بنجاح إلى: ${role}`
            });

        } else if (subcommand === 'عرض-الاعدادات') {
            const rows = await sql.prepare("SELECT role_id, anti_roles, is_removable FROM role_settings").all();

            if (rows.length === 0) {
                return interaction.editReply({ 
                    content: 'ℹ️ لا توجد إعدادات رولات مضادة أو ثابتة مسجلة حالياً.'
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('📜 إعدادات الرولات المضادة والحالة الحالية')
                .setColor('#FF9900') 
                .setFooter({ text: `عدد الرولات المسجلة: ${rows.length}` });

            let fields = [];

            for (const row of rows) {
                const role = interaction.guild.roles.cache.get(row.role_id);
                if (!role) continue; 

                const antiRolesList = row.anti_roles ? row.anti_roles.split(',').map(id => id.trim()).filter(id => id.length > 0) : [];
                const isRemovable = row.is_removable === 1 ? '✅ نعم' : '🔒 لا (رول ثابت)';

                const antiRolesDisplay = antiRolesList.length > 0
                    ? antiRolesList.map(id => `<@&${id}>`).join('\n') 
                    : 'لا يوجد رولات مضادة.';

                const fieldValue = `**قابل للإزالة:** ${isRemovable}\n**الرتب المضادة:**\n${antiRolesDisplay}`;

                fields.push({
                    name: `✥ رول: ${role.name}`,
                    value: fieldValue, 
                    inline: false
                });
            }

            const embedLimit = 10; 

            if (fields.length > embedLimit) {
                let embedsToSend = [];
                for (let i = 0; i < fields.length; i += embedLimit) {
                    const currentFields = fields.slice(i, i + embedLimit);
                    const newEmbed = EmbedBuilder.from(embed)
                        .setFields(currentFields)
                        .setFooter({ text: `صفحة ${Math.floor(i / embedLimit) + 1}/${Math.ceil(fields.length / embedLimit)} | إجمالي ${rows.length} رول مسجل` })
                        .setTitle(i === 0 ? embed.data.title : `${embed.data.title} (تابع)`);
                    embedsToSend.push(newEmbed);
                }
                await interaction.editReply({ embeds: [embedsToSend[0]] });
                for (let i = 1; i < embedsToSend.length; i++) {
                    await interaction.followUp({ embeds: [embedsToSend[i]], ephemeral: true });
                }
                return;
            } else {
                embed.setFields(fields);
                return interaction.editReply({ embeds: [embed] });
            }
        }
    }
};