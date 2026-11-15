import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { configured } from './lib/supabase'
import { AppProvider } from './lib/ctx'
import { Header, Sidebar } from './components/Layout'
import { Modals, Toasts } from './components/modals'
import { AdminPage, BoardPage, BoardsPage, FeedPage, NotFound, NotificationsPage, PostPage, ProfilePage, SettingsPage } from './pages/pages'

function Setup() {
  return (
    <main className="setup">
      <div className="logo"><b>18</b>gag</div>
      <h1>Connect your Supabase project</h1>
      <ol>
        <li>In Supabase, open <strong>SQL Editor</strong>, paste the contents of <code>supabase/schema.sql</code> and run it.</li>
        <li>In <strong>Project Settings → API</strong>, copy the Project URL and the anon public key.</li>
        <li>Add them as <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in a <code>.env</code> file (or in Netlify's environment variables), then rebuild.</li>
      </ol>
    </main>
  )
}

// J / K jump between posts
function useKeys() {
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key !== 'j' && e.key !== 'k') return
      const posts = [...document.querySelectorAll('[data-post]')]
      if (!posts.length) return
      const y = 80
      const idx = posts.findIndex((p) => p.getBoundingClientRect().top > y + 4)
      const cur = idx === -1 ? posts.length - 1 : Math.max(0, idx - 1)
      const next = e.key === 'j' ? (idx === -1 ? cur : idx) : Math.max(0, posts[cur].getBoundingClientRect().top < y - 4 ? cur : cur - 1)
      window.scrollTo({ top: window.scrollY + posts[next].getBoundingClientRect().top - y, behavior: 'smooth' })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
}

function Shell() {
  const [menu, setMenu] = useState(false)
  const closeMenu = useCallback(() => setMenu(false), [])
  const loc = useLocation()
  useKeys()
  useEffect(() => { if (!loc.hash) window.scrollTo(0, 0) }, [loc.pathname, loc.search, loc.hash])

  return (
    <>
      <Header onMenu={() => setMenu(true)} />
      <div className="wrap">
        <Sidebar openMobile={menu} onClose={closeMenu} />
        <main className="main page" key={loc.pathname + loc.search}>
          <Routes location={loc}>
            <Route path="/" element={<FeedPage sort="hot" />} />
            <Route path="/trending" element={<FeedPage sort="trending" />} />
            <Route path="/fresh" element={<FeedPage sort="fresh" />} />
            <Route path="/top" element={<FeedPage sort="top" />} />
            <Route path="/following" element={<FeedPage following />} />
            <Route path="/s/:section" element={<FeedPage />} />
            <Route path="/s/:section/:sort" element={<FeedPage />} />
            <Route path="/tag/:tag" element={<FeedPage />} />
            <Route path="/search" element={<FeedPage />} />
            <Route path="/post/:id" element={<PostPage />} />
            <Route path="/u/:username" element={<ProfilePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/boards" element={<BoardsPage />} />
            <Route path="/boards/:slug" element={<BoardPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <Modals />
      <Toasts />
    </>
  )
}

export default function App() {
  if (!configured) return <Setup />
  return <AppProvider><Shell /></AppProvider>
}
