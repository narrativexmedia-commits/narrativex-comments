import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { postReply } from '@/lib/meta'

export async function POST(request: Request) {
  try {
    const { commentIds, action, userEmail } = await request.json()

    if (!commentIds || !Array.isArray(commentIds) || commentIds.length === 0) {
      return NextResponse.json({ error: 'commentIds array required' }, { status: 400 })
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
    }

    const supabase = createServiceClient()

    if (action === 'reject') {
      const { error } = await supabase
        .from('cm_comments')
        .update({ status: 'rejected', assigned_smm: userEmail || null })
        .in('id', commentIds)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, updated: commentIds.length })
    }

    // Bulk approve — fetch all comments with client tokens
    const { data: comments, error } = await supabase
      .from('cm_comments')
      .select('*, cm_clients(page_access_token)')
      .in('id', commentIds)

    if (error || !comments) return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 })

    // Mark all as approved first
    await supabase
      .from('cm_comments')
      .update({ status: 'approved', assigned_smm: userEmail || null })
      .in('id', commentIds)

    // Post to Instagram for each (sequential with delay)
    const results = { posted: 0, failed: 0 }

    for (const comment of comments) {
      const replyText = comment.final_reply || comment.ai_reply
      const accessToken = (comment as any).cm_clients?.page_access_token

      if (!replyText || !accessToken) {
        results.failed++
        continue
      }

      try {
        await postReply(comment.comment_id, replyText, accessToken)
        await supabase
          .from('cm_comments')
          .update({ status: 'posted', posted_at: new Date().toISOString() })
          .eq('id', comment.id)
        results.posted++
      } catch {
        await supabase
          .from('cm_comments')
          .update({ status: 'failed' })
          .eq('id', comment.id)
        results.failed++
      }

      await new Promise((r) => setTimeout(r, 150))
    }

    return NextResponse.json({ success: true, ...results })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
