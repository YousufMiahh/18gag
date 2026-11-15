import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../lib/ctx'
import * as api from '../lib/api'
import { Avatar, Empty, Icon, UserLink, ago, fmt } from './ui'

function Media({ post, full }) {
  const { profile } = useApp()
  const [revealed, setRevealed] = useState(false)
  const [tall, setTall] = useState(false)
  const vid = useRef(null)
  const blur = post.nsfw && !profile?.show_nsfw && !revealed
  const ratio = post.media_w && post.media_h ? `${post.media_w} / ${post.media_h}` : undefined

  // play videos only while they are on screen
  useEffect(() => {
    const el = vid.current
    if (!el || blur) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) el.play().catch(() => {})
      else el.pause()
    }, { threshold: 0.6 })
    io.observe(el)
    return () => io.disconnect()
  }, [blur])

  if (post.kind === 'text' || post.kind === 'poll') {
    return (
      <div className="post-text">
        {post.body && <p className={full ? '' : 'clamp'}>{post.body}</p>}
        {post.kind === 'poll' && <Poll post={post} />}
      </div>
    )
  }
  return (
    <div className={'media' + (blur ? ' is-blur' : '') + (!full && tall ? ' is-tall' : '')}>
      {post.kind === 'video' ? (
        <video ref={vid} src={post.media_url} controls loop muted playsInline preload="metadata" style={{ aspectRatio: ratio }} />
      ) : (
        <img src={post.media_url} alt={post.title} loading="lazy" style={{ aspectRatio: ratio }}
          onLoad={(e) => setTall(e.target.naturalHeight / e.target.naturalWidth > 2.2)} />
      )}
      {blur && (
        <button className="blur-cover" onClick={() => setRevealed(true)}>
          <strong>Sensitive content</strong>
          <span>Tap to view</span>
        </button>
      )}
      {!full && tall && !blur && <Link className="tall-more" to={`/post/${post.id}`}>View full post</Link>}
    </div>
  )
}

function Poll({ post }) {
  const { uid, need, toast } = useApp()
  const [poll, setPoll] = useState(null)
  const load = useCallback(() => api.fetchPoll(post.id, uid).then(setPoll), [post.id, uid])
  useEffect(() => { load() }, [load])
  if (!poll) return <div className="skeleton" style={{ height: 96 }} />
  const total = poll.options.reduce((a, o) => a + o.vote_count, 0)
  const pick = (id) => need(async () => {
    const { error } = await api.votePoll(post.id, uid, id)
    if (error) toast('Could not save your vote. Try again.')
    else load()
  })
  return (
    <div className="poll">
      {poll.options.map((o) => {
        const pct = total ? Math.round((o.vote_count / total) * 100) : 0
        return (
          <button key={o.id} className={'poll-opt' + (poll.mine === o.id ? ' mine' : '')} onClick={() => pick(o.id)}>
            <span className="poll-fill" style={{ width: (poll.mine ? pct : 0) + '%' }} />
            <span className="poll-label">{o.label}</span>
            {poll.mine && <span className="poll-pct">{pct}%</span>}
          </button>
        )
      })}
      <small>{fmt(total)} {total === 1 ? 'vote' : 'votes'}</small>
    </div>
  )
}

