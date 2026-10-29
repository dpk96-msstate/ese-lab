-- ==========================================
-- 1. CREATE TABLES
-- ==========================================

create table public.blogs (
  id uuid not null default gen_random_uuid (),
  title text not null,
  content text not null,
  category text null,
  tags text[] null,
  status text null default 'draft'::text,
  author_id uuid null,
  author_name text null,
  image_url text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint blogs_pkey primary key (id)
) TABLESPACE pg_default;

create table public.members (
  id uuid not null default gen_random_uuid (),
  name text not null,
  title text null,
  affiliation text null,
  role_category text not null,
  image_url text null,
  website_url text null,
  linkedin_url text null,
  google_scholar_url text null,
  github_url text null,
  email text null,
  contact_number text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint members_pkey primary key (id)
) TABLESPACE pg_default;

create table public.news (
  id uuid not null default gen_random_uuid (),
  title text not null,
  description text null,
  month text null,
  year integer null,
  tags text[] null,
  is_featured boolean null default false,
  image_url text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint news_pkey primary key (id)
) TABLESPACE pg_default;

create table public.publications (
  id uuid not null default gen_random_uuid (),
  title text not null,
  authors text not null,
  venue text null,
  year integer null,
  citations integer null default 0,
  doi text null,
  bibtex text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint publications_pkey primary key (id)
) TABLESPACE pg_default;

create table public.job_openings (
  id uuid not null default gen_random_uuid (),
  title text not null,
  description text not null,
  advisor_id uuid null,
  is_active boolean null default true,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint job_openings_pkey primary key (id),
  constraint job_openings_advisor_id_fkey foreign key (advisor_id) references members (id) on delete set null
) TABLESPACE pg_default;

create table public.member_directors (
    member_id uuid not null,
    director_id uuid not null,
    constraint member_directors_pkey primary key (member_id, director_id),
    constraint member_directors_director_id_fkey foreign KEY (director_id) references members (id) on delete CASCADE,
    constraint member_directors_member_id_fkey foreign KEY (member_id) references members (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_member_directors_director on public.member_directors using btree (director_id) TABLESPACE pg_default;

create index IF not exists idx_member_directors_member on public.member_directors using btree (member_id) TABLESPACE pg_default;

-- ==========================================
-- 2. ENABLE ROW LEVEL SECURITY (RLS)
-- ==========================================
-- Essential when using the publishable API key on the client side

alter table public.blogs enable row level security;

alter table public.members enable row level security;

alter table public.news enable row level security;

alter table public.publications enable row level security;

alter table public.job_openings enable row level security;

alter table public.member_directors enable row level security;

-- ==========================================
-- 3. EDITOR ALLOWLIST
-- ==========================================
-- Only accounts listed here can change content. Signing in alone grants nothing.
-- RLS is on with no policies, so the table is invisible to the public API.

create table public.editors (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamp with time zone not null default timezone ('utc'::text, now())
);

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

-- ==========================================
-- 4. RLS POLICIES (Public Read, Editor Write)
-- ==========================================

-- BLOGS: public sees published posts only, editors also see drafts
create policy "Public can read published blogs" on public.blogs for
select using (status = 'published');

create policy "Editors can read all blogs" on public.blogs for
select to authenticated using ((select public.is_editor()));

-- Everything else is fully public to read
do $$
declare
  t text;
begin
  foreach t in array array['members', 'news', 'publications', 'job_openings', 'member_directors'] loop
    execute format('create policy "Public can read %s" on public.%I for select using (true)', t, t);
  end loop;

  foreach t in array array['blogs', 'members', 'news', 'publications', 'job_openings', 'member_directors'] loop
    execute format('create policy "Editors can insert %s" on public.%I for insert to authenticated with check ((select public.is_editor()))', t, t);
    execute format('create policy "Editors can update %s" on public.%I for update to authenticated using ((select public.is_editor())) with check ((select public.is_editor()))', t, t);
    execute format('create policy "Editors can delete %s" on public.%I for delete to authenticated using ((select public.is_editor()))', t, t);
  end loop;
end $$;

-- ==========================================
-- 5. STORAGE SETUP (Images)
-- ==========================================
-- Public bucket: files are served by URL without a select policy, so the public cannot list the bucket.
-- Editors only, images only, 5 MB max.

insert into
    storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
        'profile-images',
        'profile-images',
        true,
        5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    ) on conflict (id) do nothing;

create policy "Editors can read profile images" on storage.objects for
select to authenticated using (bucket_id = 'profile-images' and (select public.is_editor()));

create policy "Editors can upload profile images" on storage.objects for
insert to authenticated with check (bucket_id = 'profile-images' and (select public.is_editor()));

create policy "Editors can update profile images" on storage.objects for
update to authenticated using (bucket_id = 'profile-images' and (select public.is_editor()));

create policy "Editors can delete profile images" on storage.objects for
delete to authenticated using (bucket_id = 'profile-images' and (select public.is_editor()));

-- ==========================================
-- 6. GRANT EDITOR ACCESS
-- ==========================================
-- Create the user under Authentication -> Users first, then:
--   insert into public.editors (user_id) select id from auth.users where email = 'someone@example.edu';
