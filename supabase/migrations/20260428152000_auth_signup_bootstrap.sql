-- Auto-bootstrap profile/pharmacy at signup using auth.users metadata
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_role public.app_role;
  requested_role text;
  profile_name text;
  pharmacy_name text;
  created_pharmacy_id uuid;
begin
  requested_role := lower(coalesce(new.raw_user_meta_data ->> 'role', 'pharmacy_user'));

  if requested_role = 'admin' then
    desired_role := 'admin';
  else
    desired_role := 'pharmacy_user';
  end if;
  profile_name := coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1));

  if desired_role = 'admin' then
    insert into public.profiles (id, full_name, role, pharmacy_id)
    values (new.id, profile_name, 'admin', null)
    on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, pharmacy_id = excluded.pharmacy_id;

    return new;
  end if;

  pharmacy_name := nullif(new.raw_user_meta_data ->> 'pharmacy_name', '');

  if pharmacy_name is null then
    raise exception 'Le nom de la pharmacie est requis pour les comptes pharmacie';
  end if;

  insert into public.pharmacies (name, email)
  values (pharmacy_name, new.email)
  returning id into created_pharmacy_id;

  insert into public.profiles (id, full_name, role, pharmacy_id)
  values (new.id, profile_name, 'pharmacy_user', created_pharmacy_id)
  on conflict (id) do update set full_name = excluded.full_name, role = excluded.role, pharmacy_id = excluded.pharmacy_id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user_signup();
