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
  linkedin_url text null,
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