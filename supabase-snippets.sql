-- ==========================================
-- EDITOR MANAGEMENT SNIPPETS
-- ==========================================
-- Save each block as a snippet in Supabase Dashboard -> SQL Editor.
-- Editors are the accounts allowed to change site content (see supabase-security.sql).
-- An account must exist under Authentication -> Users before it can be made an editor.


-- ------------------------------------------
-- LIST EDITORS
-- ------------------------------------------
select u.email, e.created_at as editor_since, u.last_sign_in_at
from public.editors e
join auth.users u on u.id = e.user_id
order by u.email;


-- ------------------------------------------
-- ADD EDITOR (change the email, then Run)
-- ------------------------------------------
do $$
declare
  target_email text := 'someone@example.edu';  -- change this
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(target_email));
  if uid is null then
    raise exception 'No account with email %. Create it first under Authentication -> Users.', target_email;
  end if;
  insert into public.editors (user_id) values (uid) on conflict (user_id) do nothing;
end $$;

select u.email, e.created_at as editor_since
from public.editors e join auth.users u on u.id = e.user_id
order by u.email;


-- ------------------------------------------
-- REMOVE EDITOR (change the email, then Run)
-- ------------------------------------------
-- Takes effect on their next save, even if they are still logged in.
-- Their login still exists; delete it under Authentication -> Users to remove it entirely.
do $$
declare
  target_email text := 'someone@example.edu';  -- change this
begin
  delete from public.editors e
  using auth.users u
  where u.id = e.user_id and lower(u.email) = lower(trim(target_email));
  if not found then
    raise exception '% is not an editor (check the spelling).', target_email;
  end if;
end $$;

select u.email, e.created_at as editor_since
from public.editors e join auth.users u on u.id = e.user_id
order by u.email;
