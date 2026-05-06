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
      model: 'claude-opus-4-5',
      max_tokens: 300,
      system: `You are a social media manager replying to Instagram comments on behalf of a brand.

Brand persona: ${brandPersona}

Your job: Write a warm, genuine, on-brand reply to the comment. Also flag if the comment is negative.

CRITICAL: Respond ONLY with a valid JSON object. No markdown, no explanation, no preamble.
Format: {"reply": "your reply here", "is_negative": false}

Rules for reply:
- Keep it under 200 characters
- Sound human and warm, not robotic
- Match the brand tone from the persona
- Don't use generic hashtags
- If it's a question, answer it helpfully
- If it's a compliment, thank them genuinely

Rules for is_negative:
- true if: hostile, rude, spam, complaints, threats, or requires escalation
- false if: praise, questions, suggestions, or neutral comments`,
      messages: [
        { role: 'user', content: `Instagram comment: "${commentText}"` },
      ],
    }),
  })

  const data = await response.json()
  
  if (!data.content?.[0]?.text) {
    throw new Error('No response from Claude API')
  }

  const text = data.content[0].text.trim()
  
  try {
    const parsed = JSON.parse(text)
    return {
      reply: String(parsed.reply || '').slice(0, 250),
      is_negative: Boolean(parsed.is_negative),
    }
  } catch {
    // Fallback: try to extract JSON from the text
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        const parsed = JSON.parse(match[0])
        return {
          reply: String(parsed.reply || text).slice(0, 250),
          is_negative: Boolean(parsed.is_negative),
        }
      } catch {}
    }
    return {
      reply: text.slice(0, 250),
      is_negative: false,
    }
  }
}
