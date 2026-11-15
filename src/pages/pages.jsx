import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/ctx'
import * as api from '../lib/api'
import { Feed, PostCard, PostSkeleton } from '../components/PostCard'
import { Comments } from '../components/Comments'
import { Avatar, Empty, Icon, Spinner, UserLink, ago, fmt } from '../components/ui'

function useTitle(t) {
  useEffect(() => { document.title = t ? `${t} · 18gag` : '18gag' }, [t])
}

/* ---------- feeds ---------- */
export function FeedPage({ sort: fixed, following }) {
  const { section, tag, sort: pSort } = useParams()
  const [sp] = useSearchParams()
  const { sections, lists, uid, open, ready } = useApp()
  const q = sp.get('q') || ''
  const sort = fixed || pSort || 'hot'
  const sec = sections.find((s) => s.slug === section)
  useTitle(sec?.name || (tag && `#${tag}`) || (q && `Search: ${q}`) || (following && 'Following') || '')

  if (following) {
    if (ready && !uid) return <Empty title="Log in to see your Following feed">Posts from people and sections you follow show up here. <button className="link" onClick={() => open('auth')}>Log in</button></Empty>
    return (
      <>
        <h1 className="page-title">Following</h1>
        <Feed params={{ sort: 'fresh', following: { users: [...lists.users], sections: [...lists.sections] } }}
          emptyTitle="Your Following feed is empty" emptyText="Follow people from their profile, or tap the star next to a section in the menu." />
      </>
    )
  }

  const base = section ? `/s/${section}` : ''
  const tabs = [['', 'Hot'], ['/trending', 'Trending'], ['/fresh', 'Fresh'], ['/top', 'Top']]
  return (
    <>
      {(sec || tag || q) && <h1 className="page-title">{sec?.name || (tag ? `#${tag}` : `Results for "${q}"`)}</h1>}
      {!tag && !q && (
        <div className="tabs">
          {tabs.map(([path, label]) => <NavLink key={label} to={(base + path) || '/'} end className="tab">{label}</NavLink>)}
        </div>
      )}
      <Feed params={{ sort: tag || q ? 'hot' : sort, section, tag, q }}
        emptyTitle={q ? 'No posts match that search' : 'Nothing here yet'}
        emptyText={q ? 'Try a different word or a tag.' : 'Be the first to post in here.'} />
    </>
  )
}

/* ---------- single post ---------- */
export function PostPage() {
  const { id } = useParams()
  const { uid, ready } = useApp()
  const [post, setPost] = useState(undefined)
  const [awards, setAwards] = useState([])
  const loc = useLocation()
  useTitle(post?.title)

  useEffect(() => {
    if (!ready) return
    setPost(undefined)
    api.fetchPost(id, uid).then(setPost).catch(() => setPost(null))
    api.fetchAwards(id).then(({ data }) => setAwards(data || []))
  }, [id, uid, ready])

  useEffect(() => {
    if (post && loc.hash === '#comments') document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })
  }, [post, loc.hash])

  if (post === undefined) return <PostSkeleton />
  if (!post) return <Empty title="This post is gone">It was deleted or removed. <Link to="/">Back to Hot</Link></Empty>
  const tally = api.AWARDS.map((a) => ({ ...a, n: awards.filter((g) => g.kind === a.k).length })).filter((a) => a.n)
  return (
    <>
      {post.removed && <p className="banner">This post was removed by a moderator. Only you and admins can see it.</p>}
      <PostCard post={post} full />
      {tally.length > 0 && (
        <div className="award-row">{tally.map((a) => <span key={a.k} className="award-chip" title={a.label}>{a.e} {a.n}</span>)}</div>
      )}
      <Comments post={post} />
    </>
  )
}

