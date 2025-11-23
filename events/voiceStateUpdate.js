const { Events } = require("discord.js");

// خريطة لتخزين وقت دخول الأعضاء
const voiceSessions = new Map();

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const client = newState.client;
        const member = newState.member;
        if (member.user.bot) return;

        const userID = member.id;
        const guildID = member.guild.id;
        const now = Date.now();

        // 1. عند الخروج من الصوت أو الانتقال -> نحسب المدة
        if (oldState.channelId && (!newState.channelId || oldState.channelId !== newState.channelId)) {
            if (voiceSessions.has(userID)) {
                const session = voiceSessions.get(userID);
                
                // حساب دقائق الصوت
                const durationMs = now - session.joinTime;
                const minutes = Math.floor(durationMs / 60000);

                // حساب دقائق البث (إذا كان يبث)
                let streamMinutes = 0;
                if (session.isStreaming && session.streamStartTime) {
                    const streamDuration = now - session.streamStartTime;
                    streamMinutes = Math.floor(streamDuration / 60000);
                }

                if (minutes > 0 || streamMinutes > 0) {
                    // استدعاء دالة التتبع في index.js
                    if (client.incrementQuestStats) {
                        if (minutes > 0) await client.incrementQuestStats(userID, guildID, 'vc_minutes', minutes);
                        if (streamMinutes > 0) await client.incrementQuestStats(userID, guildID, 'streaming_minutes', streamMinutes);
                        console.log(`[Voice Stats] User ${userID}: +${minutes}m Voice, +${streamMinutes}m Stream`);
                    }
                }

                voiceSessions.delete(userID);
            }
        }

        // 2. عند الدخول للصوت -> نبدأ المؤقت
        if (newState.channelId && !oldState.channelId) {
            voiceSessions.set(userID, {
                joinTime: now,
                isStreaming: newState.streaming,
                streamStartTime: newState.streaming ? now : null
            });
        }

        // 3. عند بدء/إيقاف البث وهو داخل الروم
        if (newState.channelId && oldState.channelId === newState.channelId) {
            if (voiceSessions.has(userID)) {
                const session = voiceSessions.get(userID);

                // بدأ البث
                if (!oldState.streaming && newState.streaming) {
                    session.isStreaming = true;
                    session.streamStartTime = now;
                    voiceSessions.set(userID, session);
                }
                // أوقف البث
                else if (oldState.streaming && !newState.streaming) {
                    if (session.streamStartTime) {
                        const streamDuration = now - session.streamStartTime;
                        const streamMinutes = Math.floor(streamDuration / 60000);
                        if (streamMinutes > 0 && client.incrementQuestStats) {
                            await client.incrementQuestStats(userID, guildID, 'streaming_minutes', streamMinutes);
                        }
                    }
                    session.isStreaming = false;
                    session.streamStartTime = null;
                    voiceSessions.set(userID, session);
                }
            }
        }
    },
};
