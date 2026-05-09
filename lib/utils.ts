import { formatDistanceToNow, format } from 'date-fns'

export function timeAgo(date: string | Date): string {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true })
  } catch {
    return 'some time ago'
  }
}

export function formatDateTime(date: string | Date): string {
  try {
    return format(new Date(date), 'dd MMM yyyy, h:mm a')
  } catch {
    return String(date)
  }
}

export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export type CommentStatus =
  | 'pending'
  | 'negative'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'manually_replied'
  | 'failed'
  | 'deleted'

export const STATUS_LABELS: Record<CommentStatus, string> = {
  pending: 'Pending',
  negative: 'Negative',
  approved: 'Approved',
  rejected: 'Rejected',
  posted: 'Posted',
  manually_replied: 'Manual',
  failed: 'Failed',
  deleted: 'Deleted',
}

export const STATUS_COLORS: Record<CommentStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  negative: 'bg-red-500/15 text-red-400 border-red-500/30',
  approved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  rejected: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  posted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  manually_replied: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  deleted: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

export interface Client {
  id: string
  page_name: string
  page_id: string
  instagram_id: string | null
  page_access_token: string
  page_description: string | null
  is_active: boolean
  created_at: string
  pending_count?: number
  negative_count?: number
  approved_count?: number
  rejected_count?: number
  posted_count?: number
  manually_replied_count?: number
  deleted_count?: number
}

export interface Comment {
  id: string
  client_id: string
  comment_id: string
  commenter_name: string | null
  comment_text: string
  post_id: string | null
  post_caption: string | null
  post_permalink: string | null
  ai_reply: string | null
  final_reply: string | null
  status: CommentStatus
  is_negative: boolean
  assigned_smm: string | null
  posted_at: string | null
  created_at: string
}
