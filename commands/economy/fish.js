const { SlashCommandBuilder, EmbedBuilder, Colors } = require("discord.js");
const path = require('path');

// استخدام المسار الجذري
const rootDir = process.cwd();
const fishItems = require(path.join(rootDir, 'json', 'fish-items.json'));
const rodsConfig = require(path.join(rootDir, 'json', 'fishing-rods.json'));

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صيد')
        .setDescription('الذهاب للصيد وكسب الأسماك.'),

    name: 'fish',
    aliases: ['صيد', 'ص', 'fishing'],
    category: "Economy",
    description: "صيد الأسماك وبيعها.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guild = isSlash ? interactionOrMessage.guild : interactionOrMessage.guild;
        const client = interactionOrMessage.client;
        const sql = client.sql;

        const reply = async (payload) => {
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return interactionOrMessage.editReply(payload);
                return interactionOrMessage.reply({ ...payload, ephemeral: false }); 
            }
            return interactionOrMessage.reply(payload);
        };

        if (isSlash) await interactionOrMessage.deferReply();

        try {
            // 1. جلب بيانات المستخدم
            let userData = client.getLevel.get(user.id, guild.id);
            
            if (!userData) {
                userData = { 
                    ...client.defaultData, 
                    user: user.id, 
                    guild: guild.id, 
                    rodLevel: 1, 
                    lastFish: 0 
                };
                client.setLevel.run(userData);
            }

            const currentRodLevel = userData.rodLevel || 1;
            const currentRod = rodsConfig.find(r => r.level === currentRodLevel) || rodsConfig[0];

            // 2. التحقق من الكولداون
            const cooldown = currentRod.cooldown; 
            const lastFish = userData.lastFish || 0;
            const now = Date.now();

            if (now - lastFish < cooldown) {
                const remaining = lastFish + cooldown - now;
                const hours = Math.floor(remaining / 3600000);
                const minutes = Math.floor((remaining % 3600000) / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                
                let timeString = "";
                if (hours > 0) timeString += `${hours} ساعة و `;
                if (minutes > 0) timeString += `${minutes} دقيقة و `;
                timeString += `${seconds} ثانية`;

                return reply({ content: `⏳ | السنارة تحتاج لراحة! يمكنك الصيد مجدداً بعد: **${timeString}**` });
            }

            // 3. عملية الصيد
            const fishCount = Math.floor(Math.random() * currentRod.max_fish) + 1;
            
            let caughtFish = [];
            let totalValue = 0;

            for (let i = 0; i < fishCount; i++) {
                const roll = Math.random() * 100 + (currentRod.luck_bonus || 0);
                let rarity = 1;
                if (roll > 95) rarity = 6;       
                else if (roll > 85) rarity = 5;  
                else if (roll > 70) rarity = 4;  
                else if (roll > 50) rarity = 3;  
                else if (roll > 30) rarity = 2;  
                else rarity = 1;                 

                if (rarity > currentRod.max_rarity) rarity = currentRod.max_rarity;

                const possibleFish = fishItems.filter(f => f.rarity === rarity);
                if (possibleFish.length > 0) {
                    const fish = possibleFish[Math.floor(Math.random() * possibleFish.length)];
                    
                    sql.prepare(`
                        INSERT INTO user_portfolio (guildID, userID, itemID, quantity) 
                        VALUES (?, ?, ?, 1) 
                        ON CONFLICT(guildID, userID, itemID) 
                        DO UPDATE SET quantity = quantity + 1
                    `).run(guild.id, user.id, fish.id);

                    caughtFish.push(fish);
                    totalValue += fish.price;
                }
            }

            // 4. تحديث البيانات (المورا + الوقت)
            userData.lastFish = now;
            userData.mora = (userData.mora || 0) + totalValue; // ( 🌟 هنا الإضافة المهمة 🌟 )
            
            client.setLevel.run(userData); 

            // 5. إرسال النتيجة
            const summary = {};
            caughtFish.forEach(f => {
                summary[f.name] = summary[f.name] ? { count: summary[f.name].count + 1, emoji: f.emoji, rarity: f.rarity } : { count: 1, emoji: f.emoji, rarity: f.rarity };
            });

            let description = "**✥ حـصـلـت علـى:**\n";
            for (const [name, info] of Object.entries(summary)) {
                let rarityStar = "";
                if (info.rarity >= 5) rarityStar = "🌟";
                else if (info.rarity === 4) rarityStar = "✨";

                description += `- **${info.count}x** ${info.emoji} ${name} ${rarityStar}\n`;
            }
            
            description += `\n💰 **القيمة التقديرية:** \`${totalValue.toLocaleString()}\` مورا (تمت إضافتها لرصيدك)`;

            const embed = new EmbedBuilder()
                .setTitle(`🎣 رحلة صيد ناجحة!`)
                .setDescription(description)
                .setColor(Colors.Aqua)
                .setFooter({ text: `السنارة: ${currentRod.name} (Lvl ${currentRod.level})` })
                .setThumbnail('https://i.postimg.cc/Wz0g0Zg0/fishing.png');

            return reply({ embeds: [embed] });

        } catch (err) {
            console.error("[Fishing Error]", err);
            return reply({ content: "❌ حدث خطأ أثناء الصيد." });
        }
    }
};
