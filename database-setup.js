const SQLite = require("better-sqlite3");
const defaultMarketItems = require("./json/market-items.json");

function setupDatabase(sql) {
    console.log("Checking database schema...");

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS levels (
user TEXT NOT NULL,
guild TEXT NOT NULL,
xp INTEGER DEFAULT 0,
level INTEGER DEFAULT 1,
totalXP INTEGER DEFAULT 0,
mora INTEGER DEFAULT 0,
lastWork INTEGER DEFAULT 0,
lastDaily INTEGER DEFAULT 0,
dailyStreak INTEGER DEFAULT 0,
bank INTEGER DEFAULT 0,
lastInterest INTEGER DEFAULT 0,
totalInterestEarned INTEGER DEFAULT 0,
hasGuard INTEGER DEFAULT 0,
guardExpires INTEGER DEFAULT 0,
totalVCTime INTEGER DEFAULT 0,
lastCollected INTEGER DEFAULT 0,
lastRob INTEGER DEFAULT 0,
lastGuess INTEGER DEFAULT 0,
lastRPS INTEGER DEFAULT 0,
lastRoulette INTEGER DEFAULT 0,
lastTransfer INTEGER DEFAULT 0,
lastDeposit INTEGER DEFAULT 0,
shop_purchases INTEGER DEFAULT 0,
total_meow_count INTEGER DEFAULT 0,
boost_count INTEGER DEFAULT 0,
lastPVP INTEGER DEFAULT 0,
PRIMARY KEY (user, guild)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS settings (
guild TEXT PRIMARY KEY,
voiceXP INTEGER DEFAULT 0,
voiceCooldown INTEGER DEFAULT 60000,
customXP INTEGER DEFAULT 25,
customCooldown INTEGER DEFAULT 60000,
levelUpMessage TEXT,
lvlUpTitle TEXT,
lvlUpDesc TEXT,
lvlUpImage TEXT,
lvlUpColor TEXT,
lvlUpMention INTEGER DEFAULT 1,
streakEmoji TEXT DEFAULT '🔥',
questChannelID TEXT,
treeBotID TEXT,
treeChannelID TEXT,
treeMessageID TEXT,
countingChannelID TEXT,
vipRoleID TEXT,
casinoChannelID TEXT,
dropGiveawayChannelID TEXT,
dropTitle TEXT,
dropDescription TEXT,
dropColor TEXT,
dropFooter TEXT,
dropButtonLabel TEXT,
dropButtonEmoji TEXT,
dropMessageContent TEXT,
lastMediaUpdateSent TEXT,
lastMediaUpdateMessageID TEXT,
lastMediaUpdateChannelID TEXT,
shopChannelID TEXT,
bumpChannelID TEXT,
customRoleAnchorID TEXT,
customRolePanelTitle TEXT,
customRolePanelDescription TEXT,
customRolePanelImage TEXT,
customRolePanelColor TEXT
)
`,
    ).run();

    // --- ( جداول بوت البلاغات ) ---
    sql.prepare(`
        CREATE TABLE IF NOT EXISTS report_settings (
            guildID TEXT PRIMARY KEY,
            logChannelID TEXT,
            reportChannelID TEXT,
            jailRoleID TEXT,
            arenaRoleID TEXT,
            unlimitedRoleID TEXT,
            testRoleID TEXT
        );
    `).run();
    console.log("[Database] ✅ جدول 'report_settings' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS report_permissions (
            guildID TEXT NOT NULL,
            roleID TEXT NOT NULL,
            PRIMARY KEY (guildID, roleID)
        );
    `).run();
    console.log("[Database] ✅ جدول 'report_permissions' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS active_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            guildID TEXT NOT NULL,
            targetID TEXT NOT NULL,
            reporterID TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            UNIQUE(guildID, targetID, reporterID)
        );
    `).run();
    console.log("[Database] ✅ جدول 'active_reports' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS jailed_members (
            guildID TEXT NOT NULL,
            userID TEXT NOT NULL,
            unjailTime INTEGER NOT NULL,
            PRIMARY KEY (guildID, userID)
        );
    `).run();
    console.log("[Database] ✅ جدول 'jailed_members' جاهز.");
    // --- ( نهاية جداول بوت البلاغات ) ---

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS quest_achievement_roles (
guildID TEXT NOT NULL,
roleID TEXT NOT NULL,
achievementID TEXT NOT NULL,
PRIMARY KEY (guildID, roleID, achievementID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS race_roles (
guildID TEXT NOT NULL,
roleID TEXT PRIMARY KEY,
raceName TEXT NOT NULL
)
`,
    ).run();

    sql.prepare(
        "CREATE TABLE IF NOT EXISTS prefix (serverprefix TEXT, guild TEXT PRIMARY KEY);",
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS role_buffs (
guildID TEXT NOT NULL,
roleID TEXT NOT NULL,
buffPercent INTEGER NOT NULL,
PRIMARY KEY (guildID, roleID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS role_mora_buffs (
guildID TEXT NOT NULL,
roleID TEXT NOT NULL,
buffPercent INTEGER NOT NULL,
PRIMARY KEY (guildID, roleID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_buffs (
id INTEGER PRIMARY KEY AUTOINCREMENT,
guildID TEXT,
userID TEXT,
buffPercent INTEGER,
expiresAt INTEGER,
buffType TEXT,
multiplier REAL DEFAULT 0.0
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS streaks (
id TEXT PRIMARY KEY,
guildID TEXT,
userID TEXT,
streakCount INTEGER,
lastMessageTimestamp INTEGER,
hasGracePeriod INTEGER,
hasItemShield INTEGER,
nicknameActive INTEGER DEFAULT 1,
hasReceivedFreeShield INTEGER DEFAULT 0,
separator TEXT DEFAULT '|',
dmNotify INTEGER DEFAULT 1,
highestStreak INTEGER DEFAULT 0,
has12hWarning INTEGER DEFAULT 0
)
`,
    ).run();

    sql.prepare(
        "CREATE TABLE IF NOT EXISTS rankCardTable (id TEXT PRIMARY KEY, barColor TEXT, textColor TEXT, backgroundColor TEXT);",
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS market_items (
id TEXT PRIMARY KEY,
name TEXT NOT NULL,
description TEXT,
currentPrice INTEGER DEFAULT 0,
lastChangePercent REAL DEFAULT 0.0,
lastChange INTEGER DEFAULT 0
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_portfolio (
id INTEGER PRIMARY KEY AUTOINCREMENT,
guildID TEXT NOT NULL,
userID TEXT NOT NULL,
itemID TEXT NOT NULL,
quantity INTEGER DEFAULT 0,
FOREIGN KEY (itemID) REFERENCES market_items(id),
UNIQUE(guildID, userID, itemID)
)
`,
    ).run();

    sql.prepare(
        "CREATE TABLE IF NOT EXISTS blacklistTable (id TEXT PRIMARY KEY, guild TEXT, typeId TEXT, type TEXT);",
    ).run();
    sql.prepare(
        "CREATE TABLE IF NOT EXISTS channel (guild TEXT PRIMARY KEY, channel TEXT);",
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_farm (
id INTEGER PRIMARY KEY AUTOINCREMENT,
guildID TEXT NOT NULL,
userID TEXT NOT NULL,
animalID TEXT NOT NULL,
purchaseTimestamp INTEGER DEFAULT 0,
lastCollected INTEGER DEFAULT 0
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_daily_stats (
id TEXT PRIMARY KEY,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
date TEXT NOT NULL,
messages INTEGER DEFAULT 0,
images INTEGER DEFAULT 0,
stickers INTEGER DEFAULT 0,
reactions_added INTEGER DEFAULT 0,
replies_sent INTEGER DEFAULT 0,
mentions_received INTEGER DEFAULT 0,
vc_minutes INTEGER DEFAULT 0,
water_tree INTEGER DEFAULT 0,
counting_channel INTEGER DEFAULT 0,
meow_count INTEGER DEFAULT 0,
streaming_minutes INTEGER DEFAULT 0,
disboard_bumps INTEGER DEFAULT 0
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_achievements (
id INTEGER PRIMARY KEY AUTOINCREMENT,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
achievementID TEXT NOT NULL,
timestamp INTEGER NOT NULL,
UNIQUE(userID, guildID, achievementID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_quest_claims (
claimID TEXT PRIMARY KEY,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
questID TEXT NOT NULL,
dateStr TEXT NOT NULL
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_weekly_stats (
id TEXT PRIMARY KEY,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
weekStartDate TEXT NOT NULL,
messages INTEGER DEFAULT 0,
images INTEGER DEFAULT 0,
stickers INTEGER DEFAULT 0,
reactions_added INTEGER DEFAULT 0,
replies_sent INTEGER DEFAULT 0,
mentions_received INTEGER DEFAULT 0,
vc_minutes INTEGER DEFAULT 0,
water_tree INTEGER DEFAULT 0,
counting_channel INTEGER DEFAULT 0,
meow_count INTEGER DEFAULT 0,
streaming_minutes INTEGER DEFAULT 0,
disboard_bumps INTEGER DEFAULT 0
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_total_stats (
id TEXT PRIMARY KEY,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
total_messages INTEGER DEFAULT 0,
total_images INTEGER DEFAULT 0,
total_stickers INTEGER DEFAULT 0,
total_reactions_added INTEGER DEFAULT 0,
total_replies_sent INTEGER DEFAULT 0,
total_mentions_received INTEGER DEFAULT 0,
total_vc_minutes INTEGER DEFAULT 0,
total_disboard_bumps INTEGER DEFAULT 0,
UNIQUE(userID, guildID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS quest_notifications (
id TEXT PRIMARY KEY,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
dailyNotif INTEGER DEFAULT 1,
weeklyNotif INTEGER DEFAULT 1,
achievementsNotif INTEGER DEFAULT 1,
levelNotif INTEGER DEFAULT 1,
UNIQUE(userID, guildID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_weapons (
id INTEGER PRIMARY KEY AUTOINCREMENT,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
raceName TEXT NOT NULL,
weaponLevel INTEGER DEFAULT 1,
UNIQUE(userID, guildID, raceName)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_skills (
id INTEGER PRIMARY KEY AUTOINCREMENT,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
skillID TEXT NOT NULL,
skillLevel INTEGER DEFAULT 1,
UNIQUE(userID, guildID, skillID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS temporary_roles (
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
roleID TEXT NOT NULL,
expiresAt INTEGER DEFAULT 0,
PRIMARY KEY (userID, guildID, roleID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS command_shortcuts (
guildID TEXT NOT NULL,
channelID TEXT NOT NULL,
shortcutWord TEXT NOT NULL,
commandName TEXT NOT NULL,
PRIMARY KEY (guildID, channelID, shortcutWord)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS command_permissions (
guildID TEXT NOT NULL,
channelID TEXT NOT NULL,
commandName TEXT NOT NULL,
PRIMARY KEY (guildID, channelID, commandName)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS user_loans (
id INTEGER PRIMARY KEY AUTOINCREMENT,
userID TEXT NOT NULL,
guildID TEXT NOT NULL,
loanAmount INTEGER DEFAULT 0,
remainingAmount INTEGER DEFAULT 0,
dailyPayment INTEGER DEFAULT 0,
lastPaymentDate INTEGER DEFAULT 0,
missedPayments INTEGER DEFAULT 0,
UNIQUE(userID, guildID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS giveaway_weights (
guildID TEXT NOT NULL,
roleID TEXT NOT NULL,
weight INTEGER NOT NULL,
PRIMARY KEY (guildID, roleID)
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS active_giveaways (
messageID TEXT PRIMARY KEY,
guildID TEXT NOT NULL,
channelID TEXT NOT NULL,
prize TEXT NOT NULL,
endsAt INTEGER NOT NULL,
winnerCount INTEGER NOT NULL,
xpReward INTEGER DEFAULT 0,
moraReward INTEGER DEFAULT 0,
isFinished INTEGER DEFAULT 0
)
`,
    ).run();

    sql.prepare(
        `
CREATE TABLE IF NOT EXISTS giveaway_entries (
id INTEGER PRIMARY KEY AUTOINCREMENT,
giveawayID TEXT NOT NULL,
userID TEXT NOT NULL,
weight INTEGER NOT NULL,
UNIQUE(giveawayID, userID)
)
`,
    ).run();

    sql.prepare(
        `
    CREATE TABLE IF NOT EXISTS media_streaks (
        id TEXT PRIMARY KEY,
        guildID TEXT,
        userID TEXT,
        streakCount INTEGER DEFAULT 0,
        lastMediaTimestamp INTEGER DEFAULT 0,
        hasGracePeriod INTEGER DEFAULT 1,
        hasItemShield INTEGER DEFAULT 0,
        hasReceivedFreeShield INTEGER DEFAULT 1,
        dmNotify INTEGER DEFAULT 1,
        highestStreak INTEGER DEFAULT 0
    )
`,
    ).run();

    sql.prepare(
        `
    CREATE TABLE IF NOT EXISTS media_streak_channels (
        guildID TEXT,
        channelID TEXT,
        lastReminderMessageID TEXT,
        PRIMARY KEY (guildID, channelID)
    )
`,
    ).run();

    sql.prepare(
        `
    CREATE TABLE IF NOT EXISTS level_roles (
        guildID TEXT NOT NULL,
        level INTEGER NOT NULL,
        roleID TEXT NOT NULL,
        PRIMARY KEY (guildID, level)
    );
`,
    ).run();

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS custom_roles (
            id TEXT PRIMARY KEY,
            guildID TEXT NOT NULL,
            userID TEXT NOT NULL,
            roleID TEXT NOT NULL,
            UNIQUE(guildID, userID)
        );
    `).run();
    console.log("[Database] ✅ جدول 'custom_roles' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS custom_role_permissions (
            guildID TEXT NOT NULL,
            roleID TEXT NOT NULL,
            PRIMARY KEY (guildID, roleID)
        );
    `).run();
    console.log("[Database] ✅ جدول 'custom_role_permissions' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS role_menus_master (
            message_id TEXT PRIMARY KEY,
            custom_id TEXT UNIQUE NOT NULL,
            is_locked BOOLEAN NOT NULL DEFAULT 0
        );
    `).run();
    console.log("[Database] ✅ جدول 'role_menus_master' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS role_settings (
            role_id TEXT PRIMARY KEY,
            anti_roles TEXT,
            is_removable BOOLEAN NOT NULL DEFAULT 1
        );
    `).run();
    console.log("[Database] ✅ جدول 'role_settings' جاهز.");

    sql.prepare(`
        CREATE TABLE IF NOT EXISTS role_menu_items (
            message_id TEXT NOT NULL,
            value TEXT NOT NULL,
            role_id TEXT NOT NULL,
            description TEXT,
            emoji TEXT,
            PRIMARY KEY (message_id, value)
        );
    `).run();
    console.log("[Database] ✅ جدول 'role_menu_items' جاهز.");


    sql.prepare("DROP TABLE IF EXISTS command_channels").run();

    try {
        const checkColumnsLevels = sql
            .prepare("PRAGMA table_info(levels);")
            .all();
        const columnsToAdd = [
            "mora", "lastWork", "lastDaily", "dailyStreak", "bank", "lastInterest",
            "totalInterestEarned", "hasGuard", "guardExpires", "lastCollected", "totalVCTime",
            "lastRob", "lastGuess", "lastRPS", "lastRoulette", "lastTransfer", "lastDeposit",
            "shop_purchases", "total_meow_count", "boost_count", "lastPVP",
        ];

        columnsToAdd.forEach((col) => {
            if (!checkColumnsLevels.some((c) => c.name === col)) {
                console.log(`Updating levels, adding '${col}'...`);
                sql.prepare(
                    `ALTER TABLE levels ADD COLUMN ${col} INTEGER DEFAULT 0;`,
                ).run();
            }
        });

        const checkColumnsDaily = sql
            .prepare("PRAGMA table_info(user_daily_stats);")
            .all();
        const dailyStatsToAdd = [
            "water_tree", "counting_channel", "meow_count", "streaming_minutes", "disboard_bumps",
        ];
        dailyStatsToAdd.forEach((col) => {
            if (!checkColumnsDaily.some((c) => c.name === col)) {
                console.log(`Updating user_daily_stats, adding '${col}'...`);
                sql.prepare(
                    `ALTER TABLE user_daily_stats ADD COLUMN ${col} INTEGER DEFAULT 0;`,
                ).run();
            }
        });

        const checkColumnsWeekly = sql
            .prepare("PRAGMA table_info(user_weekly_stats);")
            .all();
        dailyStatsToAdd.forEach((col) => {
            if (!checkColumnsWeekly.some((c) => c.name === col)) {
                console.log(`Updating user_weekly_stats, adding '${col}'...`);
                sql.prepare(
                    `ALTER TABLE user_weekly_stats ADD COLUMN ${col} INTEGER DEFAULT 0;`,
                ).run();
            }
        });

        const checkColumnsTotalStats = sql
            .prepare("PRAGMA table_info(user_total_stats);")
            .all();
        if (
            !checkColumnsTotalStats.some((c) => c.name === "total_vc_minutes")
        ) {
            console.log(
                `Updating user_total_stats, adding 'total_vc_minutes'...`,
            );
            sql.prepare(
                `ALTER TABLE user_total_stats ADD COLUMN total_vc_minutes INTEGER DEFAULT 0;`,
            ).run();
        }
        if (
            !checkColumnsTotalStats.some(
                (c) => c.name === "total_disboard_bumps",
            )
        ) {
            console.log(
                `Updating user_total_stats, adding 'total_disboard_bumps'...`,
            );
            sql.prepare(
                `ALTER TABLE user_total_stats ADD COLUMN total_disboard_bumps INTEGER DEFAULT 0;`,
            ).run();
        }

        const checkColumnsBuffs = sql
            .prepare("PRAGMA table_info(user_buffs);")
            .all();
        ["buffType", "multiplier"].forEach((col) => {
            if (!checkColumnsBuffs.some((c) => c.name === col)) {
                console.log(`Updating user_buffs, adding '${col}'...`);
                const type = col === "multiplier" ? "REAL DEFAULT 0.0" : "TEXT";
                sql.prepare(
                    `ALTER TABLE user_buffs ADD COLUMN ${col} ${type};`,
                ).run();
            }
        });

        const checkColumnsSettings = sql
            .prepare("PRAGMA table_info(settings);")
            .all();
        const settingsColumnsToAdd = [
            "questChannelID",
            "treeBotID",
            "treeChannelID",
            "treeMessageID",
            "countingChannelID",
            "vipRoleID",
            "casinoChannelID",
            "dropGiveawayChannelID",
            "dropTitle",
            "dropDescription",
            "dropColor",
            "dropFooter",
            "dropButtonLabel",
            "dropButtonEmoji",
            "dropMessageContent",
            "lastMediaUpdateSent",
            "lastMediaUpdateMessageID",
            "lastMediaUpdateChannelID",
            "shopChannelID",
            "bumpChannelID",
            "customRoleAnchorID",
            "customRolePanelTitle",
            "customRolePanelDescription",
            "customRolePanelImage",
            "customRolePanelColor"
        ];
        settingsColumnsToAdd.forEach((col) => {
            if (!checkColumnsSettings.some((c) => c.name === col)) {
                console.log(`Updating settings, adding '${col}'...`);
                sql.prepare(
                    `ALTER TABLE settings ADD COLUMN ${col} TEXT;`,
                ).run();
            }
        });

        const checkColumnsStreaks = sql
            .prepare("PRAGMA table_info(streaks);")
            .all();
        const streakColumnsToAdd = [
            { name: "hasReceivedFreeShield", type: "INTEGER DEFAULT 0" },
            { name: "separator", type: 'TEXT DEFAULT "|"' },
            { name: "dmNotify", type: "INTEGER DEFAULT 1" },
            { name: "highestStreak", type: "INTEGER DEFAULT 0" },
            { name: "has12hWarning", type: "INTEGER DEFAULT 0" },
        ];

        streakColumnsToAdd.forEach((col) => {
            if (!checkColumnsStreaks.some((c) => c.name === col.name)) {
                console.log(`Updating streaks, adding '${col.name}'...`);
                sql.prepare(
                    `ALTER TABLE streaks ADD COLUMN ${col.name} ${col.type};`,
                ).run();
            }
        });

        const checkColumnsQuestNotif = sql
            .prepare("PRAGMA table_info(quest_notifications);")
            .all();
        if (!checkColumnsQuestNotif.some((c) => c.name === "levelNotif")) {
            console.log(`Updating quest_notifications, adding 'levelNotif'...`);
            sql.prepare(
                `ALTER TABLE quest_notifications ADD COLUMN levelNotif INTEGER DEFAULT 1;`,
            ).run();
        }

        const checkColumnsGiveaways = sql
            .prepare("PRAGMA table_info(active_giveaways);")
            .all();
        const giveawayColumnsToAdd = [
            { name: "xpReward", type: "INTEGER DEFAULT 0" },
            { name: "moraReward", type: "INTEGER DEFAULT 0" },
            { name: "isFinished", type: "INTEGER DEFAULT 0" },
        ];

        giveawayColumnsToAdd.forEach((col) => {
            if (!checkColumnsGiveaways.some((c) => c.name === col.name)) {
                console.log(
                    `Updating active_giveaways, adding '${col.name}'...`,
                );
                sql.prepare(
                    `ALTER TABLE active_giveaways ADD COLUMN ${col.name} ${col.type};`,
                ).run();
            }
        });

        const checkColumnsMediaChannels = sql
            .prepare("PRAGMA table_info(media_streak_channels);")
            .all();
        if (!checkColumnsMediaChannels.some((c) => c.name === "lastReminderMessageID")) {
            console.log(`Updating media_streak_channels, adding 'lastReminderMessageID'...`);
            sql.prepare(
                `ALTER TABLE media_streak_channels ADD COLUMN lastReminderMessageID TEXT;`,
            ).run();
        }

    } catch (err) {
        console.error("Error during table alteration:", err);
    }

    const itemsCount = sql
        .prepare("SELECT count(*) as count FROM market_items")
        .get();
    if (itemsCount.count === 0) {
        console.log("[Market] Market is empty. Populating default items...");
        const insertItem = sql.prepare(
            "INSERT INTO market_items (id, name, description, currentPrice) VALUES (@id, @name, @description, @price)",
        );
        sql.transaction(() => {
            defaultMarketItems.forEach((item) => insertItem.run(item));
        })();
    }

    console.log("[Database] ✅ جميع الجداول جاهزة ومحدثة");
    console.log("[Database] ✅ جدول quest_notifications جاهز");
    console.log("[Database] ✅ جدول race_roles جاهز");
    console.log("[Database] ✅ جدول user_weapons جاهز");
    console.log("[Database] ✅ جدول user_skills جاهز");
    console.log("[Database] ✅ جدول 'level_roles' جاهز");
    console.log("[Database] ✅ جدول 'custom_roles' جاهز.");
    console.log("[Database] ✅ جدول 'custom_role_permissions' جاهز.");
    console.log("[Database] ✅ جدول 'report_settings' جاهز.");
    console.log("[Database] ✅ جدول 'report_permissions' جاهز.");
    console.log("[Database] ✅ جدول 'active_reports' جاهز.");
    console.log("[Database] ✅ جدول 'jailed_members' جاهز.");
    console.log("[Database] ✅ جدول 'role_menus_master' جاهز.");
    console.log("[Database] ✅ جدول 'role_settings' جاهز.");
    console.log("[Database] ✅ جدول 'role_menu_items' جاهز.");
}

module.exports = { setupDatabase };