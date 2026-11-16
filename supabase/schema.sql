-- 18gag database. Paste this whole file into the Supabase SQL editor and run it once.

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
end $$;

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  display_name text,
  bio text not null default '',
  avatar_url text,
  is_admin boolean not null default false,
  is_pro boolean not null default false,
  show_nsfw boolean not null default false,
  streak int not null default 0,
  best_streak int not null default 0,
  last_seen date,
  created_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (lower(username));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  fallback text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 10);
  uname text := coalesce(nullif(new.raw_user_meta_data->>'username', ''), fallback);
begin
  if uname !~ '^[a-zA-Z0-9_]{3,20}$'
     or exists (select 1 from profiles where lower(username) = lower(uname)) then
    uname := fallback;
  end if;
  insert into profiles (id, username, display_name) values (new.id, uname, uname);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- daily visit streak; returns the caller's profile
create or replace function public.touch_streak() returns public.profiles
language plpgsql security definer set search_path = public as $$
declare
  p profiles;
  today date := (now() at time zone 'utc')::date;
begin
  select * into p from profiles where id = auth.uid();
  if not found then return null; end if;
  if p.last_seen is not distinct from today then return p; end if;
  update profiles set
    streak = case when last_seen = today - 1 then streak + 1 else 1 end,
    best_streak = greatest(best_streak, case when last_seen = today - 1 then streak + 1 else 1 end),
    last_seen = today
  where id = auth.uid() returning * into p;
  return p;
end $$;

-- ---------- sections and boards ----------
create table public.sections (
  slug text primary key,
  name text not null,
  sort int not null default 0
);
insert into public.sections (slug, name, sort) values
  ('funny','Funny',1),('gaming','Gaming',2),('tech','Tech',3),('animals','Animals',4),
  ('food','Food',5),('sports','Sports',6),('movies-tv','Movies & TV',7),('anime','Anime',8),
  ('cars','Cars',9),('science','Science',10),('wtf','WTF',11),('wholesome','Wholesome',12),
  ('news','News',13),('random','Random',14);

create table public.boards (
  slug text primary key,
  name text not null,
  description text not null default '',
  sort int not null default 0
);
insert into public.boards (slug, name, description, sort) values
  ('general','General chat','Anything goes, within reason.',1),
  ('gaming','Gaming','What are you playing?',2),
  ('movies-tv','Movies & TV','Recommendations and hot takes.',3),
  ('tech','Tech','Gadgets, code and things that broke today.',4),
  ('cars','Cars','Builds, problems and bad decisions.',5),
  ('advice','Advice','Ask the internet. What could go wrong.',6);

