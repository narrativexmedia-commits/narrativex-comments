import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { verifyPageAndGetInstagramId } from '@/lib/meta'

export async function POST(request: Request) {
  try {
    const { page_name, page_id, page_access_token, page_description } = await request.json()

    if (!page_name || !page_id || !page_access_token) {
      return NextResponse.json({ error: 'page_name, page_id, and page_access_token are required' }, { status: 400 })
    }

    // Verify the page with Meta and get Instagram ID
    let instagramId: string
    let resolvedToken: string
    let resolvedPageName: string

    try {
      const result = await verifyPageAndGetInstagramId(page_id, page_access_token)
      instagramId = result.instagramId
      resolvedToken = result.pageAccessToken || page_access_token
      resolvedPageName = result.pageName || page_name
    } catch (metaErr: any) {
      return NextResponse.json(
        { error: `Meta API error: ${metaErr.message}` },
        { status: 422 }
      )
    }

    const supabase = createServiceClient()

    // Check if page_id already exists
    const { data: existing } = await supabase
      .from('cm_clients')
      .select('id')
      .eq('page_id', page_id)
      .single()

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('cm_clients')
        .update({
          page_name,
          instagram_id: instagramId,
          page_access_token: resolvedToken,
          page_description: page_description || null,
          is_active: true,
        })
        .eq('page_id', page_id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, updated: true, pageName: page_name, instagramId })
    }

    // Insert new
    const { error } = await supabase.from('cm_clients').insert({
      page_name,
      page_id,
      instagram_id: instagramId,
      page_access_token: resolvedToken,
      page_description: page_description || null,
      is_active: true,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, updated: false, pageName: page_name, instagramId })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
