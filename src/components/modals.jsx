import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../lib/ctx'
import * as api from '../lib/api'
import { Modal } from './ui'

/* ---------- sign in / sign up ---------- */
function AuthModal() {
  const { close, toast } = useApp()
  const [mode, setMode] = useState('login') // login | signup | reset
  const [f, setF] = useState({ email: '', password: '', username: '' })
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setErr(''); setNote(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email, password: f.password })
        if (error) throw error
        toast('Welcome back'); close()
      } else if (mode === 'signup') {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(f.username)) throw new Error('Usernames are 3 to 20 letters, numbers or underscores.')
        const { data: taken } = await supabase.from('profiles').select('id').ilike('username', f.username).maybeSingle()
        if (taken) throw new Error('That username is taken. Try another.')
        const { data, error } = await supabase.auth.signUp({
          email: f.email, password: f.password,
          options: { data: { username: f.username }, emailRedirectTo: location.origin },
        })
        if (error) throw error
        if (data.session) { toast('Account created'); close() }
        else setNote('Check your email and tap the confirmation link, then log in.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(f.email, { redirectTo: location.origin })
        if (error) throw error
        setNote('If that email has an account, a reset link is on its way.')
      }
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  const title = { login: 'Log in', signup: 'Create your account', reset: 'Reset password' }[mode]
  return (
    <Modal title={title} onClose={close}>
      <form className="form" onSubmit={submit}>
        {mode === 'signup' && (
          <label htmlFor="au-user">Username
            <input id="au-user" value={f.username} onChange={set('username')} autoComplete="username" required maxLength={20} />
          </label>
        )}
        <label htmlFor="au-email">Email
          <input id="au-email" type="email" value={f.email} onChange={set('email')} autoComplete="email" required />
        </label>
        {mode !== 'reset' && (
          <label htmlFor="au-pass">Password
            <input id="au-pass" type="password" value={f.password} onChange={set('password')} required minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </label>
        )}
        {err && <p className="form-err" role="alert">{err}</p>}
        {note && <p className="form-note" role="status">{note}</p>}
        <button className="btn" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Log in' : mode === 'signup' ? 'Sign up' : 'Send reset link'}</button>
        <div className="form-links">
          {mode !== 'login' && <button type="button" className="link" onClick={() => setMode('login')}>I have an account</button>}
          {mode !== 'signup' && <button type="button" className="link" onClick={() => setMode('signup')}>Create an account</button>}
          {mode === 'login' && <button type="button" className="link" onClick={() => setMode('reset')}>Forgot password?</button>}
        </div>
      </form>
    </Modal>
  )
}

function NewPassModal() {
  const { close, toast } = useApp()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setErr(error.message)
    toast('Password updated'); close()
  }
  return (
    <Modal title="Choose a new password" onClose={close}>
      <form className="form" onSubmit={submit}>
        <label htmlFor="np-pass">New password
          <input id="np-pass" type="password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={6} required autoComplete="new-password" />
        </label>
        {err && <p className="form-err" role="alert">{err}</p>}
        <button className="btn">Save password</button>
      </form>
    </Modal>
  )
}

/* ---------- meme maker ---------- */
function drawMeme(canvas, img, top, bottom, size) {
  const w = Math.min(img.naturalWidth, 1080)
  const h = Math.round((img.naturalHeight * w) / img.naturalWidth)
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  const px = Math.round((w * size) / 100)
  ctx.font = `900 ${px}px Impact, "Arial Black", sans-serif`
  ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'
  ctx.lineWidth = Math.max(2, px / 8); ctx.lineJoin = 'round'
  const wrap = (text) => {
    const words = text.toUpperCase().split(/\s+/).filter(Boolean)
    const lines = []; let line = ''
    for (const word of words) {
      const test = line ? line + ' ' + word : word
      if (ctx.measureText(test).width > w * 0.92 && line) { lines.push(line); line = word } else line = test
    }
    if (line) lines.push(line)
    return lines
  }
  const put = (lines, y0) => lines.forEach((l, i) => {
    const y = y0 + i * px * 1.1
    ctx.strokeText(l, w / 2, y); ctx.fillText(l, w / 2, y)
  })
  ctx.textBaseline = 'top'
  put(wrap(top), px * 0.3)
  const bl = wrap(bottom)
  put(bl, h - px * 0.3 - bl.length * px * 1.1)
}

const dims = (file) => new Promise((res) => {
  const url = URL.createObjectURL(file)
  if (file.type.startsWith('video/')) {
    const v = document.createElement('video')
    v.onloadedmetadata = () => { res({ w: v.videoWidth, h: v.videoHeight }); URL.revokeObjectURL(url) }
    v.onerror = () => res({})
    v.src = url
  } else {
    const i = new Image()
    i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(url) }
    i.onerror = () => res({})
    i.src = url
  }
})