-- ---------- posts ----------
create table public.posts (
  id bigint generated always as identity primary key,
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  kind text not null check (kind in ('image','video','text','poll')),
  media_url text,
  media_w int,
  media_h int,
  body text,
  section text not null references public.sections (slug),
  tags text[] not null default '{}',
  nsfw boolean not null default false,
  up_count int not null default 0,
  down_count int not null default 0,
  comment_count int not null default 0,
  award_count int not null default 0,
  removed boolean not null default false,
  created_at timestamptz not null default now()
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_section_idx on public.posts (section, created_at desc);
create index posts_author_idx on public.posts (author_id, created_at desc);
create index posts_tags_idx on public.posts using gin (tags);

create table public.post_votes (
  post_id bigint not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_votes_user_idx on public.post_votes (user_id, created_at desc);

create table public.saves (
  post_id bigint not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.hidden_posts (
  post_id bigint not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  primary key (post_id, user_id)
);

-- polls
create table public.poll_options (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  vote_count int not null default 0
);
create table public.poll_votes (
  post_id bigint not null references public.posts on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  option_id bigint not null references public.poll_options on delete cascade,
  primary key (post_id, user_id)
);

-- ---------- comments ----------
create table public.comments (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  parent_id bigint references public.comments on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  media_url text,
  up_count int not null default 0,
  down_count int not null default 0,
  created_at timestamptz not null default now(),
  check (body <> '' or media_url is not null)
);
create index comments_post_idx on public.comments (post_id, created_at);
create index comments_author_idx on public.comments (author_id, created_at desc);

create table public.comment_votes (
  comment_id bigint not null references public.comments on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  value smallint not null check (value in (-1, 1)),
  primary key (comment_id, user_id)
);

-- ---------- social ----------
create table public.follows (
  follower_id uuid not null default auth.uid() references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id);

create table public.section_follows (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  section text not null references public.sections (slug) on delete cascade,
  primary key (user_id, section)
);

create table public.blocks (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  blocked_id uuid not null references public.profiles on delete cascade,
  primary key (user_id, blocked_id)
);

create table public.awards (
  id bigint generated always as identity primary key,
  post_id bigint not null references public.posts on delete cascade,
  giver_id uuid not null default auth.uid() references public.profiles on delete cascade,
  kind text not null check (kind in ('gold','lol','brain','heart','fire')),
  created_at timestamptz not null default now(),
  unique (post_id, giver_id, kind)
);

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  actor_id uuid references public.profiles on delete cascade,
  type text not null check (type in ('comment','reply','follow','award','milestone')),
  post_id bigint references public.posts on delete cascade,
  comment_id bigint references public.comments on delete cascade,
  meta text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null default auth.uid() references public.profiles on delete cascade,
  post_id bigint references public.posts on delete cascade,
  comment_id bigint references public.comments on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open','resolved')),
  created_at timestamptz not null default now(),
  check (post_id is not null or comment_id is not null)
);

create table public.board_messages (
  id bigint generated always as identity primary key,
  board text not null references public.boards (slug) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index board_messages_idx on public.board_messages (board, created_at desc);

-- ---------- counters and notifications (triggers) ----------
create or replace function public.on_post_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid bigint := coalesce(new.post_id, old.post_id);
  ups int;
  owner uuid;
begin
  update posts set
    up_count = (select count(*) from post_votes where post_id = pid and value = 1),
    down_count = (select count(*) from post_votes where post_id = pid and value = -1)
  where id = pid returning up_count, author_id into ups, owner;
  if tg_op <> 'DELETE' and new.value = 1 and ups in (10, 50, 100, 500, 1000, 5000, 10000)
     and not exists (select 1 from notifications
                     where user_id = owner and post_id = pid and type = 'milestone' and meta = ups::text) then
    insert into notifications (user_id, type, post_id, meta) values (owner, 'milestone', pid, ups::text);
  end if;
  return null;
end $$;
create trigger post_votes_count after insert or update or delete on public.post_votes
  for each row execute function public.on_post_vote();

create or replace function public.on_comment_vote() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid bigint := coalesce(new.comment_id, old.comment_id);
begin
  update comments set
    up_count = (select count(*) from comment_votes where comment_id = cid and value = 1),
    down_count = (select count(*) from comment_votes where comment_id = cid and value = -1)
  where id = cid;
  return null;
end $$;
create trigger comment_votes_count after insert or update or delete on public.comment_votes
  for each row execute function public.on_comment_vote();

create or replace function public.on_comment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid bigint := coalesce(new.post_id, old.post_id);
  target uuid;
begin
  update posts set comment_count = (select count(*) from comments where post_id = pid) where id = pid;
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select author_id into target from comments where id = new.parent_id;
      if target is not null and target <> new.author_id then
        insert into notifications (user_id, actor_id, type, post_id, comment_id)
        values (target, new.author_id, 'reply', pid, new.id);
      end if;
    else
      select author_id into target from posts where id = pid;
      if target is not null and target <> new.author_id then
        insert into notifications (user_id, actor_id, type, post_id, comment_id)
        values (target, new.author_id, 'comment', pid, new.id);
      end if;
    end if;
  end if;
  return null;
end $$;
create trigger comments_count after insert or delete on public.comments
  for each row execute function public.on_comment_change();

create or replace function public.on_award_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid bigint := coalesce(new.post_id, old.post_id);
  owner uuid;
begin
  update posts set award_count = (select count(*) from awards where post_id = pid)
  where id = pid returning author_id into owner;
  if tg_op = 'INSERT' and owner is not null and owner <> new.giver_id then
    insert into notifications (user_id, actor_id, type, post_id, meta)
    values (owner, new.giver_id, 'award', pid, new.kind);
  end if;
  return null;
end $$;
create trigger awards_count after insert or delete on public.awards
  for each row execute function public.on_award_change();

create or replace function public.on_follow() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into notifications (user_id, actor_id, type) values (new.following_id, new.follower_id, 'follow');
  return null;
end $$;
create trigger follows_notify after insert on public.follows
  for each row execute function public.on_follow();

create or replace function public.on_poll_vote() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update poll_options o set vote_count = (select count(*) from poll_votes v where v.option_id = o.id)
  where o.post_id = coalesce(new.post_id, old.post_id);
  return null;
end $$;
create trigger poll_votes_count after insert or update or delete on public.poll_votes
  for each row execute function public.on_poll_vote();

-- ---------- moderation (admins only) ----------
create or replace function public.mod_set_post_removed(pid bigint, flag boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update posts set removed = flag where id = pid;
end $$;

create or replace function public.mod_delete_comment(cid bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  delete from comments where id = cid;
end $$;

create or replace function public.mod_set_pro(uname text, flag boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update profiles set is_pro = flag where lower(username) = lower(uname);
  if not found then raise exception 'No user called %', uname; end if;
end $$;

-- ---------- views the site reads ----------
create view public.feed with (security_invoker = on) as
select p.*,
  pr.username, pr.display_name, pr.avatar_url, pr.is_pro,
  (p.up_count - p.down_count) as score,
  (p.up_count - p.down_count + 1)::float8
    / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5) as hot,
  case when p.created_at > now() - interval '3 days'
    then (p.up_count + p.comment_count * 2 + 1)::float8
      / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 0.8)
    else 0 end as trending
from public.posts p join public.profiles pr on pr.id = p.author_id;

create view public.comments_view with (security_invoker = on) as
select c.*, pr.username, pr.display_name, pr.avatar_url, pr.is_pro,
  (c.up_count - c.down_count) as score
from public.comments c join public.profiles pr on pr.id = c.author_id;

create view public.notifications_view with (security_invoker = on) as
select n.*, a.username as actor_username, a.avatar_url as actor_avatar, p.title as post_title
from public.notifications n
left join public.profiles a on a.id = n.actor_id
left join public.posts p on p.id = n.post_id;

create view public.board_messages_view with (security_invoker = on) as
select m.*, pr.username, pr.avatar_url, pr.is_pro
from public.board_messages m join public.profiles pr on pr.id = m.author_id;

create view public.reports_view with (security_invoker = on) as
select r.*, rp.username as reporter, p.title as post_title, p.removed as post_removed,
  c.body as comment_body, c.post_id as comment_post_id
from public.reports r
join public.profiles rp on rp.id = r.reporter_id
left join public.posts p on p.id = r.post_id
left join public.comments c on c.id = r.comment_id;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.sections enable row level security;
alter table public.boards enable row level security;
alter table public.posts enable row level security;
alter table public.post_votes enable row level security;
alter table public.saves enable row level security;
alter table public.hidden_posts enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_votes enable row level security;
alter table public.follows enable row level security;
alter table public.section_follows enable row level security;
alter table public.blocks enable row level security;
alter table public.awards enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.board_messages enable row level security;

-- anyone can read public content
create policy "read profiles" on public.profiles for select using (true);
create policy "read sections" on public.sections for select using (true);
create policy "read boards" on public.boards for select using (true);
create policy "read posts" on public.posts for select
  using (not removed or author_id = auth.uid() or public.is_admin());
create policy "read poll options" on public.poll_options for select using (true);
create policy "read comments" on public.comments for select using (true);
create policy "read follows" on public.follows for select using (true);
create policy "read awards" on public.awards for select using (true);
create policy "read board messages" on public.board_messages for select using (true);

-- profiles: edit your own
create policy "update own profile" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- posts
create policy "create posts" on public.posts for insert to authenticated
  with check (author_id = auth.uid());
create policy "edit own posts" on public.posts for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete own posts" on public.posts for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

create policy "add poll options" on public.poll_options for insert to authenticated
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

-- comments
create policy "create comments" on public.comments for insert to authenticated
  with check (author_id = auth.uid());
create policy "edit own comments" on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "delete own comments" on public.comments for delete to authenticated
  using (author_id = auth.uid());

-- things that belong to one user
create policy "own post votes" on public.post_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own comment votes" on public.comment_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own poll votes" on public.poll_votes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own saves" on public.saves for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own hidden posts" on public.hidden_posts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own section follows" on public.section_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own blocks" on public.blocks for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "follow" on public.follows for insert to authenticated
  with check (follower_id = auth.uid());
create policy "unfollow" on public.follows for delete to authenticated
  using (follower_id = auth.uid());

create policy "give awards" on public.awards for insert to authenticated
  with check (giver_id = auth.uid());
create policy "take back awards" on public.awards for delete to authenticated
  using (giver_id = auth.uid());

create policy "read own notifications" on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy "mark own notifications" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own notifications" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

create policy "file reports" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy "admins read reports" on public.reports for select to authenticated
  using (public.is_admin());
create policy "admins resolve reports" on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "post board messages" on public.board_messages for insert to authenticated
  with check (author_id = auth.uid());
create policy "delete board messages" on public.board_messages for delete to authenticated
  using (author_id = auth.uid() or public.is_admin());

-- ---------- base permissions (stated outright, in case the project does not grant them by default) ----------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- ---------- column permissions (stop people editing counters, badges, etc.) ----------
revoke insert, update, delete on public.sections, public.boards from anon, authenticated;

revoke insert, update on public.profiles from anon, authenticated;
grant update (username, display_name, bio, avatar_url, show_nsfw) on public.profiles to authenticated;

revoke insert, update on public.posts from anon, authenticated;
grant insert (title, kind, media_url, media_w, media_h, body, section, tags, nsfw) on public.posts to authenticated;
grant update (title, section, tags, nsfw) on public.posts to authenticated;

revoke insert, update on public.comments from anon, authenticated;
grant insert (post_id, parent_id, body, media_url) on public.comments to authenticated;
grant update (body) on public.comments to authenticated;

revoke insert, update on public.poll_options from anon, authenticated;
grant insert (post_id, label) on public.poll_options to authenticated;

revoke insert, update on public.notifications from anon, authenticated;
grant update (read) on public.notifications to authenticated;

revoke insert, update on public.reports from anon, authenticated;
grant insert (post_id, comment_id, reason) on public.reports to authenticated;
grant update (status) on public.reports to authenticated;

revoke insert, update on public.board_messages from anon, authenticated;
grant insert (board, body) on public.board_messages to authenticated;

revoke insert, update on public.awards from anon, authenticated;
grant insert (post_id, kind) on public.awards to authenticated;

-- ---------- live updates ----------
alter publication supabase_realtime add table public.board_messages, public.notifications;

-- ---------- uploads ----------
insert into storage.buckets (id, name, public) values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media is public" on storage.objects for select using (bucket_id = 'media');
create policy "upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

-- =====================================================================
-- Update 1 (also available on its own as update-1.sql for older databases)
-- =====================================================================

-- ---------- new columns ----------
alter table public.profiles
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_banned boolean not null default false,
  add column if not exists private_upvotes boolean not null default false;
alter table public.posts add column if not exists is_anonymous boolean not null default false;
alter table public.comments add column if not exists edited_at timestamptz;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('comment','reply','follow','award','milestone','mention'));

-- ---------- muted tags and sections ----------
create table if not exists public.muted_tags (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  tag text not null check (char_length(tag) between 1 and 40),
  primary key (user_id, tag)
);
create table if not exists public.muted_sections (
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  section text not null references public.sections (slug) on delete cascade,
  primary key (user_id, section)
);
alter table public.muted_tags enable row level security;
alter table public.muted_sections enable row level security;
drop policy if exists "own muted tags" on public.muted_tags;
create policy "own muted tags" on public.muted_tags for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "own muted sections" on public.muted_sections;
create policy "own muted sections" on public.muted_sections for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.muted_tags, public.muted_sections to authenticated;

-- ---------- helpers ----------
create or replace function public.is_banned() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return coalesce((select p.is_banned from public.profiles p where p.id = auth.uid()), false);
end $$;

create or replace function public.owns_post(pid bigint) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return exists (select 1 from public.posts p where p.id = pid and p.author_id = auth.uid());
end $$;

-- ---------- banned users cannot post ----------
drop policy if exists "banned cannot post" on public.posts;
create policy "banned cannot post" on public.posts as restrictive for insert to authenticated
  with check (not public.is_banned());
drop policy if exists "banned cannot comment" on public.comments;
create policy "banned cannot comment" on public.comments as restrictive for insert to authenticated
  with check (not public.is_banned());
drop policy if exists "banned cannot chat" on public.board_messages;
create policy "banned cannot chat" on public.board_messages as restrictive for insert to authenticated
  with check (not public.is_banned());

drop policy if exists "add poll options" on public.poll_options;
create policy "add poll options" on public.poll_options for insert to authenticated
  with check (public.owns_post(post_id));

-- ---------- rate limits ----------
create or replace function public.rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null or is_admin() then return new; end if;
  execute format('select count(*) from public.%I where author_id = $1 and created_at > now() - $2::interval', tg_table_name)
    into n using auth.uid(), tg_argv[1];
  if n >= tg_argv[0]::int then
    raise exception 'Slow down a little. You have hit the limit here, try again in a few minutes.';
  end if;
  return new;
end $$;
drop trigger if exists posts_rate on public.posts;
create trigger posts_rate before insert on public.posts
  for each row execute function public.rate_limit('10', '1 hour');
drop trigger if exists comments_rate on public.comments;
create trigger comments_rate before insert on public.comments
  for each row execute function public.rate_limit('20', '5 minutes');
drop trigger if exists board_rate on public.board_messages;
create trigger board_rate before insert on public.board_messages
  for each row execute function public.rate_limit('15', '1 minute');

-- ---------- comment edits ----------
create or replace function public.on_comment_edit() returns trigger
language plpgsql as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;
drop trigger if exists comments_edit on public.comments;
create trigger comments_edit before update on public.comments
  for each row execute function public.on_comment_edit();

-- ---------- comment counts, reply and @mention notifications ----------
create or replace function public.on_comment_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  pid bigint := coalesce(new.post_id, old.post_id);
  target uuid;
  told uuid[] := '{}';
  uname text;
begin
  update posts set comment_count = (select count(*) from comments where post_id = pid) where id = pid;
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select author_id into target from comments where id = new.parent_id;
      if target is not null and target <> new.author_id then
        insert into notifications (user_id, actor_id, type, post_id, comment_id)
        values (target, new.author_id, 'reply', pid, new.id);
        told := told || target;
      end if;
    else
      select author_id into target from posts where id = pid;
      if target is not null and target <> new.author_id then
        insert into notifications (user_id, actor_id, type, post_id, comment_id)
        values (target, new.author_id, 'comment', pid, new.id);
        told := told || target;
      end if;
    end if;
    for uname in
      select distinct lower(m[1]) from regexp_matches(new.body, '@([A-Za-z0-9_]{3,20})', 'g') m limit 5
    loop
      select id into target from profiles where lower(username) = uname;
      if target is not null and target <> new.author_id and not target = any (told) then
        insert into notifications (user_id, actor_id, type, post_id, comment_id)
        values (target, new.author_id, 'mention', pid, new.id);
        told := told || target;
      end if;
    end loop;
  end if;
  return null;
end $$;

-- ---------- upvotes are public unless the voter makes them private ----------
drop policy if exists "read public upvotes" on public.post_votes;
create policy "read public upvotes" on public.post_votes for select
  using (value = 1 and not exists (
    select 1 from public.profiles p where p.id = post_votes.user_id and p.private_upvotes));

-- ---------- admin tools and account deletion ----------
create or replace function public.mod_set_user(uname text, field text, flag boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if field = 'pro' then update profiles set is_pro = flag where lower(username) = lower(uname);
  elsif field = 'verified' then update profiles set is_verified = flag where lower(username) = lower(uname);
  elsif field = 'banned' then update profiles set is_banned = flag where lower(username) = lower(uname) and not is_admin;
  else raise exception 'Unknown setting %', field;
  end if;
  if not found then raise exception 'No user called % (admins cannot be banned)', uname; end if;
end $$;

create or replace function public.delete_account() returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ---------- views (rebuilt so anonymous authors stay hidden) ----------
drop view if exists public.feed;
create view public.feed as
select p.id, p.title, p.kind, p.media_url, p.media_w, p.media_h, p.body, p.section, p.tags, p.nsfw,
  p.up_count, p.down_count, p.comment_count, p.award_count, p.removed, p.created_at, p.is_anonymous,
  case when m.masked then null else p.author_id end as author_id,
  case when m.masked then 'anonymous' else pr.username end as username,
  case when m.masked then 'Anonymous' else pr.display_name end as display_name,
  case when m.masked then null else pr.avatar_url end as avatar_url,
  (not m.masked and pr.is_pro) as is_pro,
  (not m.masked and pr.is_verified) as is_verified,
  case when m.masked then null else pr.created_at end as author_since,
  (p.author_id = me.id) is true as is_mine,
  (p.up_count - p.down_count) as score,
  (p.up_count - p.down_count + 1)::float8
    / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 1.5) as hot,
  case when p.created_at > now() - interval '3 days'
    then (p.up_count + p.comment_count * 2 + 1)::float8
      / power(extract(epoch from (now() - p.created_at)) / 3600 + 2, 0.8)
    else 0 end as trending
from public.posts p
join public.profiles pr on pr.id = p.author_id
cross join (select auth.uid() as id, public.is_admin() as admin) me
cross join lateral (select p.is_anonymous and p.author_id is distinct from me.id and not me.admin as masked) m
where not p.removed or p.author_id = me.id or me.admin;

drop view if exists public.comments_view;
create view public.comments_view with (security_invoker = on) as
select c.*, pr.username, pr.display_name, pr.avatar_url, pr.is_pro, pr.is_verified, pr.created_at as author_since,
  (c.up_count - c.down_count) as score
from public.comments c join public.profiles pr on pr.id = c.author_id;

drop view if exists public.board_messages_view;
create view public.board_messages_view with (security_invoker = on) as
select m.*, pr.username, pr.avatar_url, pr.is_pro, pr.is_verified
from public.board_messages m join public.profiles pr on pr.id = m.author_id;

grant select on public.feed, public.comments_view, public.board_messages_view to anon, authenticated;

-- ---------- permissions for the new pieces ----------
grant update (private_upvotes) on public.profiles to authenticated;
grant insert (is_anonymous) on public.posts to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- the author of a post is only readable through the feed view, which hides anonymous ones
revoke select on public.posts from anon, authenticated;
grant select (id, title, kind, media_url, media_w, media_h, body, section, tags, nsfw, up_count, down_count,
              comment_count, award_count, removed, created_at, is_anonymous) on public.posts to anon, authenticated;

-- anonymous uploads go to a shared folder so the file address does not reveal who posted
drop policy if exists "upload to anon folder" on storage.objects;
create policy "upload to anon folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = 'anon');