/* ---------- profile ---------- */
export function ProfilePage() {
  const { username } = useParams()
  const { uid, lists, need, reloadLists, toast, ready } = useApp()
  const [p, setP] = useState(undefined)
  const [tab, setTab] = useState('posts')
  const [extra, setExtra] = useState(null)
  useTitle(p?.username)

  useEffect(() => { setP(undefined); setTab('posts'); api.fetchProfile(username).then(setP) }, [username])
  const me = p && p.id === uid

  useEffect(() => {
    if (!p || !ready) return
    setExtra(null)
    if (tab === 'comments') api.userComments(p.id).then(({ data }) => setExtra(data || []))
    if (tab === 'upvoted') api.myPostIds('post_votes', uid, true).then((ids) => api.fetchPostsByIds(ids, uid)).then(setExtra)
    if (tab === 'saved') api.myPostIds('saves', uid).then((ids) => api.fetchPostsByIds(ids, uid)).then(setExtra)
  }, [tab, p, uid, ready])

  if (p === undefined) return <Spinner />
  if (!p) return <Empty title="No such user">Check the spelling of the username.</Empty>

  const following = lists.users.has(p.id)
  const blocked = lists.blocked.has(p.id)
  const follow = () => need(async () => {
    await api.setFollow(uid, p.id, !following); await reloadLists()
    setP((x) => ({ ...x, followers: x.followers + (following ? -1 : 1) }))
  })
  const block = () => need(async () => {
    await api.setBlock(uid, p.id, !blocked); await reloadLists(); toast(blocked ? 'Unblocked' : 'Blocked')
  })
  const tabs = [['posts', 'Posts'], ['comments', 'Comments'], ...(me ? [['upvoted', 'Upvoted'], ['saved', 'Saved']] : [])]

  return (
    <>
      <section className="profile">
        <Avatar url={p.avatar_url} name={p.username} size={84} />
        <div className="profile-info">
          <h1>{p.display_name || p.username}{p.is_pro && <span className="pro">PRO</span>}</h1>
          <p className="muted">@{p.username} · joined {new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
          {p.bio && <p>{p.bio}</p>}
          <div className="stats">
            <span><b>{fmt(p.posts)}</b> posts</span>
            <span><b>{fmt(p.followers)}</b> followers</span>
            <span><b>{fmt(p.following)}</b> following</span>
            <span title={`Best: ${p.best_streak} days`}><Icon name="flame" size={15} /> <b>{p.streak}</b> day streak</span>
          </div>
          <div className="profile-actions">
            {me ? <Link className="btn small outline" to="/settings">Edit profile</Link> : (
              <>
                <button className={'btn small' + (following ? ' outline' : '')} onClick={follow}>{following ? 'Following' : 'Follow'}</button>
                <button className="btn small outline" onClick={block}>{blocked ? 'Unblock' : 'Block'}</button>
              </>
            )}
          </div>
        </div>
      </section>
      <div className="tabs">
        {tabs.map(([k, label]) => <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'posts' && <Feed params={{ sort: 'fresh', author: p.id }} emptyTitle="No posts yet" />}
      {tab === 'comments' && (!extra ? <Spinner /> : extra.length ? (
        <div className="list">
          {extra.map((c) => (
            <Link key={c.id} className="list-item" to={`/post/${c.post_id}#comments`}>
              <p>{c.body || 'Image comment'}</p><small>{fmt(c.score)} points · {ago(c.created_at)}</small>
            </Link>
          ))}
        </div>
      ) : <Empty title="No comments yet" />)}
      {(tab === 'upvoted' || tab === 'saved') && (!extra ? <Spinner /> : extra.length ? (
        <div className="feed">{extra.map((x) => <PostCard key={x.id} post={x} />)}</div>
      ) : <Empty title={tab === 'saved' ? 'Nothing saved yet' : 'No upvotes yet'}>{tab === 'saved' ? 'Tap the bookmark on a post to keep it here.' : ''}</Empty>)}
    </>
  )
}

/* ---------- settings ---------- */
export function SettingsPage() {
  const { profile, uid, user, reloadProfile, toast, theme, setTheme, open, ready } = useApp()
  const [f, setF] = useState(null)
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  useTitle('Settings')
  useEffect(() => { if (profile && !f) setF({ display_name: profile.display_name || '', bio: profile.bio, show_nsfw: profile.show_nsfw }) }, [profile, f])

  if (ready && !uid) return <Empty title="Log in to change settings"><button className="link" onClick={() => open('auth')}>Log in</button></Empty>
  if (!f) return <Spinner />

  const save = async (e) => {
    e.preventDefault(); setBusy(true)
    const { error } = await api.updateProfile(uid, f)
    setBusy(false)
    if (error) return toast('Could not save. Try again.')
    await reloadProfile(); toast('Profile saved')
  }
  const avatar = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) return toast('Profile pictures must be under 3 MB.')
    try {
      const url = await api.uploadMedia(uid, file, file.name.split('.').pop().toLowerCase())
      await api.updateProfile(uid, { avatar_url: url }); await reloadProfile(); toast('Picture updated')
    } catch { toast('Upload failed. Try again.') }
  }
  const changePw = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return toast(error.message)
    setPw(''); toast('Password changed')
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <form className="card form" onSubmit={save}>
        <div className="avatar-edit">
          <Avatar url={profile.avatar_url} name={profile.username} size={64} />
          <label htmlFor="st-avatar" className="btn small outline">Change picture<input id="st-avatar" type="file" accept="image/*" hidden onChange={avatar} /></label>
        </div>
        <label htmlFor="st-name">Display name<input id="st-name" value={f.display_name} maxLength={40} onChange={(e) => setF({ ...f, display_name: e.target.value })} /></label>
        <label htmlFor="st-bio">Bio<textarea id="st-bio" rows={3} maxLength={200} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} /></label>
        <label htmlFor="st-nsfw" className="check"><input id="st-nsfw" type="checkbox" checked={f.show_nsfw} onChange={(e) => setF({ ...f, show_nsfw: e.target.checked })} />Show sensitive posts without the blur</label>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
      </form>

      <div className="card form">
        <span className="label">Theme</span>
        <div className="seg wide">
          {['auto', 'light', 'dark'].map((t) => <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>{t[0].toUpperCase() + t.slice(1)}</button>)}
        </div>
      </div>

      <form className="card form" onSubmit={changePw}>
        <p className="muted">Signed in as {user?.email}</p>
        <label htmlFor="st-pw">New password<input id="st-pw" type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" required /></label>
        <button className="btn outline">Change password</button>
      </form>
    </>
  )
}

