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
-- 3. RLS POLICIES (Public Read, Auth Write)
-- ==========================================

-- BLOGS POLICIES
create policy "Allow public read access for blogs" on public.blogs for
select using (true);

create policy "Allow authenticated insert for blogs" on public.blogs for
insert
    to authenticated
with
    check (true);

create policy "Allow authenticated update for blogs" on public.blogs for
update to authenticated using (true);

create policy "Allow authenticated delete for blogs" on public.blogs for delete to authenticated using (true);

-- MEMBERS POLICIES
create policy "Allow public read access for members" on public.members for
select using (true);

create policy "Allow authenticated insert for members" on public.members for
insert
    to authenticated
with
    check (true);

create policy "Allow authenticated update for members" on public.members for
update to authenticated using (true);

create policy "Allow authenticated delete for members" on public.members for delete to authenticated using (true);

-- NEWS POLICIES
create policy "Allow public read access for news" on public.news for
select using (true);

create policy "Allow authenticated insert for news" on public.news for
insert
    to authenticated
with
    check (true);

create policy "Allow authenticated update for news" on public.news for
update to authenticated using (true);

create policy "Allow authenticated delete for news" on public.news for delete to authenticated using (true);

-- PUBLICATIONS POLICIES
create policy "Allow public read access for publications" on public.publications for
select using (true);

create policy "Allow authenticated insert for publications" on public.publications for
insert
    to authenticated
with
    check (true);

create policy "Allow authenticated update for publications" on public.publications for
update to authenticated using (true);

create policy "Allow authenticated delete for publications" on public.publications for delete to authenticated using (true);

-- JOB OPENINGS POLICIES
create policy "Allow public read access for job_openings" on public.job_openings for
select using (true);

create policy "Allow authenticated insert for job_openings" on public.job_openings for
insert
    to authenticated
with
    check (true);

create policy "Allow authenticated update for job_openings" on public.job_openings for
update to authenticated using (true);

create policy "Allow authenticated delete for job_openings" on public.job_openings for delete to authenticated using (true);

-- MEMBER DIRECTORS POLICIES
create policy "Allow public read access for member_directors" on public.member_directors for
select using (true);

create policy "Allow authenticated insert for member_directors" on public.member_directors for
insert
    to authenticated
with
    check (true);

create policy "Allow authenticated update for member_directors" on public.member_directors for
update to authenticated using (true);

create policy "Allow authenticated delete for member_directors" on public.member_directors for delete to authenticated using (true);

-- ==========================================
-- 4. STORAGE SETUP (Profile Images)
-- ==========================================
-- Creates the bucket and sets up public read / authenticated upload policies

insert into
    storage.buckets (id, name, public)
values (
        'profile-images',
        'profile-images',
        true
    ) on conflict (id) do nothing;

create policy "Allow public read access for profile images" on storage.objects for
select using (bucket_id = 'profile-images');

create policy "Allow authenticated uploads for profile images" on storage.objects for
insert
    to authenticated
with
    check (bucket_id = 'profile-images');

create policy "Allow authenticated updates for profile images" on storage.objects for
update to authenticated using (bucket_id = 'profile-images');

create policy "Allow authenticated deletes for profile images" on storage.objects for delete to authenticated using (bucket_id = 'profile-images');