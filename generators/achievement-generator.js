const { createCanvas, registerFont, loadImage } = require('canvas');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');

// --- ( 1. تسجيل الخطوط - للعربي فقط ) ---
try {
    const mainFontsDir = path.join(__dirname, '..', 'fonts');

    // نسجل الخط العربي فقط (Bein) للنصوص
    const mainFontPath = path.join(mainFontsDir, 'bein-ar-normal.ttf');
    if (!fs.existsSync(mainFontPath)) {
        throw new Error("ملف الخط 'bein-ar-normal.ttf' غير موجود في المجلد 'fonts'.");
    }
    registerFont(mainFontPath, { family: 'Font-Arabic-Strict' });

    console.log("[Achievement-Gen] تم تسجيل الخط العربي (Bein) بنجاح.");

} catch (err) {
    console.error("!!! خطأ فادح في تسجيل الخطوط:", err.message);
}

// --- ( 2. تعريف الخطوط ) ---
const FONT_MAIN = '"Font-Arabic-Strict"'; 
const FONT_ACH_TITLE = FONT_MAIN;
const FONT_PAGE_TITLE = FONT_MAIN; 
const FONT_ACH_DESCRIPTION = FONT_MAIN;
const FONT_PAGE_COUNT = FONT_MAIN;
const FONT_PROGRESS_TEXT = FONT_MAIN; 
const FONT_REWARDS = FONT_MAIN; 

const RARITY_COLORS_ACH = {
    common: { base: '#1a4b2a', frame: '#2d8649', highlight: '#34eb6e', glow: '#69ff9c' }, 
    rare: { base: '#1a3e4b', frame: '#2d6a86', highlight: '#349eeb', glow: '#69bfff' }, 
    epic: { base: '#431a4b', frame: '#7b2d86', highlight: '#b934eb', glow: '#d969ff' }, 
    legendary: { base: '#4b431a', frame: '#867b2d', highlight: '#ebc934', glow: '#fff369' }, 
    mythic: { base: '#4b1a1a', frame: '#862d2d', highlight: '#eb3434', glow: '#ff6969' }, 
    default: { base: '#36393f', frame: '#54575c', highlight: '#99aab5', glow: '#ffffff' }
};

// ( 🌟 الألوان المخصصة للجوائز 🌟 )
const COLOR_XP = '#349eeb'; // أزرق
const COLOR_MORA = '#ebc934'; // أصفر

const BASE_COLORS = {
    background: '#1a1827', 
    text: '#FFFFFF',
    subText: '#B0B0B0',
    hexBg: '#2a273b', 
};

const EMOJI_MORA_CHAR = 'M';
const EMOJI_STAR_CHAR = 'XP';
const PADDING = 20;
const PAGE_MARGIN = 25;
const ACH_CARD_WIDTH = 800;
const ACH_CARD_HEIGHT = 180; 
const PAGE_WIDTH = ACH_CARD_WIDTH + (PAGE_MARGIN * 2);

// --- (دالة ذكية لتحويل الإيموجي إلى رابط صورة) ---
function getEmojiUrl(emoji) {
    if (!emoji) return null;
    const customMatch = emoji.match(/<?(a)?:?(\w{2,32}):(\d{17,19})>?/);
    if (customMatch) {
        const ext = customMatch[1] ? 'gif' : 'png';
        return `https://cdn.discordapp.com/emojis/${customMatch[3]}.${ext}`;
    }
    try {
        if (/^[a-zA-Z0-9]+$/.test(emoji)) return null;
        const codePoints = [...emoji]
            .map(c => c.codePointAt(0).toString(16))
            .filter(cp => cp !== 'fe0f') 
            .join('-');
        return `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/${codePoints}.png`;
    } catch (e) {
        return null; 
    }
}

