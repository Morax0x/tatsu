const { Collection } = require("discord.js");

const ownerID = "1145327691772481577"; 

// تعريف الأوامر الاقتصادية التي تستخدم قاعدة البيانات والخانة الخاصة بها
const DB_COOLDOWN_COMMANDS = [
    { name: 'daily', db_column: 'lastDaily', cooldown_ms: 22 * 60 * 60 * 1000, level_required: 0 },
    { name: 'work', db_column: 'lastWork', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'rob', db_column: 'lastRob', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 10 },
    { name: 'guess', db_column: 'lastGuess', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'rps', db_column: 'lastRPS', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'roulette', db_column: 'lastRoulette', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
    { name: 'transfer', db_column: 'lastTransfer', cooldown_ms: 5 * 60 * 1000, level_required: 10 },
    { name: 'deposit', db_column: 'lastDeposit', cooldown_ms: 1 * 60 * 60 * 1000, level_required: 0 },
];

// (دالة تنسيق الوقت)
function formatTimeSimple(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function checkPermissions(message, command) {
    const { client } = message;
    const isOwner = message.author.id === ownerID;

    if (isOwner) return true; 

    // --- التحقق من اللفل للأوامر الاقتصادية ---
    // (يجب أن نجد الأمر سواء كان بالاسم أو الاسم المستعار)
    const cmdInfo = DB_COOLDOWN_COMMANDS.find(c => command.name === c.name || (command.aliases && command.aliases.includes(c.name)));

    if (cmdInfo && cmdInfo.level_required > 0) {
        let levelData = client.getLevel.get(message.author.id, message.guild.id);
        let userLevel = (levelData && levelData.level) ? levelData.level : 1; 

        const requiredLevel = cmdInfo.level_required;
        if (userLevel < requiredLevel) {
            const cmdName = command.aliases.find(a => ['تحويل', 'سرقة', 'نهب'].includes(a)) || command.name; 
            message.reply(`✥ مـا زلـت رحالاً يا غـلام ! ارفـع مستواك الـى \__${requiredLevel}__\ لتتمكن من استعمال \`${cmdName}\` <:araara:1436297148894412862>`);
            return false;
        }
    }

    return true; 
}

function checkCooldown(message, command) {
    const { client } = message;
    const isOwner = message.author.id === ownerID;

    if (isOwner) return false;

    const now = Date.now();
    const cmdInfo = DB_COOLDOWN_COMMANDS.find(c => command.name === c.name || (command.aliases && command.aliases.includes(c.name)));
    let timeLeft = 0;

    if (cmdInfo) {
        // --- 1. فحص أوامر الاقتصاد (قاعدة البيانات) ---
        let data = client.getLevel.get(message.author.id, message.guild.id);
        if (!data) return false; 

        const lastUsed = data[cmdInfo.db_column] || 0;
        const expirationTime = lastUsed + cmdInfo.cooldown_ms;

        if (now < expirationTime) {
            timeLeft = expirationTime - now;
        }
    } else {
        // --- 2. فحص الأوامر العامة (الذاكرة المؤقتة) ---
        if (!client.cooldowns.has(command.name)) {
            client.cooldowns.set(command.name, new Collection());
        }

        const timestamps = client.cooldowns.get(command.name);
        // (نستخدم الكول داون المعرّف في command.cooldown أو 3 ثواني كافتراضي)
        const cooldownAmount = (command.cooldown || 3) * 1000;

        const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

        if (now < expirationTime) {
            timeLeft = expirationTime - now;
        } else {
            // تحديث الكول داون العام إذا كان جاهزاً
            timestamps.set(message.author.id, now);
            setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);
        }
    }

    // --- إرجاع رسالة الكول داون إذا كان نشطاً ---
    if (timeLeft > 0) {
        const timeString = formatTimeSimple(timeLeft); 
        const cmdName = command.aliases.find(a => a.length > 2) || command.name; 

        // هنا نتأكد من إرجاع نص فقط
        return `✥ انـتـظـر \`${timeString}\` لتستعمل \`${cmdName}\` مجددا <:stop:1436337453098340442>`;
    }

    return false; // لا يوجد كول داون
}

module.exports = { checkPermissions, checkCooldown };