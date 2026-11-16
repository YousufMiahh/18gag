-- 18gag update 1: anonymous posts, private upvotes, verified and banned flags, account age,
-- comment editing, @mentions, muted tags and sections, rate limits, account deletion.
-- For databases created before this update. Safe to run more than once.

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
