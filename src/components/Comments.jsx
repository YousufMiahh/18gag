import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/ctx'
import * as api from '../lib/api'
import { Avatar, Empty, Icon, Spinner, UserLink, ago, fmt } from './ui'

function CommentForm({ postId, parentId, onDone, autoFocus }) {
  const { uid, need, toast, profile } = useApp()
  const [body, setBody] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const submit = (e) => {
    e.preventDefault()
    need(async () => {
      if (!body.trim() && !file) return
      setBusy(true)
      try {
        let media_url = null
        if (file) media_url = await api.uploadMedia(uid, file, file.name.split('.').pop().toLowerCase() || 'jpg')
        const row = await api.addComment({ post_id: postId, parent_id: parentId || null, body: body.trim(), media_url })
        setBody(''); setFile(null); onDone(row)
      } catch (err) {
        toast(err.message || 'Comment did not post. Try again.')
      } finally { setBusy(false) }
    })
  }

  return (
    <form className="cform" onSubmit={submit}>
      {!parentId && <Avatar url={profile?.avatar_url} name={profile?.username || '?'} size={32} />}
      <div className="cform-box">
        <textarea id={`c-${postId}-${parentId || 0}`} rows={parentId ? 2 : 3} maxLength={2000} value={body} autoFocus={autoFocus}
          placeholder={parentId ? 'Write a reply' : 'Add a comment'} aria-label={parentId ? 'Write a reply' : 'Add a comment'}
          onChange={(e) => setBody(e.target.value)} />
        <div className="cform-row">
          <input ref={fileRef} type="file" accept="image/*" hidden
            onChange={(e) => {
              const f = e.target.files[0]
              if (f && f.size > 5 * 1024 * 1024) return toast('Images in comments must be under 5 MB.')
              setFile(f || null)
            }} />
          <button type="button" className="icon-btn ghost" onClick={() => fileRef.current.click()} aria-label="Attach an image">
            <Icon name="image" />
          </button>
          {file && <span className="file-chip">{file.name}<button type="button" onClick={() => setFile(null)} aria-label="Remove image">×</button></span>}
          <span className="spacer" />
          <button className="btn small" disabled={busy || (!body.trim() && !file)}>{busy ? 'Posting…' : parentId ? 'Reply' : 'Comment'}</button>
        </div>
      </div>
    </form>
  )
}

function Comment({ c, kids, depth, postAuthor, onAdd, onDelete }) {
  const { uid, need, toast, open, profile, lists } = useApp()
  const [vote, setVote] = useState(c.myVote || 0)
  const [score, setScore] = useState(c.score)
  const [replying, setReplying] = useState(false)
  const [folded, setFolded] = useState(false)
  if (lists.blocked.has(c.author_id)) return null

  const doVote = (v) => need(async () => {
    const next = vote === v ? 0 : v
    const prev = vote
    setVote(next); setScore((s) => s - prev + next)
    const { error } = await api.voteComment(c.id, uid, next)
    if (error) { setVote(prev); setScore((s) => s - next + prev); toast('Vote did not save. Try again.') }
  })
  const del = async () => {
    const { error } = c.author_id === uid ? await api.deleteComment(c.id) : await api.modDeleteComment(c.id)
    if (error) toast(error.message); else onDelete(c.id)
  }

  return (
    <div className="comment rise" id={`comment-${c.id}`}>
      <button className="fold" onClick={() => setFolded((f) => !f)} aria-label={folded ? 'Expand thread' : 'Collapse thread'}>
        <Avatar url={c.avatar_url} name={c.username} size={depth ? 26 : 32} />
      </button>
      <div className="comment-main">
        <div className="comment-meta">
          <UserLink username={c.username} pro={c.is_pro} />
          {c.author_id === postAuthor && <span className="op">OP</span>}
          <time>{ago(c.created_at)}</time>
        </div>
        {!folded && (
          <>
            {c.body && <p>{c.body}</p>}
            {c.media_url && <img className="comment-img" src={c.media_url} alt="" loading="lazy" />}
            <div className="comment-actions">
              <button className={'mini' + (vote === 1 ? ' up' : '')} onClick={() => doVote(1)} aria-pressed={vote === 1} aria-label="Upvote comment"><Icon name="up" size={15} /></button>
              <span className="mini-score">{fmt(score)}</span>
              <button className={'mini' + (vote === -1 ? ' down' : '')} onClick={() => doVote(-1)} aria-pressed={vote === -1} aria-label="Downvote comment"><Icon name="down" size={15} /></button>
              <button className="mini text" onClick={() => need(() => setReplying((r) => !r))}>Reply</button>
              {c.author_id !== uid && <button className="mini text" onClick={() => need(() => open('report', { comment_id: c.id }))}>Report</button>}
              {(c.author_id === uid || profile?.is_admin) && <button className="mini text" onClick={del}>Delete</button>}
            </div>
            {replying && <CommentForm postId={c.post_id} parentId={c.id} autoFocus onDone={(row) => { setReplying(false); onAdd(row) }} />}
            {kids.length > 0 && <div className="replies">{kids}</div>}
          </>
        )}
        {folded && <button className="mini text" onClick={() => setFolded(false)}>Show thread</button>}
      </div>
    </div>
  )
}

export function Comments({ post }) {
  const { uid, ready } = useApp()
  const [rows, setRows] = useState(null)
  const [sort, setSort] = useState('hot')

  useEffect(() => {
    if (!ready) return
    api.fetchComments(post.id, uid).then(setRows).catch(() => setRows([]))
  }, [post.id, uid, ready])

  const tree = useMemo(() => {
    if (!rows) return []
    const by = {}
    rows.forEach((c) => { (by[c.parent_id || 0] ||= []).push(c) })
    const order = (a, b) => (sort === 'hot' ? b.score - a.score || new Date(a.created_at) - new Date(b.created_at) : new Date(b.created_at) - new Date(a.created_at))
    const build = (parent, depth) =>
      (by[parent] || []).slice().sort(parent === 0 ? order : (a, b) => new Date(a.created_at) - new Date(b.created_at)).map((c) => (
        <Comment key={c.id} c={c} depth={depth} postAuthor={post.author_id} kids={build(c.id, depth + 1)}
          onAdd={(row) => setRows((r) => [...r, { ...row, myVote: 0 }])}
          onDelete={(id) => setRows((r) => {
            const dead = new Set([id])
            let grew = true
            while (grew) { grew = false; r.forEach((x) => { if (dead.has(x.parent_id) && !dead.has(x.id)) { dead.add(x.id); grew = true } }) }
            return r.filter((x) => !dead.has(x.id))
          })} />
      ))
    return build(0, 0)
  }, [rows, sort, post.author_id])

  return (
    <section className="comments" id="comments">
      <div className="comments-head">
        <h2>{rows ? fmt(rows.length) : ''} {rows?.length === 1 ? 'comment' : 'comments'}</h2>
        <div className="seg">
          <button aria-pressed={sort === 'hot'} onClick={() => setSort('hot')}>Hot</button>
          <button aria-pressed={sort === 'fresh'} onClick={() => setSort('fresh')}>Fresh</button>
        </div>
      </div>
      <CommentForm postId={post.id} onDone={(row) => setRows((r) => [...(r || []), { ...row, myVote: 0 }])} />
      {!rows ? <Spinner /> : tree.length ? <div className="thread">{tree}</div> : <Empty title="No comments yet">Be the first to say something.</Empty>}
    </section>
  )
}