// ===========================================
// (دوال الرسم المساعدة)
// ===========================================
function drawRoundedRect(ctx, x, y, width, height, radius) { 
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
function drawProgressBar(ctx, x, y, width, height, progressPercent, colorStart, colorEnd) { 
    ctx.save();
    ctx.fillStyle = '#2c2f33';
    drawRoundedRect(ctx, x, y, width, height, height / 2);
    ctx.fill();

    if (progressPercent > 0) {
        const progressGradient = ctx.createLinearGradient(x, 0, x + width, 0);
        progressGradient.addColorStop(0, colorStart);
        progressGradient.addColorStop(1, colorEnd);
        ctx.fillStyle = progressGradient;

        const effectiveProgressWidth = Math.max(height, width * progressPercent);
        drawRoundedRect(ctx, x, y, effectiveProgressWidth, height, height / 2);
        ctx.fill();
    }
    ctx.restore();
}
function drawWavyBackground(ctx, x, y, width, height, color1, color2) { 
    ctx.save();
    drawRoundedRect(ctx, x, y, width, height, 15);
    ctx.clip(); 

    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, color1);
    gradient.addColorStop(1, color2);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.moveTo(x, y + (height / 5) * i);
        for (let j = 0; j <= width; j += 20) {
            const waveHeight = Math.sin((j / width) * Math.PI * 3 + i) * 10;
            ctx.lineTo(x + j, y + (height / 5) * i + waveHeight);
        }
        ctx.stroke();
    }
    ctx.restore();
}

// ===========================================
// (1. دوال الإنجازات - ASYNC)
// ===========================================

async function drawAchievementCard(ctx, x, y, data) {
    const { achievement, progress, isDone } = data;
    const percent = Math.min(1, Math.max(0, progress / achievement.goal));
    const rarityColors = RARITY_COLORS_ACH[achievement.rarity] || RARITY_COLORS_ACH.default;

    ctx.save();
    drawWavyBackground(ctx, x, y, ACH_CARD_WIDTH, ACH_CARD_HEIGHT, rarityColors.base, '#11101a');

    // الإطار والتوهج
    ctx.strokeStyle = rarityColors.highlight;
    ctx.shadowColor = rarityColors.highlight;
    ctx.shadowBlur = isDone ? 20 : 10; 
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, x, y, ACH_CARD_WIDTH, ACH_CARD_HEIGHT, 15);
    ctx.stroke();

    ctx.strokeStyle = rarityColors.glow;
    ctx.shadowColor = rarityColors.glow;
    ctx.shadowBlur = isDone ? 10 : 5; 
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, x + 3, y + 3, ACH_CARD_WIDTH - 6, ACH_CARD_HEIGHT - 6, 12);
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // الشكل السداسي
    const hexRadius = 55;
    const hexX = x + PADDING + hexRadius;
    const hexY = y + ACH_CARD_HEIGHT / 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        ctx.lineTo(hexX + hexRadius * Math.cos(Math.PI / 3 * i), hexY + hexRadius * Math.sin(Math.PI / 3 * i));
    }
    ctx.closePath();
    ctx.fillStyle = BASE_COLORS.hexBg;
    ctx.fill();
    ctx.strokeStyle = rarityColors.frame;
    ctx.lineWidth = 3;
    ctx.stroke();

    // 🌟 رسم الإيموجي كصورة 🌟
    try {
        const emojiStr = achievement.emoji || '🏆'; 
        const emojiUrl = getEmojiUrl(emojiStr);

        if (emojiUrl) {
            const img = await loadImage(emojiUrl);
            ctx.drawImage(img, hexX - 30, hexY - 30, 60, 60);
        }
    } catch (err) {
        // يترك فارغاً عند الخطأ
    }

    const textX = hexX + hexRadius + PADDING;
    const textRightX = x + ACH_CARD_WIDTH - PADDING;
    const barWidth = (x + ACH_CARD_WIDTH - PADDING) - textX;

    // العنوان
    ctx.fillStyle = BASE_COLORS.text;
    ctx.font = `32px ${FONT_ACH_TITLE}`; 
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(achievement.name, textX, y + PADDING);

    // الوصف
    if (achievement.description) {
        ctx.fillStyle = BASE_COLORS.subText;
        ctx.font = `18px ${FONT_ACH_DESCRIPTION}`; 
        ctx.textAlign = 'left';
        ctx.fillText(achievement.description, textX, y + PADDING + 45);
    }

    // الجوائز (محاذاة مرفوعة)
    ctx.textAlign = 'right'; 
    const rewardY = y + 65; // ( 🌟 تم الرفع للمحاذاة 🌟 )
    const rewardXStart = textRightX; 

    ctx.font = `bold 20px ${FONT_REWARDS}`; 

    // ( 1. رسم الـ XP باللون الأزرق )
    ctx.fillStyle = COLOR_XP; 
    const xpText = `${achievement.reward.xp.toLocaleString()}`;
    const xpTextWidth = ctx.measureText(xpText).width;
    ctx.fillText(xpText, rewardXStart - 25, rewardY); 
    ctx.fillText(EMOJI_STAR_CHAR, rewardXStart, rewardY); 

    // ( 2. رسم المورا باللون الأصفر )
    const moraRewardXStart = rewardXStart - 25 - xpTextWidth - 35; 
    ctx.fillStyle = COLOR_MORA; 
    const moraText = `${achievement.reward.mora.toLocaleString()}`;
    ctx.fillText(moraText, moraRewardXStart - 25, rewardY); 
    ctx.fillText(EMOJI_MORA_CHAR, moraRewardXStart, rewardY);

    // التقدم (محاذاة مرفوعة)
    const barY = y + 103; // ( 🌟 تم الرفع للمحاذاة 🌟 )
    drawProgressBar(ctx, textX, barY, barWidth, 15, percent, rarityColors.highlight, rarityColors.glow);

    ctx.fillStyle = BASE_COLORS.subText;
    ctx.font = `18px ${FONT_PROGRESS_TEXT}`; 
    ctx.textAlign = 'left';
    const progressText = `التقدم: ${progress.toLocaleString()} / ${achievement.goal.toLocaleString()}`; 
    ctx.fillText(progressText, textX, barY + 25); // ( 🌟 تم الرفع للمحاذاة 🌟 )

    ctx.restore();
}

