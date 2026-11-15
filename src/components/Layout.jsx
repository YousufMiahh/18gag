import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../lib/ctx'
import * as api from '../lib/api'
import { Avatar, Icon } from './ui'

export function Header({ onMenu }) {
  const { user, profile, unread, open, need, theme, setTheme, signOut } = useApp()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [menu, setMenu] = useState(false)
  const ref = useRef(null)
  const loc = useLocation()

  useEffect(() => setMenu(false), [loc])
  useEffect(() => {
    if (!menu) return
    const off = (e) => !ref.current?.contains(e.target) && setMenu(false)
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [menu])

  const search = (e) => {
    e.preventDefault()
    if (q.trim()) nav(`/search?q=${encodeURIComponent(q.trim())}`)
  }
  const nextTheme = () => {
    const dark = theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
    setTheme(dark ? 'light' : 'dark')
  }

  return (
    <header className="bar">
      <div className="bar-in">
        <button className="icon-btn ghost only-mobile" onClick={onMenu} aria-label="Open menu"><Icon name="menu" size={22} /></button>
        <Link className="logo" to="/" aria-label="18gag home"><b>18</b>gag</Link>
        <form className="search" onSubmit={search} role="search">
          <Icon name="search" size={16} />
          <input id="site-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search posts and tags" aria-label="Search posts and tags" />
        </form>
        <button className="icon-btn ghost" onClick={nextTheme} aria-label="Switch light or dark theme"><Icon name="sun" /></button>
        {user && (
          <Link className="icon-btn ghost bell" to="/notifications" aria-label={`Notifications, ${unread} unread`}>
            <Icon name="bell" />{unread > 0 && <span className="badge">{unread > 99 ? '99+' : unread}</span>}
          </Link>
        )}
        <button className="btn small post-btn" onClick={() => need(() => open('upload'))}><Icon name="plus" size={16} /><span>Post</span></button>
        {user ? (
          <div className="menu-wrap" ref={ref}>
            <button className="avatar-btn" onClick={() => setMenu((m) => !m)} aria-label="Account menu" aria-expanded={menu}>
              <Avatar url={profile?.avatar_url} name={profile?.username || '?'} size={34} />
            </button>
            {menu && (
              <div className="menu right">
                {profile && <Link to={`/u/${profile.username}`}>My profile</Link>}
                {profile && <span className="menu-info"><Icon name="flame" size={15} /> {profile.streak}-day streak</span>}
                <Link to="/settings">Settings</Link>
                {profile?.is_admin && <Link to="/admin">Moderation</Link>}
                <button onClick={signOut}>Log out</button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn small outline" onClick={() => open('auth')}>Log in</button>
        )}
      </div>
    </header>
  )
}

export function Sidebar({ openMobile, onClose }) {
  const { sections, lists, uid, need, reloadLists, toast } = useApp()
  const loc = useLocation()
  useEffect(() => onClose(), [loc]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (slug) => need(async () => {
    const on = !lists.sections.has(slug)
    await api.setSectionFollow(uid, slug, on)
    await reloadLists()
    toast(on ? 'Added to your Following feed' : 'Removed from your Following feed')
  })

  const main = [['/', 'Hot', 'home'], ['/trending', 'Trending', 'trend'], ['/fresh', 'Fresh', 'clock'], ['/top', 'Top this week', 'crown'], ['/following', 'Following', 'users'], ['/boards', 'Boards', 'chat']]
  return (
    <>
      {openMobile && <div className="scrim" onClick={onClose} />}
      <nav className={'side' + (openMobile ? ' open' : '')} aria-label="Browse">
        {main.map(([to, label, icon]) => (
          <NavLink key={to} to={to} end className="side-link"><Icon name={icon} /><span>{label}</span></NavLink>
        ))}
        <h2>Sections</h2>
        {sections.map((s) => (
          <div key={s.slug} className="side-row">
            <NavLink to={`/s/${s.slug}`} className="side-link"><span>{s.name}</span></NavLink>
            <button className={'star' + (lists.sections.has(s.slug) ? ' on' : '')} onClick={() => toggle(s.slug)}
              aria-pressed={lists.sections.has(s.slug)} aria-label={`Follow ${s.name}`}>
              <Icon name="star" size={15} fill={lists.sections.has(s.slug)} />
            </button>
          </div>
        ))}
        <p className="side-foot">18gag · a personal project<br />Press J and K to move between posts.</p>
      </nav>
    </>
  )
}
