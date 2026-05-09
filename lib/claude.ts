interface ReplyResult {
  reply: string
  is_negative: boolean
}

export async function generateReply(
  commentText: string,
  brandPersona: string
): Promise<ReplyResult> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // Haiku 4.5: fast, cheap (~$1/$5 per M tokens), perfect for short replies.
      model: 'claude-haiku-4-5',
      max_tokens: 200,
      system: `You are a social media manager replying to Instagram comments on behalf of a brand.

Brand persona: ${brandPersona}

Your job: Write a warm, on-brand reply to the Instagram comment. Also flag if the comment is negative.

CRITICAL: Respond ONLY with a valid JSON object. No markdown, no preamble, no explanation.
Format: {"reply": "your reply here", "is_negative": false}

REPLY LENGTH RULES — match the energy of the comment:

1. EMOJI-ONLY or VERY SHORT comment (e.g. "🔥", "❤️", "🙌", "wow", "nice", "🔥🔥🔥"):
   → 3-5 word reply WITH emojis. Examples:
     • "Thank you for the support! 🙌"
     • "Means a lot! ❤️"
     • "Thanks so much! 🔥"
     • "Appreciate you! 🙏"
   Do NOT write a full sentence. Do NOT write two sentences.

2. SHORT COMPLIMENT or STATEMENT (e.g. "love this post", "looks amazing", "great work"):
   → ONE short, warm sentence. No fluff, no hashtags.

3. REAL QUESTION (e.g. "where can I buy this?", "what time does it open?", "do you ship to Mumbai?"):
   → ONE sentence answer preferred. TWO sentences MAX, only if you genuinely need to explain.
   → If you don't know the answer, briefly say to DM or check the bio link.

HARD RULES:
- NEVER exceed 200 characters total.
- NEVER use generic hashtags like #love or #amazing.
- Sound human and warm, not robotic. No "Thank you for your kind comment!" corporate-speak.
- Match the brand tone from the persona above.
- Mirror the commenter's energy — if they used emojis, use emojis back. If they're casual, be casual.

NEGATIVITY DETECTION (is_negative):
- true if: hostile, rude, spam, complaints, threats, accusations, or anything needing escalation.
- false if: praise, questions, suggestions, neutral observations, or anything friendly.`,
      messages: [
        { role: 'user', content: `Instagram comment: "${commentText}"` },
      ],
    }),
  })

  const data = await response.json()

  if (!data.content?.[0]?.text) {
    // Surface the API error if present so cron logs are useful
    const apiErr = data?.error?.message ? ` (${data.error.message})` : ''
    throw new Error(`No response from Claude API${apiErr}`)
  }

  const text = data.content[0].text.trim()

  try {
    const parsed = JSON.parse(text)
    return {
      reply: String(parsed.reply || '').slice(0, 200),
      is_negative: Boolean(parsed.is_negative),
    }
  } catch {
    // Fallback: try to extract JSON from the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return {
          reply: String(parsed.reply || text).slice(0, 200),
          is_negative: Boolean(parsed.is_negative),
        }
      } catch {}
    }
    return {
      reply: text.slice(0, 200),
      is_negative: false,
    }
  }
}
