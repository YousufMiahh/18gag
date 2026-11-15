import { useEffect } from 'react'
import { Link } from 'react-router-dom'

const PATHS = {
  up: 'M12 19V5M5 12l7-7 7 7',
  down: 'M12 5v14M5 12l7 7 7-7',
  comment: 'M4 5h16v11H9l-5 4z',
  save: 'M6 4h12v16l-6-4-6 4z',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 7.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zM12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z',
  image: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M9 9h.01',
  send: 'M4 12l16-8-6 16-3-7z',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  chat: 'M4 6h12v8H9l-3 3v-3H4zM18 9h2v9h-2v2l-3-2h-4',
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  trend: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  clock: 'M12 4a8 8 0 100 16 8 8 0 000-16zM12 8v4l3 2',
  crown: 'M4 18h16l1-10-5 4-4-7-4 7-5-4z',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M17 4.5a3.5 3.5 0 010 6.5M18 14.5a6.5 6.5 0 013.5 5.5',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
}

export function Icon({ name, size = 18, fill }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}

export function Avatar({ url, name = '?', size = 32 }) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360
  return url ? (
    <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span className="avatar avatar-blank" style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hue} 70% 50%)` }}>
      {name[0]?.toUpperCase()}
    </span>
  )
}

export function UserLink({ username, pro, className = '' }) {
  return (
    <Link to={`/u/${username}`} className={'userlink ' + className}>
      {username}
      {pro && <span className="pro" title="Pro member">PRO</span>}
    </Link>
  )
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.classList.add('no-scroll')
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('no-scroll') }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Spinner() { return <div className="spinner" role="status" aria-label="Loading" /> }

export function Empty({ title, children }) {
  return <div className="empty"><strong>{title}</strong>{children && <p>{children}</p>}</div>
}

export function ago(ts) {
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000)
  if (m < 1) return 'now'
  if (m < 60) return m + 'm'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h'
  const d = Math.floor(h / 24)
  if (d < 30) return d + 'd'
  if (d < 365) return Math.floor(d / 30) + 'mo'
  return Math.floor(d / 365) + 'y'
}

export function fmt(n) {
  const a = Math.abs(n)
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'm'
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(n)
}
