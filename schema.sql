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
  google_scholar_url text null,
  github_url text null,
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


create table public.member_directors (
    member_id uuid not null,
    director_id uuid not null,
    constraint member_directors_pkey primary key (member_id, director_id),
    constraint member_directors_director_id_fkey foreign KEY (director_id) references members (id) on delete CASCADE,
    constraint member_directors_member_id_fkey foreign KEY (member_id) references members (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_member_directors_director on public.member_directors using btree (director_id) TABLESPACE pg_default;

create index IF not exists idx_member_directors_member on public.member_directors using btree (member_id) TABLESPACE pg_default;