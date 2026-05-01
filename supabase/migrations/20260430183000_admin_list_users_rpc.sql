create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  email text,
  email_confirmed_at timestamptz,
  created_at timestamptz,
  full_name text,
  role public.app_role,
  pharmacy_id uuid,
  pharmacy_name text,
  is_banned boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    u.id as user_id,
    u.email,
    u.email_confirmed_at,
    u.created_at,
    p.full_name,
    p.role,
    p.pharmacy_id,
    ph.name as pharmacy_name,
    coalesce(p.is_banned, false) as is_banned
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.pharmacies ph on ph.id = p.pharmacy_id
  where public.current_user_role() = 'admin'
  order by u.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;
