const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, PermissionsBitField, MessageFlags, SlashCommandBuilder, Colors } = require("discord.js");
const shopItems = require('../../json/shop-items.json');
// ( 🌟 تم حذف config.json لأنه غير مستخدم هنا )

const emojiMap = new Map([
    ['upgrade_weapon', '⚔️'],
    ['upgrade_skill', '<:goldgem:979098126591868928>'],
    ['exchange_xp', '<a:levelup:1437805366048985290>'],
    ['personal_guard_1d', '<:FBI:1439666820016508929>'],
    ['streak_shield', '<:Shield:1437804676224516146>'],
    ['xp_buff_1d_3', '<:oboost:1439665972587003907>'],
    ['xp_buff_1d_7', '<:sboosting:1439665969864773663>'],
    ['xp_buff_2d_10', '<:gboost:1439665966354268201>'],
    ['vip_role_3d', '<a:JaFaster:1435572430042042409>'],
    ['discord_effect_5', '<a:HypedDance:1435572391190204447>'],
    ['discord_effect_10', '<a:NekoCool:1435572459276337245>'],
    ['nitro_basic', '<a:Nitro:1437812292468084880>'],
    ['nitro_gaming', '<a:Nitro:1437812292468084880>'],
    ['change_race', '🧬']
]);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('متجر')
        .setDescription('يعرض المتجر، أو يقوم بإعداده إذا كنت إدارياً.'),

    name: 'shop',
    aliases: ['متجر', 'setup-shop'],
    category: "Admin", // ( تم نقله للادمن لأنه ينشر اللوحة )
    description: 'يقوم بنشر رسالة المتجر التفاعلية (للإدارة) أو يوجهك للمجر.',

    async execute(interactionOrMessage, args) {

        // --- ( 🌟 تم إصلاح هذا السطر 🌟 ) ---
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        // ---------------------------------

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

        const replyEphemeral = async (payload) => {
            if (typeof payload === 'string') payload = { content: payload };
            payload.ephemeral = true;

            if (isSlash) {
                return interaction.editReply(payload);
            } else {
                payload.flags = MessageFlags.Ephemeral;
                return message.reply(payload);
            }
        };

        const sql = client.sql;

        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {

            const guildId = guild.id;
            sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(guildId);
            const settings = sql.prepare("SELECT shopChannelID FROM settings WHERE guild = ?").get(guildId);

            if (!settings || !settings.shopChannelID) {
                return replyEphemeral({
                    content: `❌ لم يقم أي إداري بإعداد المتجر في هذا السيرفر بعد.`
                });
            }

            return replyEphemeral({
                content: `✥ تـوجـه الى قنـاة المـتجـر: <#${settings.shopChannelID}>`
            });
        }

        const selectOptions = shopItems.map(item => {
            const priceDesc = item.id === 'exchange_xp'
                ? item.description
                : `السعر: ${item.price.toLocaleString()} مورا`;

            return {
                label: item.name,
                description: priceDesc,
                value: item.id,
                emoji: emojiMap.get(item.id) || item.emoji || '🛍️'
            };
        });

        const selectMenuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('shop_select_item')
                .setPlaceholder('اختر عنصراً لعرض التفاصيل والشراء...')
                .addOptions(selectOptions)
        );

        const descriptionText = `
✥ في هذا المتجر العريق، يمكنك جمع المـورا من الكازينو واستخدامها لاستبدالها بـ جوائز لا تتوفر إلا في ساحات الإمبراطورية<a:HypedDance:1435572391190204447>! 

✬ اشترِ مستويات إضافية لتتقدم في السيرفر وتزداد مكانتك بين النخبة , استأجر حارس شخصي لحماية ممتلكاتك احصل على دروع الستريك <:Shield:1437804676224516146> استمتع بـ تعزيز خبرة لتزيد مستواك ونقاط الاتش بي <a:levelup:1437805366048985290> احصل على رتب خاصة تمنحك الهيبة والتألق بين الأعضاء، واجعل اسمك يسطع في كل ركن من أركان الإمبراطورية <a:JaFaster:1435572430042042409>

✬ حتى يمكنك اقتناء نيترو او ايفكتات لملفك الشخصي من متجر الامبراطورية 

✦ كل ما ترغب به متاح في متجر الإمبراطورية، فقط اجمع، استبدل، وتألق <:mora:1435647151349698621>!

✦ لمعرفة طريقة اللعب وجمع المورا توجه الكازينو واكتب \`اوامر\` <:mora:1435647151349698621>
        `;

        const mainEmbed = new EmbedBuilder()
            .setTitle('متجر الامبراطورية <:mora:1435647151349698621>')
            .setURL('https://top.gg/discord/servers/732581242885705728/vote')
            .setDescription(descriptionText)
            .setColor(Colors.Aqua)
            // --- ( 🌟 تم إصلاح هذا السطر 🌟 ) ---
            .setImage('https://i.postimg.cc/8zSqmByp/7.webp'); 
            // ---------------------------------

        await channel.send({ embeds: [mainEmbed], components: [selectMenuRow] });

        try {
            const guildId = guild.id;
            const channelId = channel.id;

            sql.prepare("INSERT OR IGNORE INTO settings (guild) VALUES (?)").run(guildId);
            sql.prepare("UPDATE settings SET shopChannelID = ? WHERE guild = ?").run(channelId, guildId);

            if (isSlash) {
                await interaction.editReply({ content: '✅ تم نشر لوحة المتجر وحفظها كمتجر رسمي لهذا السيرفر.', ephemeral: true });
            } else {
                await message.reply({ content: '✅ تم نشر لوحة المتجر وحفظها كمتجر رسمي لهذا السيرفر.'});
            }

        } catch (err) {
            console.error("خطأ في حفظ قناة المتجر:", err);
            await replyEphemeral({ content: '⚠️ تم نشر المتجر، ولكن حدث خطأ أثناء حفظه كمتجر رسمي للسيرفر.' });
        }
    }
};