export function PostCard({ post, full, onGone }) {
  const { uid, profile, need, toast, open, lists, reloadLists, sections } = useApp()
  const nav = useNavigate()
  const [vote, setVote] = useState(post.myVote || 0)
  const [score, setScore] = useState(post.score)
  const [saved, setSaved] = useState(!!post.saved)
  const [menu, setMenu] = useState(false)
  const [bump, setBump] = useState(0)
  const menuRef = useRef(null)
  const mine = uid === post.author_id
  const sectionName = sections.find((s) => s.slug === post.section)?.name || post.section

  useEffect(() => {
    if (!menu) return
    const off = (e) => !menuRef.current?.contains(e.target) && setMenu(false)
    document.addEventListener('pointerdown', off)
    return () => document.removeEventListener('pointerdown', off)
  }, [menu])

  const doVote = (v) => need(async () => {
    const next = vote === v ? 0 : v
    const prev = vote
    setVote(next); setScore((s) => s - prev + next); setBump((b) => b + 1)
    const { error } = await api.votePost(post.id, uid, next)
    if (error) { setVote(prev); setScore((s) => s - next + prev); toast('Vote did not save. Try again.') }
  })
  const doSave = () => need(async () => {
    const next = !saved
    setSaved(next)
    const { error } = await api.setSaved(post.id, uid, next)
    if (error) { setSaved(!next); toast('Could not save. Try again.') } else toast(next ? 'Saved' : 'Removed from saved')
  })
  const doShare = async () => {
    const url = `${location.origin}/post/${post.id}`
    try {
      if (navigator.share) await navigator.share({ title: post.title, url })
      else { await navigator.clipboard.writeText(url); toast('Link copied') }
    } catch { /* cancelled */ }
  }
  const doHide = () => need(async () => {
    await api.hidePost(post.id, uid); await reloadLists(); toast('Post hidden'); onGone?.(post.id)
  })
  const doBlock = () => need(async () => {
    await api.setBlock(uid, post.author_id, true); await reloadLists(); toast(`Blocked ${post.username}`); onGone?.(post.id)
  })
  const doDelete = async () => {
    const { error } = await api.deletePost(post.id)
    if (error) return toast('Could not delete. Try again.')
    toast('Post deleted'); onGone?.(post.id); if (full) nav('/')
  }
  const doModRemove = async () => {
    const { error } = await api.modRemovePost(post.id, true)
    if (error) return toast(error.message)
    toast('Post removed'); onGone?.(post.id)
  }

  return (
    <article className="post" data-post>
      <header className="post-head">
        <div className="post-meta">
          <Link to={`/u/${post.username}`}><Avatar url={post.avatar_url} name={post.username} size={28} /></Link>
          <UserLink username={post.username} pro={post.is_pro} />
          <span className="dot">·</span>
          <Link className="tag" to={`/s/${post.section}`}>{sectionName}</Link>
          <span className="dot">·</span>
          <time title={new Date(post.created_at).toLocaleString()}>{ago(post.created_at)}</time>
          {post.nsfw && <span className="nsfw">NSFW</span>}
          <div className="menu-wrap" ref={menuRef}>
            <button className="icon-btn ghost" onClick={() => setMenu((m) => !m)} aria-label="More actions" aria-expanded={menu}>
              <Icon name="more" size={20} />
            </button>
            {menu && (
              <div className="menu" onClick={() => setMenu(false)}>
                {!mine && <button onClick={doHide}>Hide this post</button>}
                {!mine && <button onClick={() => need(() => open('report', { post_id: post.id }))}>Report</button>}
                {!mine && !lists.blocked.has(post.author_id) && <button onClick={doBlock}>Block {post.username}</button>}
                {mine && <button className="danger" onClick={doDelete}>Delete post</button>}
                {profile?.is_admin && !mine && <button className="danger" onClick={doModRemove}>Remove (admin)</button>}
              </div>
            )}
          </div>
        </div>
        <h3>{full ? post.title : <Link to={`/post/${post.id}`}>{post.title}</Link>}</h3>
        {post.tags.length > 0 && (
          <div className="tags">{post.tags.map((t) => <Link key={t} to={`/tag/${encodeURIComponent(t)}`}>#{t}</Link>)}</div>
        )}
      </header>

      <Media post={post} full={full} />

      <footer className="actions">
        <div className={'votes' + (vote === 1 ? ' is-up' : vote === -1 ? ' is-down' : '')}>
          <button className="act up" onClick={() => doVote(1)} aria-pressed={vote === 1} aria-label="Upvote">
            <Icon name="up" />
          </button>
          <span key={bump} className="score">{fmt(score)}</span>
          <button className="act down" onClick={() => doVote(-1)} aria-pressed={vote === -1} aria-label="Downvote">
            <Icon name="down" />
          </button>
        </div>
        <Link className="act" to={`/post/${post.id}#comments`} aria-label="Comments">
          <Icon name="comment" /><span>{fmt(post.comment_count)}</span>
        </Link>
        <button className="act" onClick={() => need(() => open('award', { post }))} aria-label="Give an award">
          <Icon name="star" />{post.award_count > 0 && <span>{fmt(post.award_count)}</span>}
        </button>
        <span className="spacer" />
        <button className={'act save' + (saved ? ' on' : '')} onClick={doSave} aria-pressed={saved} aria-label="Save">
          <Icon name="save" fill={saved} />
        </button>
        <button className="act" onClick={doShare} aria-label="Share"><Icon name="share" /></button>
      </footer>
    </article>
  )
}

export function PostSkeleton() {
  return (
    <div className="post">
      <div className="post-head"><div className="skeleton" style={{ height: 14, width: '40%' }} /><div className="skeleton" style={{ height: 22, width: '80%', marginTop: 10 }} /></div>
      <div className="skeleton" style={{ height: 300, borderRadius: 0 }} />
      <div className="actions"><div className="skeleton" style={{ height: 34, width: 180 }} /></div>
    </div>
  )
}

export function Feed({ params, emptyTitle = 'Nothing here yet', emptyText }) {
  const { uid, lists, ready } = useApp()
  const [posts, setPosts] = useState([])
  const [page, setPage] = useState(0)
  const [state, setState] = useState('loading') // loading | idle | done | error
  const sentinel = useRef(null)
  const key = JSON.stringify(params)
  const busy = useRef(false)

  const req = useRef(0)

  const load = useCallback(async (p, replace) => {
    if (busy.current && !replace) return
    const mine = ++req.current
    busy.current = true
    setState('loading')
    try {
      const rows = await api.fetchFeed({ ...params, page: p, uid })
      if (mine !== req.current) return
      setPosts((cur) => {
        const seen = new Set(replace ? [] : cur.map((x) => x.id))
        return [...(replace ? [] : cur), ...rows.filter((r) => !seen.has(r.id))]
      })
      setPage(p)
      setState(rows.length < api.PAGE ? 'done' : 'idle')
    } catch (e) {
      if (mine !== req.current) return
      console.error(e); setState('error')
    } finally { if (mine === req.current) busy.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid])

  useEffect(() => { if (ready) { setPosts([]); load(0, true) } }, [load, ready])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && state === 'idle') load(page + 1)
    }, { rootMargin: '800px' })
    io.observe(el)
    return () => io.disconnect()
  }, [state, page, load])

  const gone = (id) => setPosts((cur) => cur.filter((p) => p.id !== id))
  const shown = posts.filter((p) => !lists.hidden.has(p.id) && !lists.blocked.has(p.author_id))

  return (
    <div className="feed">
      {shown.map((p, i) => (
        <div key={p.id} className="rise" style={{ animationDelay: Math.min(i % api.PAGE, 5) * 40 + 'ms' }}>
          <PostCard post={p} onGone={gone} />
        </div>
      ))}
      {state === 'loading' && <><PostSkeleton /><PostSkeleton /></>}
      {state === 'error' && (
        <Empty title="Could not load posts">Check your connection, then <button className="link" onClick={() => load(page, page === 0)}>try again</button>.</Empty>
      )}
      {state === 'done' && shown.length === 0 && <Empty title={emptyTitle}>{emptyText}</Empty>}
      {state === 'done' && shown.length > 0 && <p className="end">You reached the end. Go outside, or post something.</p>}
      <div ref={sentinel} />
    </div>
  )
}
