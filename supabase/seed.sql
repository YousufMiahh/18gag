-- 18gag starter content: five clearly labelled bot accounts and their posts.
-- Run once in the Supabase SQL editor, after schema.sql. Safe to run again (it skips if already there).
-- The pictures live in this repo under public/seed/, so they are served by the site itself.
-- To remove everything later: delete from auth.users where email like '%@bots.18gag.invalid';

do $$
declare pid bigint;
begin
  if exists (select 1 from auth.users where email like '%@bots.18gag.invalid') then
    raise notice 'Bots already exist, nothing to do.';
    return;
  end if;

  -- the bots cannot log in: they have no password
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                          created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change)
  values
    ('00000000-0000-0000-0000-000000000000', 'b0700000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'chuckle_bot@bots.18gag.invalid', now(), '{"provider":"email","providers":["email"]}', '{"username":"chuckle_bot"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'b0700000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'devhumor_bot@bots.18gag.invalid', now(), '{"provider":"email","providers":["email"]}', '{"username":"devhumor_bot"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'b0700000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'petpost_bot@bots.18gag.invalid', now(), '{"provider":"email","providers":["email"]}', '{"username":"petpost_bot"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'b0700000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'snack_bot@bots.18gag.invalid', now(), '{"provider":"email","providers":["email"]}', '{"username":"snack_bot"}', now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', 'b0700000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'pitstop_bot@bots.18gag.invalid', now(), '{"provider":"email","providers":["email"]}', '{"username":"pitstop_bot"}', now(), now(), '', '', '', '');

  update public.profiles set display_name = 'Chuckle Bot', bio = 'Automated account. Posts starter memes for 18gag.' where id = 'b0700000-0000-4000-8000-000000000001';
  update public.profiles set display_name = 'Dev Humor Bot', bio = 'Automated account. Posts starter memes for 18gag.' where id = 'b0700000-0000-4000-8000-000000000002';
  update public.profiles set display_name = 'Pet Post Bot', bio = 'Automated account. Posts starter memes for 18gag.' where id = 'b0700000-0000-4000-8000-000000000003';
  update public.profiles set display_name = 'Snack Bot', bio = 'Automated account. Posts starter memes for 18gag.' where id = 'b0700000-0000-4000-8000-000000000004';
  update public.profiles set display_name = 'Pit Stop Bot', bio = 'Automated account. Posts starter memes for 18gag.' where id = 'b0700000-0000-4000-8000-000000000005';

  insert into public.posts (author_id, title, kind, media_url, media_w, media_h, body, section, tags, created_at)
  values
    ('b0700000-0000-4000-8000-000000000001', 'Every single night', 'image', '/seed/01.png', 1080, 810, null, 'funny', '{sleep,relatable}', now() - interval '2 hours'),
    ('b0700000-0000-4000-8000-000000000002', 'Where the time actually goes', 'image', '/seed/02.png', 1080, 810, null, 'tech', '{coding,debugging}', now() - interval '3 hours'),
    ('b0700000-0000-4000-8000-000000000003', 'Emergency declared', 'image', '/seed/03.png', 1080, 810, null, 'animals', '{cats}', now() - interval '5 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'A small change, they said', 'image', '/seed/04.png', 1080, 810, null, 'funny', '{work,clients}', now() - interval '7 hours'),
    ('b0700000-0000-4000-8000-000000000003', 'Dogs have no chill', 'image', '/seed/05.png', 1080, 810, null, 'animals', '{dogs}', now() - interval '9 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'New office sign just dropped', 'image', '/seed/06.png', 1080, 810, null, 'funny', '{work,meetings}', now() - interval '11 hours'),
    ('b0700000-0000-4000-8000-000000000002', 'Game library, explained', 'image', '/seed/07.png', 1080, 810, null, 'gaming', '{backlog}', now() - interval '13 hours'),
    ('b0700000-0000-4000-8000-000000000002', 'Suspicious', 'image', '/seed/08.png', 1080, 810, null, 'tech', '{coding}', now() - interval '16 hours'),
    ('b0700000-0000-4000-8000-000000000004', 'Fridge audit', 'image', '/seed/09.png', 1080, 810, null, 'food', '{fridge}', now() - interval '18 hours'),
    ('b0700000-0000-4000-8000-000000000005', 'It was a five minute job', 'image', '/seed/10.png', 1080, 810, null, 'cars', '{mechanic,diy}', now() - interval '20 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'It was a school night', 'image', '/seed/11.png', 1080, 810, null, 'gaming', '{sleep}', now() - interval '23 hours'),
    ('b0700000-0000-4000-8000-000000000004', 'Pizza maths', 'image', '/seed/12.png', 1080, 810, null, 'food', '{pizza}', now() - interval '26 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'Thought this at 2am and now you have to as well', 'image', '/seed/13.png', 1080, 810, null, 'random', '{showerthoughts}', now() - interval '29 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'The weekly arc', 'image', '/seed/14.png', 1080, 810, null, 'funny', '{work,friday}', now() - interval '33 hours'),
    ('b0700000-0000-4000-8000-000000000002', 'Helpful as ever', 'image', '/seed/15.png', 1080, 810, null, 'tech', '{passwords}', now() - interval '37 hours'),
    ('b0700000-0000-4000-8000-000000000005', 'Every time', 'image', '/seed/16.png', 1080, 810, null, 'cars', '{diy}', now() - interval '41 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'Film night', 'image', '/seed/17.png', 1080, 810, null, 'movies-tv', '{streaming}', now() - interval '45 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'Expert analysis', 'image', '/seed/18.png', 1080, 810, null, 'sports', '{football}', now() - interval '50 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'She does not take no for an answer', 'image', '/seed/19.png', 1080, 810, null, 'wholesome', '{family}', now() - interval '55 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'Self control', 'image', '/seed/20.png', 1080, 810, null, 'anime', '{bingewatch}', now() - interval '60 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'Explain this', 'image', '/seed/21.png', 1080, 810, null, 'wtf', '{mystery}', now() - interval '66 hours'),
    ('b0700000-0000-4000-8000-000000000002', 'Peer reviewed by my flatmate', 'image', '/seed/22.png', 1080, 810, null, 'science', '{experiments}', now() - interval '72 hours'),
    ('b0700000-0000-4000-8000-000000000001', 'Welcome to 18gag', 'text', null, null, null, 'This place is brand new, so the feed is mostly us bots for now.

Post a meme, start a poll, or make something in the meme maker. Upvote what makes you laugh and it climbs the Hot page.', 'random', '{welcome}', now() - interval '4 hours'),
    ('b0700000-0000-4000-8000-000000000002', 'Things I have said to a computer this week', 'text', null, null, null, '1. Why.
2. No, the other why.
3. It worked yesterday.
4. I did not change anything.
5. Oh. I changed something.', 'tech', '{coding}', now() - interval '31 hours');

  insert into public.posts (author_id, title, kind, section, tags, created_at)
  values ('b0700000-0000-4000-8000-000000000004', 'Settle it: does pineapple belong on pizza?', 'poll', 'food', '{debate}', now() - interval '6 hours') returning id into pid;
  insert into public.poll_options (post_id, label) values (pid, 'Yes, and I am right'), (pid, 'No, and I am calling someone'), (pid, 'Only when nobody is looking');

  insert into public.posts (author_id, title, kind, section, tags, created_at)
  values ('b0700000-0000-4000-8000-000000000005', 'What actually fixes the car?', 'poll', 'cars', '{debate}', now() - interval '15 hours') returning id into pid;
  insert into public.poll_options (post_id, label) values (pid, 'Turning the radio up'), (pid, 'A bigger hammer'), (pid, 'Paying a professional'), (pid, 'Selling it');
end $$;
