// Gives post links a proper preview card (title + picture) when shared in WhatsApp, Discord, X and so on.
// Only runs for link-preview bots; real visitors get the normal page untouched.
const BOTS = /bot|crawler|spider|facebookexternalhit|whatsapp|telegram|slack|discord|twitter|linkedin|pinterest|preview|embed/i
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export default async (request, context) => {
  const response = await context.next()
  try {
    if (!BOTS.test(request.headers.get('user-agent') || '')) return response
    const url = new URL(request.url)
    const id = url.pathname.split('/')[2]
    if (!/^\d+$/.test(id || '')) return response
    const base = Netlify.env.get('VITE_SUPABASE_URL')
    const key = Netlify.env.get('VITE_SUPABASE_ANON_KEY')
    if (!base || !key) return response
    const r = await fetch(`${base}/rest/v1/feed?id=eq.${id}&removed=eq.false&select=title,kind,media_url,nsfw,username`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    })
    if (!r.ok) return response
    const [post] = await r.json()
    if (!post) return response

    let tags = `<meta property="og:site_name" content="18gag" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${esc(post.title)}" />
<meta property="og:description" content="Posted by ${esc(post.username)} on 18gag" />
<meta property="og:url" content="${esc(url.origin + url.pathname)}" />`
    if (post.kind === 'image' && post.media_url && !post.nsfw) {
      const image = post.media_url.startsWith('http') ? post.media_url : url.origin + post.media_url
      tags += `\n<meta property="og:image" content="${esc(image)}" />\n<meta name="twitter:card" content="summary_large_image" />`
    }
    const html = (await response.text())
      .replace('<title>18gag</title>', `<title>${esc(post.title)} · 18gag</title>`)
      .replace('</head>', `${tags}\n</head>`)
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    return new Response(html, { status: response.status, headers })
  } catch {
    return response
  }
}

export const config = { path: '/post/*', onError: 'bypass' }
