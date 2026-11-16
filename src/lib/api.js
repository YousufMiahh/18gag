import { supabase } from './supabase'

export const PAGE = 10
export const AWARDS = [
  { k: 'gold', label: 'Gold', e: '🏆' },
  { k: 'lol', label: 'Crying laughing', e: '😂' },
  { k: 'brain', label: 'Big brain', e: '🧠' },
  { k: 'heart', label: 'Wholesome', e: '💛' },
  { k: 'fire', label: 'Fire', e: '🔥' },
]

const clean = (s) => s.replace(/[%,(){}*"\\]/g, ' ').trim()
export const likeExact = (s) => s.replace(/[\\%_]/g, '\\$&')

/* ---------- feed ---------- */
async function decorate(posts, uid) {
  if (!uid || !posts.length) return posts
  const ids = posts.map((p) => p.id)
  const [v, s] = await Promise.all([
    supabase.from('post_votes').select('post_id,value').eq('user_id', uid).in('post_id', ids),
    supabase.from('saves').select('post_id').eq('user_id', uid).in('post_id', ids),
  ])
  const votes = Object.fromEntries((v.data || []).map((r) => [r.post_id, r.value]))
  const saved = new Set((s.data || []).map((r) => r.post_id))
  return posts.map((p) => ({ ...p, myVote: votes[p.id] || 0, saved: saved.has(p.id) }))
}

export async function fetchFeed({ sort = 'hot', section, tag, q, author, following, page = 0, uid }) {
  let qy = supabase.from('feed').select('*').eq('removed', false)
  if (section) qy = qy.eq('section', section)
  if (tag) qy = qy.contains('tags', [tag])
  if (author) qy = qy.eq('author_id', author)
  if (q) {
    const s = clean(q)
    if (!s) return []
    const word = s.toLowerCase().split(/\s+/)[0]
    qy = qy.or(`title.ilike.%${s}%,tags.cs.{${word}}`)
  }
  if (following) {
    const parts = []
    if (following.users.length) parts.push(`author_id.in.(${following.users.join(',')})`)
    if (following.sections.length) parts.push(`section.in.(${following.sections.join(',')})`)
    if (!parts.length) return []
    qy = qy.or(parts.join(','))
  }
  if (sort === 'top') qy = qy.gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
  if (sort === 'trending') qy = qy.gt('trending', 0)
  const col = { hot: 'hot', trending: 'trending', fresh: 'created_at', top: 'score' }[sort] || 'hot'
  const { data, error } = await qy
    .order(col, { ascending: false })
    .order('id', { ascending: false })
    .range(page * PAGE, page * PAGE + PAGE - 1)
  if (error) throw error
  return decorate(data, uid)
}

export async function fetchPostsByIds(ids, uid) {
  if (!ids.length) return []
  const { data, error } = await supabase.from('feed').select('*').in('id', ids)
  if (error) throw error
  const by = Object.fromEntries(data.map((p) => [p.id, p]))
  return decorate(ids.map((i) => by[i]).filter(Boolean), uid)
}

export async function fetchPost(id, uid) {
  const { data, error } = await supabase.from('feed').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return (await decorate([data], uid))[0]
}

export async function myPostIds(table, uid, upvotedOnly) {
  let qy = supabase.from(table).select('post_id').eq('user_id', uid)
  if (upvotedOnly) qy = qy.eq('value', 1)
  const { data } = await qy.order('created_at', { ascending: false }).limit(60)
  return (data || []).map((r) => r.post_id)
}

/* ---------- post actions ---------- */
export function votePost(post_id, user_id, value) {
  return value === 0
    ? supabase.from('post_votes').delete().eq('post_id', post_id).eq('user_id', user_id)
    : supabase.from('post_votes').upsert({ post_id, user_id, value }, { onConflict: 'post_id,user_id' })
}
export function setSaved(post_id, user_id, on) {
  return on
    ? supabase.from('saves').upsert({ post_id, user_id }, { onConflict: 'post_id,user_id' })
    : supabase.from('saves').delete().eq('post_id', post_id).eq('user_id', user_id)
}
export const hidePost = (post_id, user_id) =>
  supabase.from('hidden_posts').upsert({ post_id, user_id }, { onConflict: 'post_id,user_id' })
export const deletePost = (id) => supabase.from('posts').delete().eq('id', id)
export const report = (row) => supabase.from('reports').insert(row)

export async function uploadMedia(uid, blob, ext, folder) {
  const path = `${folder || uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const { error } = await supabase.storage
    .from('media')
    .upload(path, blob, { contentType: blob.type || undefined, cacheControl: '31536000' })
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

export async function createPost(post, pollOptions) {
  const { data, error } = await supabase.from('posts').insert(post).select('id').single()
  if (error) throw error
  if (pollOptions?.length) {
    const { error: e2 } = await supabase
      .from('poll_options')
      .insert(pollOptions.map((label) => ({ post_id: data.id, label })))
    if (e2) throw e2
  }
  return data.id
}

/* ---------- polls ---------- */
export async function fetchPoll(post_id, uid) {
  const [o, v] = await Promise.all([
    supabase.from('poll_options').select('*').eq('post_id', post_id).order('id'),
    uid
      ? supabase.from('poll_votes').select('option_id').eq('post_id', post_id).eq('user_id', uid).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  return { options: o.data || [], mine: v.data?.option_id || null }
}
export const votePoll = (post_id, user_id, option_id) =>
  supabase.from('poll_votes').upsert({ post_id, user_id, option_id }, { onConflict: 'post_id,user_id' })

/* ---------- awards ---------- */
export const fetchAwards = (post_id) => supabase.from('awards').select('kind,giver_id').eq('post_id', post_id)
export const giveAward = (post_id, kind) => supabase.from('awards').insert({ post_id, kind })

/* ---------- comments ---------- */
export async function fetchComments(post_id, uid) {
  const { data, error } = await supabase
    .from('comments_view')
    .select('*')
    .eq('post_id', post_id)
    .order('created_at')
    .limit(1000)
  if (error) throw error
  if (!uid || !data.length) return data
  const { data: v } = await supabase
    .from('comment_votes')
    .select('comment_id,value')
    .eq('user_id', uid)
    .in('comment_id', data.map((c) => c.id))
  const votes = Object.fromEntries((v || []).map((r) => [r.comment_id, r.value]))
  return data.map((c) => ({ ...c, myVote: votes[c.id] || 0 }))
}
export async function addComment(row) {
  const { data, error } = await supabase.from('comments').insert(row).select('id').single()
  if (error) throw error
  const { data: full } = await supabase.from('comments_view').select('*').eq('id', data.id).single()
  return full
}
export function voteComment(comment_id, user_id, value) {
  return value === 0
    ? supabase.from('comment_votes').delete().eq('comment_id', comment_id).eq('user_id', user_id)
    : supabase.from('comment_votes').upsert({ comment_id, user_id, value }, { onConflict: 'comment_id,user_id' })
}
export const deleteComment = (id) => supabase.from('comments').delete().eq('id', id)

/* ---------- profiles and social ---------- */
export async function fetchProfile(username) {
  const { data } = await supabase.from('profiles').select('*').ilike('username', likeExact(username)).maybeSingle()
  if (!data) return null
  const count = (qy) => qy.then((r) => r.count || 0)
  const [followers, following, posts] = await Promise.all([
    count(supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', data.id)),
    count(supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', data.id)),
    count(supabase.from('feed').select('id', { count: 'exact', head: true }).eq('author_id', data.id).eq('removed', false)),
  ])
  return { ...data, followers, following, posts }
}
export const userComments = (author_id) =>
  supabase.from('comments_view').select('*').eq('author_id', author_id).order('created_at', { ascending: false }).limit(40)

export function setFollow(follower_id, following_id, on) {
  return on
    ? supabase.from('follows').upsert({ follower_id, following_id }, { onConflict: 'follower_id,following_id' })
    : supabase.from('follows').delete().eq('follower_id', follower_id).eq('following_id', following_id)
}
export function setSectionFollow(user_id, section, on) {
  return on
    ? supabase.from('section_follows').upsert({ user_id, section }, { onConflict: 'user_id,section' })
    : supabase.from('section_follows').delete().eq('user_id', user_id).eq('section', section)
}
export function setBlock(user_id, blocked_id, on) {
  return on
    ? supabase.from('blocks').upsert({ user_id, blocked_id }, { onConflict: 'user_id,blocked_id' })
    : supabase.from('blocks').delete().eq('user_id', user_id).eq('blocked_id', blocked_id)
}
export const updateProfile = (id, patch) => supabase.from('profiles').update(patch).eq('id', id)

/* ---------- notifications ---------- */
export const fetchNotifications = (uid) =>
  supabase.from('notifications_view').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(60)
export const markAllRead = (uid) =>
  supabase.from('notifications').update({ read: true }).eq('user_id', uid).eq('read', false)

/* ---------- boards ---------- */
export const fetchBoards = () => supabase.from('boards').select('*').order('sort')
export const fetchBoardMessages = (board) =>
  supabase.from('board_messages_view').select('*').eq('board', board).order('created_at', { ascending: false }).limit(100)
export const fetchBoardMessage = (id) => supabase.from('board_messages_view').select('*').eq('id', id).single()
export const sendBoardMessage = (board, body) => supabase.from('board_messages').insert({ board, body })
export const deleteBoardMessage = (id) => supabase.from('board_messages').delete().eq('id', id)

/* ---------- admin ---------- */
export const fetchReports = () =>
  supabase.from('reports_view').select('*').order('created_at', { ascending: false }).limit(100)
export const resolveReport = (id) => supabase.from('reports').update({ status: 'resolved' }).eq('id', id)
export const modRemovePost = (pid, flag) => supabase.rpc('mod_set_post_removed', { pid, flag })
export const modDeleteComment = (cid) => supabase.rpc('mod_delete_comment', { cid })
export const modSetPro = (uname, flag) => supabase.rpc('mod_set_pro', { uname, flag })

/* ---------- image shrinking before upload ---------- */
export async function shrinkImage(file, maxW = 1400) {
  const ext = (file.name || '').split('.').pop().toLowerCase() || 'jpg'
  const keep = { blob: file, ext }
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.type === 'image/svg+xml') return keep
  try {
    const url = URL.createObjectURL(file)
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
    const scale = Math.min(1, maxW / img.naturalWidth)
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
    keep.w = img.naturalWidth; keep.h = img.naturalHeight
    if ((scale === 1 && file.size < 500 * 1024) || h > 10000) { URL.revokeObjectURL(url); return keep }
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h)
    URL.revokeObjectURL(url)
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86))
    if (!blob || blob.size >= file.size) return keep
    return { blob, ext: 'jpg', w, h }
  } catch { return keep }
}

/* ---------- editing ---------- */
export const updatePost = (id, patch) => supabase.from('posts').update(patch).eq('id', id)
export const updateComment = (id, body) => supabase.from('comments').update({ body }).eq('id', id)

/* ---------- mutes ---------- */
export function setMutedTag(user_id, tag, on) {
  return on
    ? supabase.from('muted_tags').upsert({ user_id, tag }, { onConflict: 'user_id,tag' })
    : supabase.from('muted_tags').delete().eq('user_id', user_id).eq('tag', tag)
}
export function setMutedSection(user_id, section, on) {
  return on
    ? supabase.from('muted_sections').upsert({ user_id, section }, { onConflict: 'user_id,section' })
    : supabase.from('muted_sections').delete().eq('user_id', user_id).eq('section', section)
}

/* ---------- account ---------- */
export const deleteAccount = () => supabase.rpc('delete_account')
export const modSetUser = (uname, field, flag) => supabase.rpc('mod_set_user', { uname, field, flag })
