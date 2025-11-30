const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const SQLite = require("better-sqlite3");
const { setupDatabase } = require("../../database-setup.js"); // تأكد أن المسار صحيح

// 🔒 ايدي المالك
const OWNER_ID = "1145327691772481577";

// 📂 تحديد المسارات
const rootDir = process.cwd();
const DB_PATH = path.join(rootDir, 'mainDB.sqlite');
const WAL_PATH = path.join(rootDir, 'mainDB.sqlite-wal');
const SHM_PATH = path.join(rootDir, 'mainDB.sqlite-shm');
const TEMP_PATH = path.join(rootDir, 'temp_upload.sqlite'); 

// (دالة إعادة تهيئة قاعدة البيانات دون ريستارت)
function reloadDatabase(client) {
    // 1. فتح اتصال جديد
    const sql = new SQLite(DB_PATH);
    sql.pragma('journal_mode = WAL');
    
    // 2. تحديث الجداول
    setupDatabase(sql);
    
    // 3. ربط القاعدة الجديدة بالعميل
    client.sql = sql;

    // 4. إعادة تعريف الـ Prepared Statements (مهم جداً لكي لا يتوقف البوت)
    client.getLevel = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?");
    client.setLevel = sql.prepare("INSERT OR REPLACE INTO levels (user, guild, xp, level, totalXP, mora, lastWork, lastDaily, dailyStreak, bank, lastInterest, totalInterestEarned, hasGuard, guardExpires, lastCollected, totalVCTime, lastRob, lastGuess, lastRPS, lastRoulette, lastTransfer, lastDeposit, shop_purchases, total_meow_count, boost_count, lastPVP, lastFarmYield) VALUES (@user, @guild, @xp, @level, @totalXP, @mora, @lastWork, @lastDaily, @dailyStreak, @bank, @lastInterest, @totalInterestEarned, @hasGuard, @guardExpires, @lastCollected, @totalVCTime, @lastRob, @lastGuess, @lastRPS, @lastRoulette, @lastTransfer, @lastDeposit, @shop_purchases, @total_meow_count, @boost_count, @lastPVP, @lastFarmYield);");

    client.getDailyStats = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?");
    client.setDailyStats = sql.prepare("INSERT OR REPLACE INTO user_daily_stats (id, userID, guildID, date, messages, images, stickers, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps) VALUES (@id, @userID, @guildID, @date, @messages, @images, @stickers, @reactions_added, @replies_sent, @mentions_received, @vc_minutes, @water_tree, @counting_channel, @meow_count, @streaming_minutes, @disboard_bumps);");
    client.getWeeklyStats = sql.prepare("SELECT * FROM user_weekly_stats WHERE id = ?");
    client.setWeeklyStats = sql.prepare("INSERT OR REPLACE INTO user_weekly_stats (id, userID, guildID, weekStartDate, messages, images, stickers, reactions_added, replies_sent, mentions_received, vc_minutes, water_tree, counting_channel, meow_count, streaming_minutes, disboard_bumps) VALUES (@id, @userID, @guildID, @weekStartDate, @messages, @images, @stickers, @reactions_added, @replies_sent, @mentions_received, @vc_minutes, @water_tree, @counting_channel, @meow_count, @streaming_minutes, @disboard_bumps);");
    client.getTotalStats = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?");
    client.setTotalStats = sql.prepare("INSERT OR REPLACE INTO user_total_stats (id, userID, guildID, total_messages, total_images, total_stickers, total_reactions_added, total_replies_sent, total_mentions_received, total_vc_minutes, total_disboard_bumps) VALUES (@id, @userID, @guildID, @total_messages, @total_images, @total_stickers, @total_reactions_added, @total_replies_sent, @total_mentions_received, @total_vc_minutes, @total_disboard_bumps);");
    client.getQuestNotif = sql.prepare("SELECT * FROM quest_notifications WHERE id = ?");
    client.setQuestNotif = sql.prepare("INSERT OR REPLACE INTO quest_notifications (id, userID, guildID, dailyNotif, weeklyNotif, achievementsNotif, levelNotif) VALUES (@id, @userID, @guildID, @dailyNotif, @weeklyNotif, @achievementsNotif, @levelNotif);");

    console.log("[System] Database Hot-Swapped Successfully!");
}

