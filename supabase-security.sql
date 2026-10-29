-- ==========================================
-- SECURITY UPDATE FOR AN EXISTING PROJECT
-- ==========================================
-- Run once in Supabase Dashboard -> SQL Editor.
-- Before running: replace the email in step 5 with the account(s) that should be able to edit the site.
--
-- What it changes:
--   * Only users listed in public.editors can insert/update/delete content
--     (previously ANY signed-in account could edit everything).
--   * Draft blog posts are no longer readable by the public API.
--   * Image uploads are limited to editors, to image types, and to 5 MB.
--   * The public can no longer list every file in the storage bucket
--     (public image URLs keep working).

begin;

-- 1. EDITOR ALLOWLIST
create table if not exists public.editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default timezone ('utc'::text, now())
);

-- RLS on with no policies: the table is invisible to the public API.
-- Manage it from the dashboard Table Editor or the SQL Editor.
alter table public.editors enable row level security;

create or replace function public.is_editor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.editors where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_editor() from public, anon;
grant execute on function public.is_editor() to authenticated;

-- 2. TABLE WRITE POLICIES: authenticated -> editors only
do $$
declare
  t text;
begin
  foreach t in array array['blogs', 'members', 'news', 'publications', 'job_openings', 'member_directors'] loop
    execute format('drop policy if exists "Allow authenticated insert for %s" on public.%I', t, t);
    execute format('drop policy if exists "Allow authenticated update for %s" on public.%I', t, t);
    execute format('drop policy if exists "Allow authenticated delete for %s" on public.%I', t, t);

    execute format('create policy "Editors can insert %s" on public.%I for insert to authenticated with check ((select public.is_editor()))', t, t);
    execute format('create policy "Editors can update %s" on public.%I for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()))', t, t);
    execute format('create policy "Editors can delete %s" on public.%I for delete to authenticated using ((select public.is_editor()))', t, t);
  end loop;
end $$;

-- 3. BLOGS: public sees published posts only, editors see drafts too
drop policy if exists "Allow public read access for blogs" on public.blogs;

create policy "Public can read published blogs" on public.blogs for
select using (status = 'published');

create policy "Editors can read all blogs" on public.blogs for
select to authenticated using ((select public.is_editor()));

-- 4. STORAGE: editors only, images only, 5 MB max
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
where id = 'profile-images';

-- Public buckets serve files by URL without a select policy; this policy only allowed listing every file.
drop policy if exists "Allow public read access for profile images" on storage.objects;
drop policy if exists "Allow authenticated uploads for profile images" on storage.objects;
drop policy if exists "Allow authenticated updates for profile images" on storage.objects;
drop policy if exists "Allow authenticated deletes for profile images" on storage.objects;

create policy "Editors can read profile images" on storage.objects for
select to authenticated using (bucket_id = 'profile-images' and (select public.is_editor()));

create policy "Editors can upload profile images" on storage.objects for
insert to authenticated with check (bucket_id = 'profile-images' and (select public.is_editor()));

create policy "Editors can update profile images" on storage.objects for
update to authenticated using (bucket_id = 'profile-images' and (select public.is_editor()));

create policy "Editors can delete profile images" on storage.objects for
delete to authenticated using (bucket_id = 'profile-images' and (select public.is_editor()));

-- 5. GRANT EDITOR ACCESS (edit the email list first)
insert into public.editors (user_id)
select id from auth.users
where email in ('replace-with-editor@example.edu')
on conflict do nothing;

commit;

-- Check who has access afterwards:
--   select u.email, e.created_at from public.editors e join auth.users u on u.id = e.user_id;
-- Add an editor later:
--   insert into public.editors (user_id) select id from auth.users where email = 'someone@example.edu';
-- Remove one:
--   delete from public.editors where user_id = (select id from auth.users where email = 'someone@example.edu');