async function generateAchievementPageImage(member, achievementsData, stats) {
    const pageHeight = (ACH_CARD_HEIGHT + PADDING) * achievementsData.length + (PAGE_MARGIN * 2) + 80;
    const canvas = createCanvas(PAGE_WIDTH, pageHeight);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = BASE_COLORS.background;
    ctx.fillRect(0, 0, PAGE_WIDTH, pageHeight);
    const avatarSize = 60; 
    const avatarY = PAGE_MARGIN;
    ctx.fillStyle = BASE_COLORS.text;
    ctx.font = `36px ${FONT_PAGE_TITLE}`; 
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`إنجازات ${member.displayName}`, PAGE_MARGIN + PADDING, avatarY + avatarSize / 2);

    ctx.fillStyle = BASE_COLORS.subText;
    ctx.font = `24px ${FONT_PAGE_COUNT}`; 
    ctx.textAlign = 'right';
    ctx.fillText(`صفحة ${stats.page} / ${stats.totalPages} (${stats.completed}/${stats.total})`, PAGE_WIDTH - PAGE_MARGIN - PADDING, avatarY + avatarSize / 2);

    let currentY = PAGE_MARGIN + 80;
    for (const data of achievementsData) {
        await drawAchievementCard(ctx, PAGE_MARGIN, currentY, data);
        currentY += ACH_CARD_HEIGHT + PADDING;
    }
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: `achievements-page-${member.id}-${stats.page}.png` });
    return attachment;
}

async function generateSingleAchievementAlert(member, achievement) {
    const canvas = createCanvas(ACH_CARD_WIDTH, ACH_CARD_HEIGHT);
    const ctx = canvas.getContext('2d');
    const data = {
        achievement: achievement,
        progress: achievement.goal,
        isDone: true 
    };
    await drawAchievementCard(ctx, 0, 0, data);
    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: `achievement-unlocked-${member.id}-${achievement.id}.png` });
    return attachment;
}

async function generateQuestAlert(member, quest, questType) {
    const canvas = createCanvas(ACH_CARD_WIDTH, ACH_CARD_HEIGHT); 
    const ctx = canvas.getContext('2d');

    let questAsAchievement = { ...quest };

    if (questType === 'daily') {
        questAsAchievement.rarity = 'common'; 
    } else { // (weekly or rare)
        questAsAchievement.rarity = 'rare'; 
    }

    const data = {
        achievement: questAsAchievement, 
        progress: quest.goal,
        isDone: true 
    };

    await drawAchievementCard(ctx, 0, 0, data);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: `quest-unlocked-${member.id}-${quest.id}.png` });
    return attachment;
}

module.exports = {
    generateAchievementPageImage,
    generateSingleAchievementAlert,
    generateQuestAlert
};