/* ---------- notifications ---------- */
export function NotificationsPage() {
  const { uid, setUnread, open, ready } = useApp()
  const [rows, setRows] = useState(null)
  useTitle('Notifications')
  useEffect(() => {
    if (!uid) return
    api.fetchNotifications(uid).then(({ data }) => {
      setRows(data || [])
      api.markAllRead(uid).then(() => setUnread(0))
    })
  }, [uid, setUnread])

  if (ready && !uid) return <Empty title="Log in to see notifications"><button className="link" onClick={() => open('auth')}>Log in</button></Empty>
  if (!rows) return <Spinner />
  const text = (n) => ({
    comment: <>commented on <b>{n.post_title}</b></>,
    reply: <>replied to your comment on <b>{n.post_title}</b></>,
    follow: <>started following you</>,
    award: <>gave your post <b>{n.post_title}</b> {api.AWARDS.find((a) => a.k === n.meta)?.e || 'an award'}</>,
    milestone: <>Your post <b>{n.post_title}</b> hit {n.meta} upvotes</>,
  }[n.type])
  return (
    <>
      <h1 className="page-title">Notifications</h1>
      {rows.length === 0 ? <Empty title="All quiet">Replies, follows, awards and upvote milestones land here.</Empty> : (
        <div className="list">
          {rows.map((n) => (
            <Link key={n.id} className={'list-item notif' + (n.read ? '' : ' unread')}
              to={n.type === 'follow' ? `/u/${n.actor_username}` : `/post/${n.post_id}${n.comment_id ? '#comments' : ''}`}>
              {n.actor_username ? <Avatar url={n.actor_avatar} name={n.actor_username} size={36} /> : <span className="notif-icon"><Icon name="trend" /></span>}
              <p>{n.actor_username && <b>{n.actor_username} </b>}{text(n)}</p>
              <small>{ago(n.created_at)}</small>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------- boards ---------- */
export function BoardsPage() {
  const [boards, setBoards] = useState(null)
  useTitle('Boards')
  useEffect(() => { api.fetchBoards().then(({ data }) => setBoards(data || [])) }, [])
  if (!boards) return <Spinner />
  return (
    <>
      <h1 className="page-title">Boards</h1>
      <p className="muted lead">Live chat rooms by topic. Messages appear as they are sent.</p>
      <div className="list">
        {boards.map((b) => (
          <Link key={b.slug} className="list-item board" to={`/boards/${b.slug}`}>
            <span className="notif-icon"><Icon name="chat" /></span>
            <p><b>{b.name}</b><br /><span className="muted">{b.description}</span></p>
          </Link>
        ))}
      </div>
    </>
  )
}

export function BoardPage() {
  const { slug } = useParams()
  const { uid, need, toast, profile, lists } = useApp()
  const [board, setBoard] = useState(null)
  const [msgs, setMsgs] = useState(null)
  const [text, setText] = useState('')
  const end = useRef(null)
  useTitle(board?.name)

  useEffect(() => {
    setMsgs(null)
    api.fetchBoards().then(({ data }) => setBoard((data || []).find((b) => b.slug === slug) || false))
    api.fetchBoardMessages(slug).then(({ data }) => setMsgs((data || []).reverse()))
    const ch = supabase.channel('board-' + slug)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_messages', filter: `board=eq.${slug}` },
        async (payload) => {
          const { data } = await api.fetchBoardMessage(payload.new.id)
          if (data) setMsgs((m) => (m && !m.some((x) => x.id === data.id) ? [...m, data] : m))
        })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_messages' },
        (payload) => setMsgs((m) => m && m.filter((x) => x.id !== payload.old.id)))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [slug])

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])

  const send = (e) => {
    e.preventDefault()
    need(async () => {
      const body = text.trim()
      if (!body) return
      setText('')
      const { error } = await api.sendBoardMessage(slug, body)
      if (error) { setText(body); toast('Message did not send. Try again.') }
    })
  }
  const del = async (id) => {
    const { error } = await api.deleteBoardMessage(id)
    if (error) toast('Could not delete.'); else setMsgs((m) => m.filter((x) => x.id !== id))
  }

  if (board === false) return <Empty title="No such board"><Link to="/boards">See all boards</Link></Empty>
  return (
    <div className="chat">
      <div className="chat-head"><Link to="/boards" className="link">Boards</Link><h1>{board?.name || ' '}</h1></div>
      <div className="chat-log">
        {!msgs ? <Spinner /> : msgs.length === 0 ? <Empty title="No messages yet">Say hello.</Empty> :
          msgs.filter((m) => !lists.blocked.has(m.author_id)).map((m) => (
            <div key={m.id} className={'msg rise' + (m.author_id === uid ? ' mine' : '')}>
              <Avatar url={m.avatar_url} name={m.username} size={30} />
              <div>
                <div className="comment-meta"><UserLink username={m.username} pro={m.is_pro} /><time>{ago(m.created_at)}</time>
                  {(m.author_id === uid || profile?.is_admin) && <button className="mini text" onClick={() => del(m.id)}>Delete</button>}
                </div>
                <p>{m.body}</p>
              </div>
            </div>
          ))}
        <div ref={end} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <input id="chat-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Message this board" aria-label="Message this board" autoComplete="off" />
        <button className="btn small" aria-label="Send"><Icon name="send" /></button>
      </form>
    </div>
  )
}

/* ---------- moderation ---------- */
export function AdminPage() {
  const { profile, toast } = useApp()
  const [rows, setRows] = useState(null)
  const [uname, setUname] = useState('')
  useTitle('Moderation')
  const load = useCallback(() => api.fetchReports().then(({ data }) => setRows(data || [])), [])
  useEffect(() => { if (profile?.is_admin) load() }, [profile, load])

  if (!profile?.is_admin) return <Empty title="Admins only">Your account does not have moderator access.</Empty>
  const act = async (fn, msg) => { const { error } = await fn(); if (error) toast(error.message); else { toast(msg); load() } }
  const openRows = (rows || []).filter((r) => r.status === 'open')

  return (
    <>
      <h1 className="page-title">Moderation</h1>
      <form className="card form row" onSubmit={(e) => { e.preventDefault(); act(() => api.modSetPro(uname.trim(), true), `${uname} is now Pro`) }}>
        <label htmlFor="ad-pro">Give a user the Pro badge<input id="ad-pro" value={uname} onChange={(e) => setUname(e.target.value)} placeholder="username" required /></label>
        <button className="btn small">Make Pro</button>
        <button type="button" className="btn small outline" onClick={() => uname.trim() && act(() => api.modSetPro(uname.trim(), false), `Pro removed from ${uname}`)}>Remove Pro</button>
      </form>
      <h2 className="sub">{openRows.length} open {openRows.length === 1 ? 'report' : 'reports'}</h2>
      {!rows ? <Spinner /> : openRows.length === 0 ? <Empty title="Nothing to review" /> : (
        <div className="list">
          {openRows.map((r) => (
            <div key={r.id} className="list-item report">
              <p>
                <b>{r.reason}</b><br />
                <span className="muted">by {r.reporter} · {ago(r.created_at)}</span><br />
                {r.post_id ? <Link to={`/post/${r.post_id}`}>Post: {r.post_title}</Link> : <Link to={`/post/${r.comment_post_id}#comments`}>Comment: {r.comment_body || 'image'}</Link>}
              </p>
              <div className="report-actions">
                {r.post_id && !r.post_removed && <button className="btn small" onClick={() => act(async () => { const a = await api.modRemovePost(r.post_id, true); return a.error ? a : api.resolveReport(r.id) }, 'Post removed')}>Remove post</button>}
                {r.comment_id && <button className="btn small" onClick={() => act(() => api.modDeleteComment(r.comment_id), 'Comment deleted')}>Delete comment</button>}
                <button className="btn small outline" onClick={() => act(() => api.resolveReport(r.id), 'Report dismissed')}>Dismiss</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export function NotFound() {
  const nav = useNavigate()
  return <Empty title="Page not found">That link goes nowhere. <button className="link" onClick={() => nav('/')}>Back to Hot</button></Empty>
}
