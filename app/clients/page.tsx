'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { formatDateTime } from '@/lib/utils'

interface Client {
  id: string
  page_name: string
  page_id: string
  instagram_id: string | null
  is_active: boolean
  created_at: string
}

export default function ClientsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [toggling, setToggling] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.push('/login')
    })
    const saved = (localStorage.getItem('nx-theme') as 'dark' | 'light') || 'dark'
    setTheme(saved)
    document.documentElement.classList.toggle('dark', saved === 'dark')
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('cm_clients')
      .select('id, page_name, page_id, instagram_id, is_active, created_at')
      .order('page_name')
    setClients(data || [])
    setLoading(false)
  }

  useEffect(() => { loadClients() }, [])

  const toggleActive = async (client: Client) => {
    setToggling(client.id)
    await supabase
      .from('cm_clients')
      .update({ is_active: !client.is_active })
      .eq('id', client.id)
    setClients((prev) =>
      prev.map((c) => c.id === client.id ? { ...c, is_active: !c.is_active } : c)
    )
    setToggling(null)
  }

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('nx-theme', next)
    document.documentElement.classList.toggle('dark', next === 'dark')
  }

  const filtered = clients.filter((c) =>
    c.page_name.toLowerCase().includes(search.toLowerCase()) ||
    c.page_id.includes(search)
  )

  return (
    <div className="min-h-screen bg-nx-bg">
      {/* Header */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-4 md:px-6 py-4"
        style={{ background: 'var(--nx-surface)', borderBottom: '1px solid var(--nx-border)' }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost" style={{ padding: '6px 10px' }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Dashboard
          </button>
          <h1 className="font-display font-bold text-nx-text text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
            Clients
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="btn-ghost text-sm" style={{ padding: '6px 10px' }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex items-center justify-between mb-5 gap-3">
          <input
            className="nx-input max-w-xs"
            placeholder="Search clients…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <span className="text-nx-text-3 text-sm flex-shrink-0">{clients.length} clients</span>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton h-16 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((client) => (
              <div
                key={client.id}
                className="comment-card p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
                    style={{ background: 'var(--nx-orange-glow)', color: 'var(--nx-orange)' }}
                  >
                    {client.page_name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-nx-text text-sm truncate">{client.page_name}</p>
                    <p className="text-nx-text-3 text-xs font-mono truncate">
                      Page: {client.page_id}
                      {client.instagram_id && ` · IG: ${client.instagram_id}`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                      client.is_active
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                    }`}
                  >
                    {client.is_active ? 'Active' : 'Paused'}
                  </span>

                  <button
                    onClick={() => toggleActive(client)}
                    className="btn-ghost text-xs"
                    style={{ padding: '5px 10px' }}
                    disabled={toggling === client.id}
                  >
                    {toggling === client.id ? '…' : client.is_active ? 'Pause' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}

            {filtered.length === 0 && (
              <div className="text-center py-12 text-nx-text-3">No clients found</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
