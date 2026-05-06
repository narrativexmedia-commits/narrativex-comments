import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { getInstagramPosts, getPostComments, checkCommentReplies } from '@/lib/meta'
import { generateReply } from '@/lib/claude'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results = { processed: 0, new_comments: 0, errors: [] as string[] }

  try {
    // Get all active clients
    const { data: clients, error: clientsErr } = await supabase
      .from('cm_clients')
      .select('*')
      .eq('is_active', true)

    if (clientsErr) throw new Error(`Clients fetch error: ${clientsErr.message}`)
    if (!clients || clients.length === 0) {
      return NextResponse.json({ message: 'No active clients', ...results })
    }

    // Get existing comment IDs (all time — to avoid re-processing)
    const { data: existingComments } = await supabase
      .from('cm_comments')
      .select('comment_id')

    const existingIds = new Set((existingComments || []).map((c: any) => c.comment_id))

    for (const client of clients) {
      try {
        results.processed++

        if (!client.instagram_id || !client.page_access_token) {
          results.errors.push(`${client.page_name}: missing instagram_id or token`)
          continue
        }

        // Get recent posts (last 3 hours)
        const posts = await getInstagramPosts(client.instagram_id, client.page_access_token)

        for (const post of posts) {
          // Get comments on this post (last 3 hours)
          const rawComments = await getPostComments(post.id, client.page_access_token)

          for (const rawComment of rawComments) {
            // Skip if already in DB
            if (existingIds.has(rawComment.id)) continue

            // Check if already has a reply on Instagram
            const hasReply = await checkCommentReplies(rawComment.id, client.page_access_token)

            if (hasReply) {
              // Save as manually_replied
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

            // Generate AI reply
            let aiReply = ''
            let isNegative = false

            try {
              const generated = await generateReply(
                rawComment.text,
                client.page_description || 'A professional brand. Keep replies warm and on-brand.'
              )
              aiReply = generated.reply
              isNegative = generated.is_negative
            } catch (claudeErr: any) {
              results.errors.push(`Claude error for ${client.page_name}: ${claudeErr.message}`)
              // Still save the comment, just without an AI reply
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

            // Small delay to avoid Claude rate limits
            await new Promise((r) => setTimeout(r, 200))
          }
        }
      } catch (clientErr: any) {
        results.errors.push(`${client.page_name}: ${clientErr.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message, ...results }, { status: 500 })
  }
}
