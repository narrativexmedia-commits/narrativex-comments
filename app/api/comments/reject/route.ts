import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'

export async function POST(request: Request) {
  try {
    const { commentId, userEmail } = await request.json()
    if (!commentId) return NextResponse.json({ error: 'commentId required' }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase
      .from('cm_comments')
      .update({ status: 'rejected', assigned_smm: userEmail || null })
      .eq('id', commentId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
