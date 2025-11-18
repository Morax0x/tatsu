const { EmbedBuilder, PermissionsBitField } = require("discord.js");

async function sendLevelUpMessage(interaction, member, newLevel, oldLevel, xpData, sql) {
     try {
         let customSettings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(interaction.guild.id);
         let channelLevel = sql.prepare("SELECT * FROM channel WHERE guild = ?").get(interaction.guild.id);
         let levelUpContent = null;
         let embed;

         if (customSettings && customSettings.lvlUpTitle) {
             function antonymsLevelUp(string) {
                 return string.replace(/{member}/gi, `${member}`).replace(/{level}/gi, `${newLevel}`).replace(/{level_old}/gi, `${oldLevel}`).replace(/{xp}/gi, `${xpData.xp}`).replace(/{totalXP}/gi, `${xpData.totalXP}`);
             }
             embed = new EmbedBuilder().setTitle(antonymsLevelUp(customSettings.lvlUpTitle)).setDescription(antonymsLevelUp(customSettings.lvlUpDesc.replace(/\\n/g, '\n'))).setColor(customSettings.lvlUpColor || "Random").setTimestamp();
             if (customSettings.lvlUpImage) { embed.setImage(antonymsLevelUp(customSettings.lvlUpImage)); }
             if (customSettings.lvlUpMention == 1) { levelUpContent = `${member}`; }
         } else {
             embed = new EmbedBuilder().setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) }).setColor("Random").setDescription(`**Congratulations** ${member}! You have now leveled up to **level ${newLevel}**`);
         }

         let channelToSend = interaction.channel;
         if (channelLevel && channelLevel.channel !== "Default") {
               channelToSend = interaction.guild.channels.cache.get(channelLevel.channel) || interaction.channel;
         }
         if (!channelToSend) return;

         const permissionFlags = channelToSend.permissionsFor(interaction.guild.members.me);
         if (permissionFlags.has(PermissionsBitField.Flags.SendMessages) && permissionFlags.has(PermissionsBitField.Flags.ViewChannel)) {
             await channelToSend.send({ content: levelUpContent, embeds: [embed] }).catch(e => console.error(`[LevelUp Send Error]: ${e.message}`));
         }
    } catch (err) {
         console.error(`[LevelUp Error]: ${err.message}`);
    }
}

module.exports = {
    sendLevelUpMessage
};