/* ---------- new post ---------- */
function UploadModal() {
  const { close, toast, uid, sections } = useApp()
  const nav = useNavigate()
  const [kind, setKind] = useState('media') // media | meme | text | poll
  const [title, setTitle] = useState('')
  const [section, setSection] = useState('funny')
  const [tags, setTags] = useState('')
  const [nsfw, setNsfw] = useState(false)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [body, setBody] = useState('')
  const [opts, setOpts] = useState(['', ''])
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [size, setSize] = useState(9)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef(null)
  const memeImg = useRef(null)

  const pick = (e) => {
    const f = e.target.files[0]
    setErr('')
    if (!f) return
    const video = f.type.startsWith('video/')
    if (!video && !f.type.startsWith('image/')) return setErr('Pick an image, GIF or video file.')
    if (kind === 'meme' && video) return setErr('The meme maker needs an image, not a video.')
    if (f.size > (video ? 50 : 10) * 1024 * 1024) return setErr(video ? 'Videos must be under 50 MB.' : 'Images must be under 10 MB.')
    setFile(f); setPreview(URL.createObjectURL(f))
  }

  const redraw = useCallback(() => {
    if (kind === 'meme' && memeImg.current && canvas.current) drawMeme(canvas.current, memeImg.current, top, bottom, size)
  }, [kind, top, bottom, size])
  useEffect(() => {
    if (kind !== 'meme' || !preview) return
    const img = new Image()
    img.onload = () => { memeImg.current = img; redraw() }
    img.src = preview
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, kind])
  useEffect(redraw, [redraw])

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!title.trim()) return setErr('Add a title.')
    const tagList = [...new Set(tags.toLowerCase().split(/[,\s#]+/).map((t) => t.replace(/[^a-z0-9_-]/g, '')).filter(Boolean))].slice(0, 5)
    const post = { title: title.trim(), section, tags: tagList, nsfw }
    let pollOptions
    setBusy(true)
    try {
      if (kind === 'media') {
        if (!file) throw new Error('Choose an image, GIF or video.')
        const d = await dims(file)
        post.kind = file.type.startsWith('video/') ? 'video' : 'image'
        post.media_url = await api.uploadMedia(uid, file, file.name.split('.').pop().toLowerCase())
        post.media_w = d.w || null; post.media_h = d.h || null
      } else if (kind === 'meme') {
        if (!file || !canvas.current) throw new Error('Choose an image for your meme.')
        const blob = await new Promise((r) => canvas.current.toBlob(r, 'image/jpeg', 0.9))
        post.kind = 'image'
        post.media_url = await api.uploadMedia(uid, blob, 'jpg')
        post.media_w = canvas.current.width; post.media_h = canvas.current.height
      } else if (kind === 'text') {
        if (!body.trim()) throw new Error('Write something first.')
        post.kind = 'text'; post.body = body.trim()
      } else {
        pollOptions = opts.map((o) => o.trim()).filter(Boolean)
        if (pollOptions.length < 2) throw new Error('A poll needs at least two options.')
        post.kind = 'poll'; post.body = body.trim() || null
      }
      const id = await api.createPost(post, pollOptions)
      toast('Posted'); close(); nav(`/post/${id}`)
    } catch (e2) { setErr(e2.message || 'Upload failed. Try again.') } finally { setBusy(false) }
  }

  const tabs = [['media', 'Image / video'], ['meme', 'Meme maker'], ['text', 'Text'], ['poll', 'Poll']]
  return (
    <Modal title="New post" onClose={close} wide>
      <form className="form" onSubmit={submit}>
        <div className="seg wide" role="group" aria-label="Post type">
          {tabs.map(([k, label]) => (
            <button type="button" key={k} aria-pressed={kind === k} onClick={() => { setKind(k); setErr('') }}>{label}</button>
          ))}
        </div>
        <label htmlFor="up-title">Title
          <input id="up-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Make it a good one" />
        </label>

        {(kind === 'media' || kind === 'meme') && (
          <>
            <label htmlFor="up-file" className="drop">
              <input id="up-file" type="file" accept={kind === 'meme' ? 'image/*' : 'image/*,video/*'} onChange={pick} />
              <span>{file ? file.name : kind === 'meme' ? 'Choose a picture to caption' : 'Choose an image, GIF or video'}</span>
            </label>
            {preview && kind === 'media' && (file.type.startsWith('video/')
              ? <video className="up-preview" src={preview} controls muted />
              : <img className="up-preview" src={preview} alt="Preview" />)}
            {preview && kind === 'meme' && (
              <>
                <canvas className="up-preview" ref={canvas} />
                <div className="grid2">
                  <label htmlFor="up-top">Top text<input id="up-top" value={top} onChange={(e) => setTop(e.target.value)} maxLength={120} /></label>
                  <label htmlFor="up-bottom">Bottom text<input id="up-bottom" value={bottom} onChange={(e) => setBottom(e.target.value)} maxLength={120} /></label>
                </div>
                <label htmlFor="up-size">Text size
                  <input id="up-size" type="range" min="4" max="16" value={size} onChange={(e) => setSize(+e.target.value)} />
                </label>
              </>
            )}
          </>
        )}

        {(kind === 'text' || kind === 'poll') && (
          <label htmlFor="up-body">{kind === 'poll' ? 'Details (optional)' : 'Text'}
            <textarea id="up-body" rows={kind === 'poll' ? 2 : 6} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
          </label>
        )}
        {kind === 'poll' && (
          <div className="poll-edit">
            {opts.map((o, i) => (
              <input key={i} id={`up-opt-${i}`} aria-label={`Option ${i + 1}`} placeholder={`Option ${i + 1}`} value={o} maxLength={80}
                onChange={(e) => setOpts(opts.map((x, j) => (j === i ? e.target.value : x)))} />
            ))}
            {opts.length < 6 && <button type="button" className="link" onClick={() => setOpts([...opts, ''])}>Add another option</button>}
          </div>
        )}

        <div className="grid2">
          <label htmlFor="up-section">Section
            <select id="up-section" value={section} onChange={(e) => setSection(e.target.value)}>
              {sections.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </select>
          </label>
          <label htmlFor="up-tags">Tags (up to 5)
            <input id="up-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="cats, monday" />
          </label>
        </div>
        <label htmlFor="up-nsfw" className="check">
          <input id="up-nsfw" type="checkbox" checked={nsfw} onChange={(e) => setNsfw(e.target.checked)} />
          Sensitive content (blurred until tapped)
        </label>
        {err && <p className="form-err" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Post'}</button>
      </form>
    </Modal>
  )
}

/* ---------- awards ---------- */
function AwardModal({ post }) {
  const { close, toast, uid } = useApp()
  const [given, setGiven] = useState(null)
  useEffect(() => { api.fetchAwards(post.id).then(({ data }) => setGiven(data || [])) }, [post.id])
  const give = async (kind) => {
    const { error } = await api.giveAward(post.id, kind)
    if (error) return toast(error.code === '23505' ? 'You already gave that award to this post.' : 'Award did not send. Try again.')
    toast('Award sent'); close()
  }
  return (
    <Modal title="Give an award" onClose={close}>
      <div className="awards">
        {api.AWARDS.map((a) => {
          const n = given?.filter((g) => g.kind === a.k).length || 0
          const mine = given?.some((g) => g.kind === a.k && g.giver_id === uid)
          return (
            <button key={a.k} className="award" disabled={mine || post.author_id === uid} onClick={() => give(a.k)}>
              <span className="award-e">{a.e}</span>
              <strong>{a.label}</strong>
              <small>{mine ? 'Given' : n ? `${n} so far` : 'Be the first'}</small>
            </button>
          )
        })}
      </div>
      {post.author_id === uid && <p className="form-note">You can't award your own post.</p>}
    </Modal>
  )
}

/* ---------- report ---------- */
const REASONS = ['Spam or advertising', 'Hate or harassment', 'Sexual content not marked sensitive', 'Violence or gore', 'Stolen or reposted', 'Something else']
function ReportModal(props) {
  const { close, toast } = useApp()
  const [reason, setReason] = useState(REASONS[0])
  const [more, setMore] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const { error } = await api.report({ ...props, reason: more.trim() ? `${reason}: ${more.trim()}` : reason })
    if (error) return toast('Report did not send. Try again.')
    toast('Reported. Thanks for flagging it.'); close()
  }
  return (
    <Modal title="Report" onClose={close}>
      <form className="form" onSubmit={submit}>
        <div className="radio-list" role="radiogroup" aria-label="Reason">
          {REASONS.map((r, i) => (
            <label key={r} htmlFor={`rp-${i}`} className="check">
              <input id={`rp-${i}`} type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />{r}
            </label>
          ))}
        </div>
        <label htmlFor="rp-more">Anything to add? (optional)
          <textarea id="rp-more" rows={2} value={more} onChange={(e) => setMore(e.target.value)} maxLength={300} />
        </label>
        <button className="btn">Send report</button>
      </form>
    </Modal>
  )
}

export function Modals() {
  const { modal } = useApp()
  if (!modal) return null
  const M = { auth: AuthModal, newpass: NewPassModal, upload: UploadModal, award: AwardModal, report: ReportModal }[modal.type]
  return M ? <M {...modal.props} /> : null
}

export function Toasts() {
  const { toasts } = useApp()
  return <div className="toasts" role="status">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
}
