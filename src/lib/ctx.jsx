import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const emptyLists = { blocked: new Set(), hidden: new Set(), users: new Set(), sections: new Set(), mutedTags: new Set(), mutedSections: new Set() }

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
const inDarkHours = ({ from, to }, h = new Date().getHours()) => (from <= to ? h >= from && h < to : h >= from || h < to)

export function AppProvider({ children }) {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState(null)
  const [sections, setSections] = useState([])
  const [lists, setLists] = useState(emptyLists)
  const [unread, setUnread] = useState(0)
  const [modal, setModal] = useState(null)
  const [toasts, setToasts] = useState([])
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('18gag.theme') || 'auto' } catch { return 'auto' }
  })
  const [schedule, setSchedule] = useState(() => read('18gag.schedule', { from: 20, to: 7 }))
  const user = session?.user || null
  const uid = user?.id || null
  const streakShown = useRef(false)

  const toast = useCallback((text) => {
    const id = Math.random()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800)
  }, [])

  const open = useCallback((type, props = {}) => setModal({ type, props }), [])
  const close = useCallback(() => setModal(null), [])

  // run fn only when signed in; otherwise show the login box
  const need = useCallback((fn) => (uid ? fn() : setModal({ type: 'auth', props: {} })), [uid])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setModal({ type: 'newpass', props: {} })
    })
    supabase.from('sections').select('*').order('sort').then(({ data }) => setSections(data || []))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reloadProfile = useCallback(async () => {
    if (!uid) return setProfile(null)
    const { data } = await supabase.rpc('touch_streak')
    if (data?.id) {
      setProfile(data)
      if (!streakShown.current && data.streak > 1) {
        streakShown.current = true
        toast(`🔥 ${data.streak}-day streak`)
      }
    }
  }, [uid, toast])

  const reloadLists = useCallback(async () => {
    if (!uid) return setLists(emptyLists)
    const [b, h, f, s, mt, ms] = await Promise.all([
      supabase.from('blocks').select('blocked_id').eq('user_id', uid),
      supabase.from('hidden_posts').select('post_id').eq('user_id', uid),
      supabase.from('follows').select('following_id').eq('follower_id', uid),
      supabase.from('section_follows').select('section').eq('user_id', uid),
      supabase.from('muted_tags').select('tag').eq('user_id', uid),
      supabase.from('muted_sections').select('section').eq('user_id', uid),
    ])
    setLists({
      blocked: new Set((b.data || []).map((r) => r.blocked_id)),
      hidden: new Set((h.data || []).map((r) => r.post_id)),
      users: new Set((f.data || []).map((r) => r.following_id)),
      sections: new Set((s.data || []).map((r) => r.section)),
      mutedTags: new Set((mt.data || []).map((r) => r.tag)),
      mutedSections: new Set((ms.data || []).map((r) => r.section)),
    })
  }, [uid])

  const reloadUnread = useCallback(async () => {
    if (!uid) return setUnread(0)
    const { count } = await supabase
      .from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('read', false)
    setUnread(count || 0)
  }, [uid])

  useEffect(() => {
    reloadProfile(); reloadLists(); reloadUnread()
    if (!uid) return
    const ch = supabase
      .channel('notif-' + uid)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        () => setUnread((n) => n + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [uid, reloadProfile, reloadLists, reloadUnread])

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const t = theme === 'schedule' ? (inDarkHours(schedule) ? 'dark' : 'light') : theme
      if (t === 'auto') root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', t)
    }
    apply()
    try {
      localStorage.setItem('18gag.theme', theme)
      localStorage.setItem('18gag.schedule', JSON.stringify(schedule))
    } catch { /* private mode */ }
    if (theme !== 'schedule') return
    const timer = setInterval(apply, 60000)
    return () => clearInterval(timer)
  }, [theme, schedule])

  const value = useMemo(() => ({
    ready, user, uid, profile, sections, lists, unread, modal, toasts, theme, schedule,
    setTheme, setSchedule, setUnread, toast, open, close, need, reloadProfile, reloadLists, reloadUnread,
    signOut: () => supabase.auth.signOut(),
  }), [ready, user, uid, profile, sections, lists, unread, modal, toasts, theme, schedule,
    toast, open, close, need, reloadProfile, reloadLists, reloadUnread])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
