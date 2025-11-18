const { EmbedBuilder, PermissionsBitField } = require("discord.js");

module.exports = {
name: 'setlevelmessage',
aliases: ['setlvlmsg'],
category: "Leveling",
description: "Customize the level up embed message.",
cooldown: 5,
async execute(message, args) {

const sql = message.client.sql; 

if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
return message.reply(`You do not have permission to use this command!`);
}

const subCommand = args[0] ? args[0].toLowerCase() : null;
const guildId = message.guild.id;

const setStmt = sql.prepare("INSERT OR REPLACE INTO settings (guild, lvlUpTitle, lvlUpDesc, lvlUpImage, lvlUpColor, lvlUpMention) VALUES (@guild, @lvlUpTitle, @lvlUpDesc, @lvlUpImage, @lvlUpColor, @lvlUpMention);");
const getStmt = sql.prepare("SELECT * FROM settings WHERE guild = ?");

let settings = getStmt.get(guildId);
if (!settings) {
sql.prepare("INSERT INTO settings (guild) VALUES (?)").run(guildId);
settings = getStmt.get(guildId);
}

if (!subCommand) {
const embed = new EmbedBuilder()
.setTitle("Level Message Settings")
.setColor("Blue")
.setDescription("Use these sub-commands to customize the level up message:\n\n" +
"`setlevelmessage empire` - Sets the cool Empire style embed.\n" +
"`setlevelmessage title <text>` - Set embed title.\n" +
"`setlevelmessage desc <text>` - Set embed description (use `\\n` for new line).\n" +
"`setlevelmessage image <url>` - Set embed image.\n" +
"`setlevelmessage color <hex>` - Set embed color (e.g., #FF0000).\n" +
"`setlevelmessage mention <on/off>` - Toggle user mention outside embed.\n" +
"`setlevelmessage show` - Show the current custom embed.\n" +
"`setlevelmessage reset` - Reset to default simple message.");
return message.channel.send({ embeds: [embed] });
}

if (subCommand === 'empire') {
const title = "✶ اشـعـار ارتـقـاء";
const desc = "╭⭒★︰ <a:wi:1435572304988868769> {member} <a:wii:1435572329039007889>\\n✶ مبارك صعودك في سُلّم الإمبراطورية\\n★ فقد كـسرت حـاجـز الـمستوى〃{level_old}〃\\n★ وبلغـت المسـتـوى الـ 〃{level}〃\\n★ وتعاظم شأنك بين جموع الرعية\\n فامضِ قُدمًا نحو المجد <a:HypedDance:1435572391190204447>!";
const image = "https://media.discordapp.net/attachments/1394261509537927258/1418969189531516979/lvl_up.gif?ex=690c09c9&is=690ab849&hm=07cd9fec3290c65803781b95c9925f1b1478e7a0622835b2c466a04e39e8cf2f&=";
const color = "Random";
const mention = 1;

settings.lvlUpTitle = title;
settings.lvlUpDesc = desc;
settings.lvlUpImage = image;
settings.lvlUpColor = color;
settings.lvlUpMention = mention;

setStmt.run(settings);
return message.reply("Level up message has been set to the 'Empire' style!");
}

if (subCommand === 'title') {
const text = args.slice(1).join(' ');
if (!text) return message.reply("Please provide text for the title.");
settings.lvlUpTitle = text;
setStmt.run(settings);
return message.reply(`Level up title set to: **${text}**`);
}

if (subCommand === 'desc') {
const text = args.slice(1).join(' ');
if (!text) return message.reply("Please provide text for the description. Use `\\n` for new lines.");
settings.lvlUpDesc = text;
setStmt.run(settings);
return message.reply(`Level up description has been set.`);
}

if (subCommand === 'image') {
const url = args[1];
if (!url) return message.reply("Please provide a valid image URL.");
settings.lvlUpImage = url;
setStmt.run(settings);
return message.reply(`Level up image has been set.`);
}

if (subCommand === 'color') {
const color = args[1];
if (!color || !/^#[0-9A-F]{6}$/i.test(color)) return message.reply("Please provide a valid hex color (e.g., `#FF0000`).");
settings.lvlUpColor = color;
setStmt.run(settings);
return message.reply(`Level up color has been set to **${color}**.`);
}

if (subCommand === 'mention') {
const toggle = args[1] ? args[1].toLowerCase() : null;
if (toggle === 'on') {
settings.lvlUpMention = 1;
setStmt.run(settings);
return message.reply("User mention is now **ON**.");
} else if (toggle === 'off') {
settings.lvlUpMention = 0;
setStmt.run(settings);
return message.reply("User mention is now **OFF**.");
} else {
return message.reply("Please use `on` or `off`.");
}
}

if (subCommand === 'reset') {
settings.lvlUpTitle = null;
settings.lvlUpDesc = null;
settings.lvlUpImage = null;
settings.lvlUpColor = null;
settings.lvlUpMention = 1;
setStmt.run(settings);
return message.reply("Level up message has been reset to the default simple text.");
}

if (subCommand === 'show') {
if (!settings.lvlUpTitle) {
return message.reply("No custom level up message is set. Using default simple text.");
}

const member = message.member;
const level = 10;
const level_old = 9;
const xp = 0;
const totalXP = 12345;

function antonymsLevelUp(string) {
return string
.replace(/{member}/gi, `${member}`)
.replace(/{level}/gi, `${level}`)
.replace(/{level_old}/gi, `${level_old}`)
.replace(/{xp}/gi, `${xp}`)
.replace(/{totalXP}/gi, `${totalXP}`);
}

const embed = new EmbedBuilder()
.setTitle(antonymsLevelUp(settings.lvlUpTitle))
.setDescription(antonymsLevelUp(settings.lvlUpDesc.replace(/\\n/g, '\n')))
.setColor(settings.lvlUpColor || "Random")
.setTimestamp();

if (settings.lvlUpImage) {
embed.setImage(antonymsLevelUp(settings.lvlUpImage));
}

let content = (settings.lvlUpMention == 1) ? `${member}` : null;

return message.channel.send({ content: content, embeds: [embed] });
}

}
};