// ملف: events/messageUpdate.js
const { Events } = require("discord.js");

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (!newMessage.guild || !newMessage.author) return;

        const client = newMessage.client;
        const sql = client.sql;

        try {
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(newMessage.guild.id);

            if (settings && settings.treeBotID && settings.treeChannelID && settings.treeMessageID &&
                newMessage.author.id === settings.treeBotID &&
                newMessage.channel.id === settings.treeChannelID &&
                newMessage.id === settings.treeMessageID) {

                if (newMessage.embeds && newMessage.embeds.length > 0) {
                    const embedDesc = newMessage.embeds[0].description;
                    if (embedDesc) {
                        const match = embedDesc.match(/<@!?(\d+)>/);

                        if (match && match[1]) {
                            const userID = match[1];
                            console.log(`[Tree Water Quest] Found first user ID: ${userID}`);

                            let oldUserID = null;
                            if (oldMessage && oldMessage.embeds && oldMessage.embeds.length > 0 && oldMessage.embeds[0].description) {
                                const oldEmbedDesc = oldMessage.embeds[0].description;
                                const oldMatch = oldEmbedDesc.match(/<@!?(\d+)>/);
                                if (oldMatch && oldMatch[1]) {
                                    oldUserID = oldMatch[1];
                                }
                            }

                            if (userID !== oldUserID) {
                                console.log(`[Tree Water Quest] User ID ${userID} is new. Incrementing stats.`);
                                await client.incrementQuestStats(userID, newMessage.guild.id, 'water_tree');
                            } else {
                                console.log(`[Tree Water Quest] User ID ${userID} is the same as old message. Ignoring.`);
                            }
                        } else {
                            console.log("[Tree Water Quest] Embed updated, but no user mention was found.");
                        }
                    }
                }
            }
        } catch (err) {
            console.error("[Tree Water Quest Error - MessageUpdate]", err);
        }
    },
};