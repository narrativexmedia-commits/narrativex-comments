import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { postReply } from '@/lib/meta'

export async function POST(request: Request) {
  try {
    const { commentId, finalReply, userEmail } = await request.json()
    if (!commentId || !finalReply) {
      return NextResponse.json({ error: 'commentId and finalReply required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Get comment with client
    const { data: comment, error } = await supabase
      .from('cm_comments')
      .select('*, cm_clients(page_access_token)')
      .eq('id', commentId)
      .single()

    if (error || !comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    const accessToken = (comment as any).cm_clients?.page_access_token
    if (!accessToken) return NextResponse.json({ error: 'Client token missing' }, { status: 400 })

    // Save edited reply and mark approved
    await supabase
      .from('cm_comments')
      .update({ final_reply: finalReply.trim(), status: 'approved', assigned_smm: userEmail || null })
      .eq('id', commentId)

    // Post to Instagram
    try {
      await postReply(comment.comment_id, finalReply.trim(), accessToken)
      await supabase
        .from('cm_comments')
        .update({ status: 'posted', posted_at: new Date().toISOString() })
        .eq('id', commentId)
      return NextResponse.json({ success: true, status: 'posted' })
    } catch (metaErr: any) {
      await supabase
        .from('cm_comments')
        .update({ status: 'failed' })
        .eq('id', commentId)
      return NextResponse.json({ error: `Instagram error: ${metaErr.message}` }, { status: 502 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
