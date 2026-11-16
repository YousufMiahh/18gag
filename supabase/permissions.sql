-- Only needed if the site shows "permission denied" errors. Safe to run more than once.

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

-- update 1
grant select, insert, delete on public.muted_tags, public.muted_sections to authenticated;
grant update (private_upvotes) on public.profiles to authenticated;
grant insert (is_anonymous) on public.posts to authenticated;
grant select on public.feed, public.comments_view, public.board_messages_view to anon, authenticated;
revoke select on public.posts from anon, authenticated;
grant select (id, title, kind, media_url, media_w, media_h, body, section, tags, nsfw, up_count, down_count,
              comment_count, award_count, removed, created_at, is_anonymous) on public.posts to anon, authenticated;
