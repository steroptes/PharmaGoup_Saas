create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  with role_sources as (
    select (
      select p.role::text
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ) as profile_role,
    auth.jwt() -> 'app_metadata' ->> 'role' as app_metadata_role,
    auth.jwt() -> 'user_metadata' ->> 'role' as user_metadata_role
  )
  select case
    when profile_role in ('admin', 'pharmacy_user') then profile_role::public.app_role
    when app_metadata_role in ('admin', 'pharmacy_user') then app_metadata_role::public.app_role
    when user_metadata_role in ('admin', 'pharmacy_user') then user_metadata_role::public.app_role
    else null
  end
  from role_sources;
$$;
