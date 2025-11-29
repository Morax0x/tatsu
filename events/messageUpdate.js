const { Events } = require("discord.js");

// Spam prevention: prevents the same user from getting points twice in a minute
const treeCooldowns = new Set();

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        // 1. Ensure full message is loaded (if partial)
        if (newMessage.partial) {
            try {
                await newMessage.fetch();
            } catch (e) {
                return; 
            }
        }
        if (!newMessage.guild) return;

        // 2. Get Database Connection
        const client = newMessage.client;
        const sql = client.sql;
        
        // Safety Check: Ensure DB is open
        if (!sql || !sql.open) return; 

        try {
            // 3. Get Server Settings
            const settings = sql.prepare("SELECT treeChannelID, treeBotID, treeMessageID FROM settings WHERE guild = ?").get(newMessage.guild.id);
            
            // If system not enabled (no channel set), exit
            if (!settings || !settings.treeChannelID) return;

            // 4. Validate Channel and Bot Author
            if (newMessage.channel.id !== settings.treeChannelID) return;
            if (!newMessage.author.bot) return; // Must be a bot message

            // Optional: Check specific bot ID if set
            if (settings.treeBotID && newMessage.author.id !== settings.treeBotID) return;


            // 5. Aggregate Content (Description + Title + Content + Fields) to find mentions
            let fullContent = (newMessage.content || "") + " ";
            
            if (newMessage.embeds.length > 0) {
                const embed = newMessage.embeds[0];
                fullContent += (embed.description || "") + " ";
                fullContent += (embed.title || "") + " ";
                
                // Check fields as mentions are sometimes there
                if (embed.fields && embed.fields.length > 0) {
                    embed.fields.forEach(field => {
                        fullContent += (field.value || "") + " ";
                    });
                }
            }

            // 6. Keywords to identify tree messages
            const validPhrases = [
                "watered the tree", 
                "سقى الشجرة", 
                "Watered",
                "your tree",
                "قام بسقاية",
                "level up", // Sometimes leveling up the tree counts as watering
                "tree grew",
                "has watered"
            ];

            const isTreeMessage = validPhrases.some(phrase => fullContent.toLowerCase().includes(phrase.toLowerCase()));

            if (isTreeMessage) {
                // 7. Find first user mention (User ID)
                // Matches <@!123> or <@123>
                const match = fullContent.match(/<@!?(\d+)>/);
                
                if (match && match[1]) {
                    const userID = match[1];
                    
                    // Ignore if mention is the bot itself or the message author
                    if (userID === client.user.id || userID === newMessage.author.id) return;

                    // 🛑 Cooldown (1 minute per person)
                    if (treeCooldowns.has(userID)) return;
                    
                    treeCooldowns.add(userID);
                    setTimeout(() => treeCooldowns.delete(userID), 60000); 

                    const guildID = newMessage.guild.id;

                    console.log(`[TREE TRACKER] ✅ Water detected for user: ${userID}`);

                    // 8. Calculate Stats using central function
                    if (client.incrementQuestStats) {
                        // 1 means one watering action
                        await client.incrementQuestStats(userID, guildID, 'water_tree', 1);
                    } else {
                        console.error("[TREE ERROR] incrementQuestStats function missing in client!");
                    }
                }
            }
        } catch (err) {
            // Silently ignore DB connection errors during restarts
            if (!err.message.includes('database connection is not open')) {
                console.error("[Tree Update Error]", err);
            }
        }
    },
};
