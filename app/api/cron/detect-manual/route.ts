import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { checkCommentReplies } from '@/lib/meta'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const results = { checked: 0, updated: 0, errors: [] as string[] }

  try {
    // Get all pending comments with their client info
    const { data: pendingComments, error } = await supabase
      .from('cm_comments')
      .select('id, comment_id, client_id, cm_clients(page_access_token)')
      .eq('status', 'pending')
      .limit(200)

    if (error) throw new Error(error.message)
    if (!pendingComments || pendingComments.length === 0) {
      return NextResponse.json({ message: 'No pending comments to check', ...results })
    }

    for (const comment of pendingComments) {
      results.checked++
      try {
        const client = (comment as any).cm_clients
        if (!client?.page_access_token) continue

        const hasReply = await checkCommentReplies(comment.comment_id, client.page_access_token)

        if (hasReply) {
          await supabase
            .from('cm_comments')
            .update({ status: 'manually_replied' })
            .eq('id', comment.id)
          results.updated++
        }

        await new Promise((r) => setTimeout(r, 100))
      } catch (err: any) {
        results.errors.push(`Comment ${comment.id}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...results,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
