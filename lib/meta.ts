const GRAPH = 'https://graph.facebook.com/v19.0'

export async function getInstagramPosts(instagramId: string, accessToken: string) {
  const since = Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000) // 3 hours ago
  const url = `${GRAPH}/${instagramId}/media?fields=id,caption,permalink,timestamp&since=${since}&limit=20&access_token=${accessToken}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return (data.data || []) as Array<{
    id: string
    caption?: string
    permalink?: string
    timestamp: string
  }>
}

export async function getPostComments(mediaId: string, accessToken: string) {
  const url = `${GRAPH}/${mediaId}/comments?fields=id,text,username,timestamp&limit=50&access_token=${accessToken}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  const data = await res.json()
  if (data.error) return []
  return (data.data || []) as Array<{
    id: string
    text: string
    username: string
    timestamp: string
  }>
}

export async function checkCommentReplies(commentId: string, accessToken: string): Promise<boolean> {
  try {
    const url = `${GRAPH}/${commentId}/replies?fields=id&limit=1&access_token=${accessToken}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    const data = await res.json()
    if (data.error) return false
    return (data.data || []).length > 0
  } catch {
    return false
  }
}

export async function postReply(commentId: string, message: string, accessToken: string) {
  const res = await fetch(`${GRAPH}/${commentId}/replies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: accessToken }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data as { id: string }
}

export async function verifyPageAndGetInstagramId(pageId: string, accessToken: string) {
  const url = `${GRAPH}/${pageId}?fields=name,instagram_business_account,access_token&access_token=${accessToken}`
  const res = await fetch(url, { next: { revalidate: 0 } })
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  if (!data.instagram_business_account?.id) {
    throw new Error('No Instagram Business Account linked to this Facebook Page.')
  }
  return {
    pageName: data.name as string,
    instagramId: data.instagram_business_account.id as string,
    pageAccessToken: (data.access_token || accessToken) as string,
  }
}
