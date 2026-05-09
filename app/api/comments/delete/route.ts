import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { deleteInstagramComment } from '@/lib/meta'

export async function POST(request: Request) {
  try {
    const { commentId, userEmail } = await request.json()
    if (!commentId) {
      return NextResponse.json({ error: 'commentId required' }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Fetch the comment + the client's access token
    const { data: comment, error } = await supabase
      .from('cm_comments')
      .select('*, cm_clients(page_access_token)')
      .eq('id', commentId)
      .single()

    if (error || !comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 })
    }

    const accessToken = (comment as any).cm_clients?.page_access_token
    if (!accessToken) {
      return NextResponse.json({ error: 'Client access token missing' }, { status: 400 })
    }

    // 1. Delete from Instagram
    try {
      await deleteInstagramComment(comment.comment_id, accessToken)
    } catch (igErr: any) {
      const msg = String(igErr?.message || '')
      // If the comment was already gone on IG, treat as success and still mark deleted in DB.
      const alreadyGone = /does not exist|no longer exists|not found|unsupported.*request/i.test(msg)
      if (!alreadyGone) {
        return NextResponse.json(
          { error: `Instagram delete failed: ${msg}` },
          { status: 502 }
        )
      }
    }

    // 2. Soft-delete in DB (keep the row for audit)
    const { error: updateErr } = await supabase
      .from('cm_comments')
      .update({
        status: 'deleted',
        assigned_smm: userEmail || null,
      })
      .eq('id', commentId)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
