import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getInstagramPosts, getPostComments, checkCommentReplies } from '@/lib/meta'
import { generateReply } from '@/lib/claude'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results = { processed: 0, new_comments: 0, errors: [] as string[] }

  try {
    const { data: clients } = await supabase
      .from('cm_clients')
      .select('*')
      .eq('is_active', true)

    if (!clients || clients.length === 0) {
      return NextResponse.json({ message: 'No active clients', ...results })
    }

    // Get existing comment IDs to avoid reprocessing
    const { data: existingComments } = await supabase
      .from('cm_comments')
      .select('comment_id')

    const existingIds = new Set((existingComments || []).map((c: any) => c.comment_id))

    // Process only 5 clients per run to stay within timeout
    // Use a rotating offset based on current minute
    const minute = new Date().getMinutes()
    const batchSize = 5
    const offset = (Math.floor(minute / 5) * batchSize) % clients.length
    const batch = clients.slice(offset, offset + batchSize)

    for (const client of batch) {
      try {
        results.processed++
        if (!client.instagram_id || !client.page_access_token) continue

        const posts = await getInstagramPosts(client.instagram_id, client.page_access_token)

        for (const post of posts.slice(0, 5)) {
          const rawComments = await getPostComments(post.id, client.page_access_token)

          for (const rawComment of rawComments) {
            if (existingIds.has(rawComment.id)) continue

            const hasReply = await checkCommentReplies(rawComment.id, client.page_access_token)

            if (hasReply) {
              await supabase.from('cm_comments').insert({
                client_id: client.id,
                comment_id: rawComment.id,
                commenter_name: rawComment.username,
                comment_text: rawComment.text,
                post_id: post.id,
                post_caption: post.caption || null,
                post_permalink: post.permalink || null,
                status: 'manually_replied',
                is_negative: false,
              })
              existingIds.add(rawComment.id)
              results.new_comments++
              continue
            }

            let aiReply = ''
            let isNegative = false

            try {
              const generated = await generateReply(
                rawComment.text,
                client.page_description || 'A professional brand. Keep replies warm and on-brand.'
              )
              aiReply = generated.reply
              isNegative = generated.is_negative
            } catch (e: any) {
              results.errors.push(`Claude error: ${e.message}`)
            }

            await supabase.from('cm_comments').insert({
              client_id: client.id,
              comment_id: rawComment.id,
              commenter_name: rawComment.username,
              comment_text: rawComment.text,
              post_id: post.id,
              post_caption: post.caption || null,
              post_permalink: post.permalink || null,
              ai_reply: aiReply || null,
              status: isNegative ? 'negative' : 'pending',
              is_negative: isNegative,
            })

            existingIds.add(rawComment.id)
            results.new_comments++
            await new Promise((r) => setTimeout(r, 200))
          }
        }
      } catch (e: any) {
        results.errors.push(`${client.page_name}: ${e.message}`)
      }
    }

    return NextResponse.json({ success: true, timestamp: new Date().toISOString(), ...results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}