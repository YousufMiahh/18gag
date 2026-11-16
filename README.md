# 18gag

A meme community site: post images, GIFs, videos, text and polls; vote, comment, follow, give awards and chat on boards.

Built with React (Vite) and Supabase (login, Postgres database, file storage, live updates).

## Set up (about 10 minutes)

### 1. Supabase

1. Create a new project at supabase.com.
2. Open **SQL Editor**, paste everything from `supabase/schema.sql`, and press **Run**. (If your database was set up before 16 Nov 2026, run `supabase/update-1.sql` instead; it adds the newer features to an existing database.) This creates the tables, security rules, the `media` upload bucket and the starter sections and boards.
3. Open **Project Settings → API** and copy the **Project URL** and the **anon public** key.
4. Open **Authentication → URL Configuration** and set **Site URL** to your site's address (for local work, `http://localhost:5173`). Confirmation and password-reset emails link back to it.

Optional: under **Authentication → Providers → Email** you can turn off "Confirm email" while testing so new accounts can log in straight away.

### 2. Run it on your computer

```bash
npm install
cp .env.example .env    # then paste your URL and anon key into .env
npm run dev
```

Open http://localhost:5173.

### 3. Put it online with Netlify

1. In Netlify choose **Add new site → Import an existing project** and pick this repo.
2. Build settings are read from `netlify.toml` (build `npm run build`, publish `dist`).
3. Under **Site configuration → Environment variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then redeploy.
4. Put the Netlify address into Supabase's **Site URL** (step 1.4).

### 4. Add starter posts (optional)

Run `supabase/seed.sql` in the SQL editor. It creates five bot accounts (their names end in `_bot` and their bios say they are automated) and 26 starter posts: memes, two text posts and two polls. The pictures are in `public/seed/` and are served by the site itself. The bots have no password and cannot log in.

To remove them and everything they posted:

```sql
delete from auth.users where email like '%@bots.18gag.invalid';
```

### 5. Make yourself an admin

Sign up on the site, then run this in the Supabase SQL editor with your username:

```sql
update public.profiles set is_admin = true where username = 'your_username';
```

A **Moderation** link then appears in your account menu.

## What's in it

| Area | Features |
| --- | --- |
| Feeds | Hot, Trending, Fresh, Top this week, Following; endless scroll; J / K keys to move between posts |
| Discovery | Sections, tags, search by title or tag |
| Posts | Image, GIF and video uploads, text posts, polls, built-in meme maker (top and bottom captions) |
| Voting | Upvote and downvote on posts and comments |
| Comments | Threaded replies, image comments, Hot / Fresh sorting, collapse threads, OP marker |
| Accounts | Email sign-up and login, password reset, profile picture, display name, bio |
| Profiles | Posts, comments, upvoted and saved tabs; follower counts; daily streak |
| Social | Follow people and sections, block users, hide posts, share links |
| Notifications | Comments, replies, follows, awards and upvote milestones, live unread badge |
| Awards | Five awards anyone can give to a post |
| Boards | Live chat rooms by topic |
| Safety | Sensitive-content blur, report posts and comments, admin review queue, remove content |
| Privacy | Anonymous posts, private upvotes, mute sections and tags, delete your account |
| Editing | Edit your posts and comments, change username, @mentions in comments |
| Trust | Verified ticks and bans (set by an admin), account age beside names, rate limits on posts, comments and chat |
| Extras | Pro badge (set by an admin), light, dark and timed themes, link preview cards for shared posts, images shrunk before upload, rules and privacy pages |

## If something goes wrong

- **"permission denied" errors in the browser console**: run `supabase/permissions.sql` in the SQL editor.
- **A "Connect your Supabase project" screen**: the two environment variables are missing or misspelled. Fix them in Netlify and redeploy.
- **Sign-up says to check email but nothing arrives**: Supabase's built-in email sender is rate-limited. Turn off "Confirm email" or connect your own email provider.

## Google login (optional)

In Supabase open **Authentication → Providers → Google**, turn it on and add the client ID and secret from Google Cloud. Then add `VITE_GOOGLE_LOGIN=true` to the Netlify environment variables and redeploy. A "Continue with Google" button appears in the login box. People who sign in this way get a placeholder username they can change in Settings.

## Changing things

- **Sections and boards**: edit the rows in the `sections` and `boards` tables in Supabase.
- **Awards**: the list is in `src/lib/api.js` (`AWARDS`) and the `kind` check on the `awards` table.
- **Look and feel**: colours and fonts are the variables at the top of `src/styles.css`.
- **Ranking**: the `hot` and `trending` formulas are in the `feed` view in `supabase/schema.sql`.

## Not included

- Payments. The Pro badge is switched on by an admin; there is no checkout.
- Adverts, native phone apps and push notifications.
- Automatic content filtering. Moderation is reports plus a human admin.
- A GIF search picker in comments (it needs a key from a GIF provider). You can attach a GIF file to a comment instead.
- Video compression. Videos upload as they are, up to 50 MB.
