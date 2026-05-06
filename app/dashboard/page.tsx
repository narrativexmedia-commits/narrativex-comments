'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { timeAgo, formatDateTime, cn, STATUS_LABELS, STATUS_COLORS } from '@/lib/utils'
import type { Client, Comment, CommentStatus } from '@/lib/utils'

const TABS: { key: CommentStatus | 'all'; label: string; icon: string }[] = [
  { key: 'pending', label: 'Pending', icon: '⏳' },
  { key: 'negative', label: 'Negative', icon: '🚨' },
  { key: 'approved', label: 'Approved', icon: '✅' },
  { key: 'rejected', label: 'Rejected', icon: '✗' },
  { key: 'posted', label: 'Posted', icon: '🔵' },
  { key: 'manually_replied', label: 'Manual', icon: '✋' },
]

export default function DashboardPage() {
  const router = useRouter()
  const supabase = createClient()

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [user, setUser] = useState<{ email?: string; id: string } | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<CommentStatus>('pending')
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [clientSearch, setClientSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Modals
  const [editModal, setEditModal] = useState<{ comment: Comment } | null>(null)
  const [editText, setEditText] = useState('')
  const [writeReplyModal, setWriteReplyModal] = useState<{ comment: Comment } | null>(null)
  const [writeReplyText, setWriteReplyText] = useState('')
  const [addClientModal, setAddClientModal] = useState(false)
  const [addClientForm, setAddClientForm] = useState({
    page_name: '', page_id: '', page_access_token: '', page_description: ''
  })
  const [addClientLoading, setAddClientLoading] = useState(false)
  const [addClientError, setAddClientError] = useState('')

  const [toast, setToast] = useState<{ msg: string; type?: 'ok' | 'err' } | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const refreshRef = useRef<NodeJS.Timeout | null>(null)

  // ── Theme ──
  useEffect(() => {
    const saved = (localStorage.getItem('nx-theme') as 'dark' | 'light') || 'dark'
    setTheme(saved)
    document.documentElement.classList.toggle('dark', saved === 'dark')
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('nx-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/login'); return }
      setUser({ email: data.user.email, id: data.user.id })
    })
  }, [])

  // ── Load clients ──
  const loadClients = useCallback(async () => {
    const { data } = await supabase
      .from('cm_clients')
      .select('*')
      .eq('is_active', true)
      .order('page_name')

    if (!data) return

    // Get badge counts
    const { data: counts } = await supabase
      .from('cm_comments')
      .select('client_id, status')
      .in('status', ['pending', 'negative'])

    const countMap: Record<string, { pending: number; negative: number }> = {}
    counts?.forEach((c) => {
      if (!countMap[c.client_id]) countMap[c.client_id] = { pending: 0, negative: 0 }
      if (c.status === 'pending') countMap[c.client_id].pending++
      if (c.status === 'negative') countMap[c.client_id].negative++
    })

    setClients(
      data.map((cl) => ({
        ...cl,
        pending_count: countMap[cl.id]?.pending || 0,
        negative_count: countMap[cl.id]?.negative || 0,
      }))
    )
  }, [])

  useEffect(() => { loadClients() }, [loadClients])

  // ── Load comments ──
  const loadComments = useCallback(async () => {
    if (!selectedClientId) return
    setLoadingComments(true)
    setSelectedIds(new Set())

    const { data } = await supabase
      .from('cm_comments')
      .select('*')
      .eq('client_id', selectedClientId)
      .eq('status', activeTab)
      .order('created_at', { ascending: false })
      .limit(100)

    setComments(data || [])
    setLoadingComments(false)
  }, [selectedClientId, activeTab])

  useEffect(() => { loadComments() }, [loadComments])

  // ── Auto-refresh every 60s ──
  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(() => {
      loadClients()
      loadComments()
    }, 60000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [loadClients, loadComments])

  // ── Toast ──
  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Sign out ──
  const signOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // ── Actions ──
  const approveComment = async (comment: Comment) => {
    setActionLoading(comment.id)
    try {
      const res = await fetch('/api/comments/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id, userEmail: user?.email }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Reply approved & posting to Instagram…')
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      loadClients()
    } catch (e: any) {
      showToast(e.message || 'Failed to approve', 'err')
    }
    setActionLoading(null)
  }

  const rejectComment = async (comment: Comment) => {
    setActionLoading(comment.id)
    try {
      const res = await fetch('/api/comments/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id, userEmail: user?.email }),
      })
      if (!res.ok) throw new Error('Failed')
      showToast('Comment rejected')
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
      loadClients()
    } catch {
      showToast('Failed to reject', 'err')
    }
    setActionLoading(null)
  }

  const deleteComment = async (comment: Comment) => {
    if (!confirm('Remove this comment from the dashboard? (Instagram is not affected)')) return
    setActionLoading(comment.id)
    try {
      const res = await fetch('/api/comments/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: comment.id }),
      })
      if (!res.ok) throw new Error('Failed')
      showToast('Comment removed')
      setComments((prev) => prev.filter((c) => c.id !== comment.id))
    } catch {
      showToast('Failed to delete', 'err')
    }
    setActionLoading(null)
  }

  const saveEdit = async () => {
    if (!editModal || !editText.trim()) return
    setActionLoading('edit')
    try {
      const res = await fetch('/api/comments/edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: editModal.comment.id,
          finalReply: editText.trim(),
          userEmail: user?.email,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      showToast('Reply updated & approved — posting now…')
      setComments((prev) => prev.filter((c) => c.id !== editModal.comment.id))
      setEditModal(null)
      loadClients()
    } catch {
      showToast('Failed to save edit', 'err')
    }
    setActionLoading(null)
  }

  const saveWriteReply = async () => {
    if (!writeReplyModal || !writeReplyText.trim()) return
    setActionLoading('write')
    try {
      const res = await fetch('/api/comments/write-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: writeReplyModal.comment.id,
          reply: writeReplyText.trim(),
          userEmail: user?.email,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      showToast('Reply posted to Instagram!')
      setComments((prev) => prev.filter((c) => c.id !== writeReplyModal.comment.id))
      setWriteReplyModal(null)
    } catch {
      showToast('Failed to post reply', 'err')
    }
    setActionLoading(null)
  }

  const bulkAction = async (action: 'approve' | 'reject') => {
    if (selectedIds.size === 0) return
    setActionLoading('bulk')
    try {
      const res = await fetch('/api/comments/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentIds: Array.from(selectedIds),
          action,
          userEmail: user?.email,
        }),
      })
      if (!res.ok) throw new Error('Failed')
      showToast(`${selectedIds.size} comment(s) ${action === 'approve' ? 'approved' : 'rejected'}`)
      setComments((prev) => prev.filter((c) => !selectedIds.has(c.id)))
      setSelectedIds(new Set())
      loadClients()
    } catch {
      showToast('Bulk action failed', 'err')
    }
    setActionLoading(null)
  }

  const addClient = async () => {
    if (!addClientForm.page_name || !addClientForm.page_id || !addClientForm.page_access_token) {
      setAddClientError('Page name, Page ID, and Access Token are required.')
      return
    }
    setAddClientLoading(true)
    setAddClientError('')
    try {
      const res = await fetch('/api/clients/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addClientForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add client')
      showToast(`${data.pageName || addClientForm.page_name} added!`)
      setAddClientModal(false)
      setAddClientForm({ page_name: '', page_id: '', page_access_token: '', page_description: '' })
      setTimeout(loadClients, 1000)
    } catch (e: any) {
      setAddClientError(e.message || 'Failed to add client')
    }
    setAddClientLoading(false)
  }

  // ── Selected client ──
  const selectedClient = clients.find((c) => c.id === selectedClientId)
  const filteredClients = clients.filter((c) =>
    c.page_name.toLowerCase().includes(clientSearch.toLowerCase())
  )

  const tabCounts = useCallback(() => {
    const c = selectedClient
    if (!c) return {}
    return {
      pending: c.pending_count || 0,
      negative: c.negative_count || 0,
    }
  }, [selectedClient])()

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === comments.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(comments.map((c) => c.id)))
  }

  const getReplyText = (c: Comment) => c.final_reply || c.ai_reply || ''

  // ─── Render ───
  const SidebarContent = () => (
    <>
      <div className="p-5 border-b border-nx" style={{ borderColor: 'var(--nx-border)' }}>
        <div className="flex items-center gap-2.5 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--nx-orange)' }}
          >
            <svg width="16" height="16" fill="none" stroke="white" strokeWidth="2.2" viewBox="0 0 24 24">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <span className="font-display font-bold text-nx-text text-base" style={{ fontFamily: 'Syne, sans-serif' }}>
            NarrativeX
          </span>
        </div>
        <input
          className="nx-input text-sm"
          style={{ padding: '8px 12px' }}
          placeholder="Search clients…"
          value={clientSearch}
          onChange={(e) => setClientSearch(e.target.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredClients.map((c) => {
          const totalBadge = (c.pending_count || 0) + (c.negative_count || 0)
          return (
            <button
              key={c.id}
              onClick={() => {
                setSelectedClientId(c.id)
                setActiveTab('pending')
                setSidebarOpen(false)
              }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all',
                selectedClientId === c.id
                  ? 'bg-nx-orange-glow text-nx-orange'
                  : 'hover-nx-card text-nx-text-2 hover:text-nx-text'
              )}
              style={{
                background: selectedClientId === c.id ? 'var(--nx-orange-glow)' : undefined,
              }}
            >
              <span className="text-sm font-medium truncate">{c.page_name}</span>
              {totalBadge > 0 && (
                <span className="badge-count ml-2 flex-shrink-0">{totalBadge}</span>
              )}
            </button>
          )
        })}

        {filteredClients.length === 0 && (
          <p className="text-nx-text-3 text-sm text-center py-8">No clients found</p>
        )}
      </div>

      <div className="p-3 border-t" style={{ borderColor: 'var(--nx-border)' }}>
        <button
          onClick={() => { setAddClientModal(true); setSidebarOpen(false) }}
          className="w-full btn-ghost text-sm justify-center"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add New Client
        </button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-nx-bg">
      {/* ── Desktop Sidebar ── */}
      <aside className="sidebar">
        <SidebarContent />
      </aside>

      {/* ── Mobile Sidebar Overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
          <div
            className="relative z-10 flex flex-col"
            style={{
              width: '280px',
              background: 'var(--nx-surface)',
              borderRight: '1px solid var(--nx-border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent />
          </div>
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="main-content flex-1 flex flex-col">
        {/* ── Mobile Top Header ── */}
        <header
          className="mobile-header sticky top-0 z-30 items-center justify-between px-4 py-3"
          style={{
            background: 'var(--nx-surface)',
            borderBottom: '1px solid var(--nx-border)',
          }}
        >
          <button onClick={() => setSidebarOpen(true)} className="btn-ghost" style={{ padding: '6px 10px' }}>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-display font-bold text-nx-text text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
            {selectedClient?.page_name || 'NarrativeX'}
          </span>
          <button onClick={toggleTheme} className="btn-ghost" style={{ padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>

        {/* ── Desktop Top Bar ── */}
        <header
          className="hidden md:flex sticky top-0 z-30 items-center justify-between px-6 py-3.5"
          style={{
            background: 'var(--nx-surface)',
            borderBottom: '1px solid var(--nx-border)',
          }}
        >
          <div className="flex items-center gap-3">
            {selectedClient ? (
              <>
                <h1 className="font-display font-bold text-nx-text text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
                  {selectedClient.page_name}
                </h1>
                <button
                  onClick={() => { loadClients(); loadComments() }}
                  className="btn-ghost text-xs"
                  style={{ padding: '5px 10px' }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                  Refresh
                </button>
              </>
            ) : (
              <h1 className="font-display font-bold text-nx-text-2 text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
                Select a client
              </h1>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={toggleTheme} className="btn-ghost text-sm" style={{ padding: '6px 12px' }}>
              {theme === 'dark' ? (
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <span className="text-nx-text-3 text-sm hidden lg:block">{user?.email}</span>
            <button onClick={signOut} className="btn-ghost text-sm" style={{ padding: '6px 12px' }}>
              Sign Out
            </button>
          </div>
        </header>

        {/* ── Content Area ── */}
        {!selectedClientId ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: 'var(--nx-orange-glow)', border: '1px solid rgba(249,115,22,0.2)' }}
              >
                <svg width="28" height="28" fill="none" stroke="var(--nx-orange)" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <h2 className="font-display font-bold text-nx-text text-xl mb-2" style={{ fontFamily: 'Syne, sans-serif' }}>
                Select a client
              </h2>
              <p className="text-nx-text-2 text-sm">Choose a client from the sidebar to review their comments</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Tabs */}
            <div
              className="sticky z-20 px-4 md:px-6 py-3"
              style={{ top: '57px', background: 'var(--nx-bg)', borderBottom: '1px solid var(--nx-border)' }}
            >
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {TABS.map((tab) => {
                  const count = tab.key === 'pending' ? tabCounts.pending : tab.key === 'negative' ? tabCounts.negative : undefined
                  return (
                    <button
                      key={tab.key}
                      className={cn('tab-btn flex items-center gap-1.5', activeTab === tab.key && 'active')}
                      onClick={() => setActiveTab(tab.key as CommentStatus)}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                      {count !== undefined && count > 0 && (
                        <span className="badge-count">{count}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Bulk actions */}
              {(activeTab === 'pending' || activeTab === 'negative') && comments.length > 0 && (
                <div className="flex items-center gap-2 mt-2.5">
                  <button onClick={selectAll} className="btn-ghost text-xs" style={{ padding: '4px 10px' }}>
                    {selectedIds.size === comments.length ? 'Deselect All' : `Select All (${comments.length})`}
                  </button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-nx-text-3 text-xs">{selectedIds.size} selected</span>
                      <button
                        onClick={() => bulkAction('approve')}
                        className="btn-approve text-xs"
                        style={{ padding: '4px 12px' }}
                        disabled={actionLoading === 'bulk'}
                      >
                        Bulk Approve
                      </button>
                      <button
                        onClick={() => bulkAction('reject')}
                        className="btn-reject text-xs"
                        style={{ padding: '4px 12px' }}
                        disabled={actionLoading === 'bulk'}
                      >
                        Bulk Reject
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Comment list */}
            <div className="flex-1 p-4 md:p-6">
              {loadingComments ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="comment-card p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="skeleton w-8 h-8 rounded-full" />
                        <div className="space-y-1.5 flex-1">
                          <div className="skeleton h-3.5 w-32" />
                          <div className="skeleton h-3 w-20" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="skeleton h-3.5 w-full" />
                        <div className="skeleton h-3.5 w-3/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-16">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: 'var(--nx-surface-2)' }}
                  >
                    <svg width="20" height="20" fill="none" stroke="var(--nx-text-3)" strokeWidth="1.8" viewBox="0 0 24 24">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                  <p className="text-nx-text-2 font-medium">No {STATUS_LABELS[activeTab]} comments</p>
                  <p className="text-nx-text-3 text-sm mt-1">All clear here 👍</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-3xl">
                  {comments.map((comment) => (
                    <CommentCard
                      key={comment.id}
                      comment={comment}
                      isSelected={selectedIds.has(comment.id)}
                      onSelect={() => toggleSelect(comment.id)}
                      showCheckbox={activeTab === 'pending' || activeTab === 'negative'}
                      isLoading={actionLoading === comment.id}
                      onApprove={() => approveComment(comment)}
                      onReject={() => rejectComment(comment)}
                      onEdit={() => { setEditText(getReplyText(comment)); setEditModal({ comment }) }}
                      onDelete={() => deleteComment(comment)}
                      onWriteReply={() => { setWriteReplyText(''); setWriteReplyModal({ comment }) }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Mobile Bottom Nav ── */}
        <nav
          className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-30 items-center justify-around py-2 px-1"
          style={{
            background: 'var(--nx-surface)',
            borderTop: '1px solid var(--nx-border)',
          }}
        >
          {selectedClientId ? (
            TABS.slice(0, 5).map((tab) => {
              const count = tab.key === 'pending' ? tabCounts.pending : tab.key === 'negative' ? tabCounts.negative : undefined
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as CommentStatus)}
                  className={cn(
                    'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg flex-1',
                    activeTab === tab.key ? 'text-nx-orange' : 'text-nx-text-3'
                  )}
                  style={{ color: activeTab === tab.key ? 'var(--nx-orange)' : undefined }}
                >
                  <span className="text-base leading-none relative">
                    {tab.icon}
                    {count !== undefined && count > 0 && (
                      <span
                        className="absolute -top-1 -right-2 badge-count"
                        style={{ fontSize: '9px', padding: '0 4px', minWidth: '14px' }}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </button>
              )
            })
          ) : (
            <div className="flex-1 flex items-center justify-center text-nx-text-3 text-sm py-2">
              Select a client from the menu ☰
            </div>
          )}
        </nav>
      </div>

      {/* ── Edit Modal ── */}
      {editModal && (
        <div className="modal-backdrop">
          <div className="modal-box p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-nx-text text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
                Edit Reply
              </h3>
              <button onClick={() => setEditModal(null)} className="btn-ghost" style={{ padding: '5px 8px' }}>✕</button>
            </div>

            <div className="mb-4">
              <p className="text-xs text-nx-text-3 mb-1.5 font-medium uppercase tracking-wide">Original Comment</p>
              <div
                className="text-sm text-nx-text-2 px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--nx-surface-2)', border: '1px solid var(--nx-border)' }}
              >
                @{editModal.comment.commenter_name}: {editModal.comment.comment_text}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs text-nx-text-3 mb-1.5 font-medium uppercase tracking-wide">
                Your Reply
              </label>
              <textarea
                className="nx-input"
                style={{ minHeight: 120, resize: 'vertical' }}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Edit the reply…"
              />
              <p className="text-right text-xs text-nx-text-3 mt-1">{editText.length} chars</p>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditModal(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={saveEdit}
                className="btn-primary"
                disabled={actionLoading === 'edit' || !editText.trim()}
              >
                {actionLoading === 'edit' ? 'Saving…' : 'Save & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Write Reply Modal ── */}
      {writeReplyModal && (
        <div className="modal-backdrop">
          <div className="modal-box p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-nx-text text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
                Write Reply
              </h3>
              <button onClick={() => setWriteReplyModal(null)} className="btn-ghost" style={{ padding: '5px 8px' }}>✕</button>
            </div>

            <div className="mb-4">
              <p className="text-xs text-nx-text-3 mb-1.5 font-medium uppercase tracking-wide">Comment</p>
              <div
                className="text-sm text-nx-text-2 px-3 py-2.5 rounded-lg"
                style={{ background: 'var(--nx-surface-2)', border: '1px solid var(--nx-border)' }}
              >
                @{writeReplyModal.comment.commenter_name}: {writeReplyModal.comment.comment_text}
              </div>
            </div>

            <div className="mb-5">
              <label className="block text-xs text-nx-text-3 mb-1.5 font-medium uppercase tracking-wide">
                Your Reply
              </label>
              <textarea
                className="nx-input"
                style={{ minHeight: 100, resize: 'vertical' }}
                value={writeReplyText}
                onChange={(e) => setWriteReplyText(e.target.value)}
                placeholder="Write a custom reply…"
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setWriteReplyModal(null)} className="btn-ghost">Cancel</button>
              <button
                onClick={saveWriteReply}
                className="btn-primary"
                disabled={actionLoading === 'write' || !writeReplyText.trim()}
              >
                {actionLoading === 'write' ? 'Posting…' : 'Post Reply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Client Modal ── */}
      {addClientModal && (
        <div className="modal-backdrop">
          <div className="modal-box p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-bold text-nx-text text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
                Add New Client
              </h3>
              <button onClick={() => { setAddClientModal(false); setAddClientError('') }} className="btn-ghost" style={{ padding: '5px 8px' }}>✕</button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-nx-text-2 mb-1.5">Client Name *</label>
                <input className="nx-input" placeholder="e.g. Daawat Biryani House"
                  value={addClientForm.page_name}
                  onChange={(e) => setAddClientForm((p) => ({ ...p, page_name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-nx-text-2 mb-1.5">Facebook Page ID *</label>
                <input className="nx-input" placeholder="e.g. 123456789012345"
                  value={addClientForm.page_id}
                  onChange={(e) => setAddClientForm((p) => ({ ...p, page_id: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-nx-text-2 mb-1.5">Page Access Token *</label>
                <input className="nx-input" placeholder="Long-lived access token"
                  value={addClientForm.page_access_token}
                  onChange={(e) => setAddClientForm((p) => ({ ...p, page_access_token: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-nx-text-2 mb-1.5">AI Brand Persona</label>
                <textarea className="nx-input" style={{ minHeight: 80, resize: 'vertical' }}
                  placeholder="Describe the brand's tone and style for AI reply generation…"
                  value={addClientForm.page_description}
                  onChange={(e) => setAddClientForm((p) => ({ ...p, page_description: e.target.value }))} />
              </div>

              {addClientError && (
                <div className="text-sm px-4 py-3 rounded-lg"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                  {addClientError}
                </div>
              )}

              <div className="flex gap-3 justify-end pt-1">
                <button onClick={() => { setAddClientModal(false); setAddClientError('') }} className="btn-ghost">
                  Cancel
                </button>
                <button onClick={addClient} className="btn-primary" disabled={addClientLoading}>
                  {addClientLoading ? 'Verifying…' : 'Add & Verify'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className="toast"
          style={{
            color: toast.type === 'err' ? '#ef4444' : 'var(--nx-text)',
            borderColor: toast.type === 'err' ? 'rgba(239,68,68,0.3)' : 'var(--nx-border)',
          }}
        >
          {toast.type === 'err' ? '⚠️ ' : '✓ '}{toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Comment Card Component ───
interface CommentCardProps {
  comment: Comment
  isSelected: boolean
  onSelect: () => void
  showCheckbox: boolean
  isLoading: boolean
  onApprove: () => void
  onReject: () => void
  onEdit: () => void
  onDelete: () => void
  onWriteReply: () => void
}

function CommentCard({
  comment, isSelected, onSelect, showCheckbox, isLoading,
  onApprove, onReject, onEdit, onDelete, onWriteReply,
}: CommentCardProps) {
  const replyText = comment.final_reply || comment.ai_reply || ''
  const canAct = comment.status === 'pending' || comment.status === 'negative'
  const canWrite = comment.status === 'rejected'

  return (
    <div
      className={cn(
        'comment-card p-4 md:p-5',
        comment.status === 'negative' && 'negative',
        isSelected && 'selected'
      )}
    >
      <div className="flex items-start gap-3">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onSelect}
            className="mt-1 flex-shrink-0 accent-orange-500"
            style={{ width: 16, height: 16 }}
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                style={{ background: 'var(--nx-orange-glow)', color: 'var(--nx-orange)' }}
              >
                {(comment.commenter_name || 'U')[0].toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-nx-text truncate">
                @{comment.commenter_name || 'unknown'}
              </span>
              <span className="text-xs text-nx-text-3 flex-shrink-0">{timeAgo(comment.created_at)}</span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'text-xs font-semibold px-2 py-0.5 rounded-full border',
                  STATUS_COLORS[comment.status]
                )}
              >
                {STATUS_LABELS[comment.status]}
              </span>
              <button
                onClick={onDelete}
                className="text-nx-text-3 hover:text-red-400 transition-colors"
                style={{ opacity: 0.6 }}
                title="Remove from dashboard"
              >
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4h6v2" />
                </svg>
              </button>
            </div>
          </div>

          {/* Comment text */}
          <p className="text-nx-text text-sm leading-relaxed mb-2">{comment.comment_text}</p>

          {/* Post context */}
          {(comment.post_caption || comment.post_permalink) && (
            <div className="flex items-center gap-2 mb-3">
              {comment.post_caption && (
                <p className="text-xs text-nx-text-3 truncate flex-1" title={comment.post_caption}>
                  📷 {comment.post_caption.slice(0, 60)}{comment.post_caption.length > 60 ? '…' : ''}
                </p>
              )}
              {comment.post_permalink && (
                <a
                  href={comment.post_permalink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium flex-shrink-0"
                  style={{ color: 'var(--nx-orange)' }}
                >
                  View Post ↗
                </a>
              )}
            </div>
          )}

          {/* AI Reply */}
          {replyText && (
            <div className="reply-box mb-3 text-sm">
              <span className="text-xs font-semibold text-nx-text-3 block mb-1">
                {comment.final_reply ? '✏️ Edited Reply' : '🤖 AI Draft'}
              </span>
              {replyText}
            </div>
          )}

          {/* Posted info */}
          {comment.status === 'posted' && comment.posted_at && (
            <p className="text-xs text-nx-text-3 mb-3">
              Posted {formatDateTime(comment.posted_at)}
            </p>
          )}

          {/* SMM info */}
          {comment.assigned_smm && (
            <p className="text-xs text-nx-text-3 mb-3">By {comment.assigned_smm}</p>
          )}

          {/* Action buttons */}
          {canAct && (
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="spinner" />
                  <span className="text-xs text-nx-text-3">Processing…</span>
                </div>
              ) : (
                <>
                  <button onClick={onApprove} className="btn-approve">✓ Approve</button>
                  <button onClick={onEdit} className="btn-edit">✏️ Edit</button>
                  <button onClick={onReject} className="btn-reject">✗ Reject</button>
                </>
              )}
            </div>
          )}

          {canWrite && (
            <div className="mt-2">
              <button onClick={onWriteReply} className="btn-edit">
                ✍️ Write Reply
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
