-- Auto-provisions profiles + user_roles on signup (the canonical Supabase pattern — a
-- security-definer trigger, not a client-side insert, since profiles/user_roles have no
-- INSERT policy for authenticated users).
--
-- Every self-serve signup in this app goes through /convite/:token (see accept_invite RPC),
-- so role is always 'student' here. An admin account has no self-signup path by design (spec
-- §1: professors are provisioned by the product owner) — create it via the Supabase Dashboard
-- (Authentication → Users → Add user), then run, with that user's UID:
--
--   insert into public.profiles (id, name, role) values ('<uid>', 'Diego Andrade', 'admin');
--   insert into public.user_roles (user_id, role) values ('<uid>', 'admin');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 'student');

  insert into public.user_roles (user_id, role)
  values (new.id, 'student');

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
