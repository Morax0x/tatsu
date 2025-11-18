// ملف: events/voiceStateUpdate.js
const { Events } = require("discord.js");

// هذا الـ Map يتتبع من بدأ البث ومتى
const streamingTime = new Map(); 

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const member = newState.member;
        if (member.user.bot) return;

        const guildID = newState.guild.id;
        const userID = member.id;
        const wasStreaming = oldState.streaming;
        const isStreaming = newState.streaming;
        const client = newState.client; // (للوصول إلى client.incrementQuestStats)

        try {
            if (!wasStreaming && isStreaming) {
                // العضو بدأ البث، سجل الوقت
                streamingTime.set(userID, Date.now());
            } else if (wasStreaming && !isStreaming) {
                // العضو أوقف البث، احسب الوقت
                const startTime = streamingTime.get(userID);
                if (startTime) {
                    const durationMs = Date.now() - startTime;
                    const durationMinutes = Math.floor(durationMs / 60000);
                    streamingTime.delete(userID);

                    if (durationMinutes > 0) {
                        // (استدعاء الدالة الرئيسية لزيادة الإحصائيات)
                        client.incrementQuestStats(userID, guildID, 'streaming_minutes', durationMinutes);
                    }
                }
            }
        } catch (err) {
            console.error("[Streaming Quest Error]", err);
        }
    },
};