module.exports = {
    name: 'admin',
    aliases: ['do', 'up', 'sss'],
    description: 'أوامر إدارة قاعدة البيانات للمالك فقط',
    category: "Admin",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        let sql = client.sql;
        
        // استخراج الأمر الفرعي (up, do, sss)
        const prefix = args.prefix || "-";
        const commandName = message.content.split(" ")[0].slice(prefix.length).toLowerCase();

        // ============================================================
        // 📥 أمر UP: رفع واستبدال قاعدة البيانات (بدون ريستارت)
        // ============================================================
        if (commandName === 'up') {
            const attachment = message.attachments.first();
            
            if (!attachment) return message.reply("⚠️ **أرفق ملف قاعدة البيانات.**");
            if (!attachment.name.endsWith('.sqlite')) return message.reply("⚠️ **الملف يجب أن يكون بصيغة `.sqlite`**");

            const msg = await message.reply("⏳ **جاري التحميل...**");

            const file = fs.createWriteStream(TEMP_PATH);
            
            https.get(attachment.url, function(response) {
                response.pipe(file);

                file.on('finish', function() {
                    file.close(async () => {
                        try {
                            await msg.edit("🛑 **جاري الاستبدال الساخن (Hot Swap)...**");

                            // 1. إغلاق الاتصال الحالي
                            if (client.sql && client.sql.open) {
                                try { client.sql.close(); } catch (e) {}
                            }

                            // 2. تنظيف الملفات القديمة
                            try { if (fs.existsSync(WAL_PATH)) fs.unlinkSync(WAL_PATH); } catch(e){}
                            try { if (fs.existsSync(SHM_PATH)) fs.unlinkSync(SHM_PATH); } catch(e){}
                            try { if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH); } catch(e){}

                            // 3. وضع الملف الجديد
                            fs.renameSync(TEMP_PATH, DB_PATH);

                            // 4. إعادة تهيئة الاتصال والبيانات (هنا السحر ✨)
                            reloadDatabase(client);

                            // 5. تحديث الكاش للرتب
                            const { loadRoleSettings } = require('../../handlers/reaction-role-handler.js');
                            await loadRoleSettings(client.sql, client.antiRolesCache);

                            await msg.edit("✅ **تم تحديث قاعدة البيانات بنجاح!** (بدون إعادة تشغيل)");

                        } catch (err) {
                            console.error(err);
                            await msg.edit(`❌ **فشل الاستبدال:** \`${err.message}\`\n*البوت قد يحتاج لإعادة تشغيل يدوية الآن.*`);
                        }
                    });
                });
            }).on('error', function(err) {
                if (fs.existsSync(TEMP_PATH)) fs.unlinkSync(TEMP_PATH);
                msg.edit(`❌ فشل التحميل: ${err.message}`);
            });
        }

        // ============================================================
        // 📤 أمر DO: تحميل نسخة (Download)
        // ============================================================
        else if (commandName === 'do') {
            try {
                // دمج البيانات في الملف الرئيسي
                if (sql && sql.open) {
                    try { sql.pragma('wal_checkpoint(RESTART)'); } catch (e) {}
                }

                if (!fs.existsSync(DB_PATH)) return message.reply("⚠️ ملف قاعدة البيانات غير موجود!");

                const attachment = new AttachmentBuilder(DB_PATH, { name: 'mainDB.sqlite' });
                
                // المحاولة في الخاص أولاً
                message.author.send({ 
                    content: `📦 **نسخة احتياطية**\n📆 <t:${Math.floor(Date.now() / 1000)}:R>`, 
                    files: [attachment] 
                }).then(() => {
                    message.react('✅');
                }).catch(async (err) => {
                    // إذا الخاص مقفل، أرسل في الشات
                    await message.reply({ 
                        content: `⚠️ خاصك مقفل، تفضل النسخة هنا:\n📦 **نسخة احتياطية**`, 
                        files: [attachment] 
                    });
                });

            } catch (err) {
                console.error(err);
                message.reply(`❌ حدث خطأ: ${err.message}`);
            }
        }

        // ============================================================
        // ⚙️ أمر SSS
        // ============================================================
        else if (commandName === 'sss') {
            const channel = message.mentions.channels.first() || message.channel;
            try {
                sql.prepare(`CREATE TABLE IF NOT EXISTS bot_config (key TEXT PRIMARY KEY, value TEXT)`).run();
                sql.prepare(`INSERT OR REPLACE INTO bot_config (key, value) VALUES (?, ?)`).run('backup_channel', channel.id);
                message.reply(`✅ تم تعيين قناة النسخ: ${channel}`);
            } catch (err) {
                message.reply(`❌ خطأ: ${err.message}`);
            }
        }
    }
};
