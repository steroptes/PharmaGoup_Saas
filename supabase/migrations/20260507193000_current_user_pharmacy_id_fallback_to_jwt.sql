create or replace function public.current_user_pharmacy_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with pharmacy_sources as (
    select (
      select p.pharmacy_id
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ) as profile_pharmacy_id,
    nullif(auth.jwt() -> 'app_metadata' ->> 'pharmacy_id', '')::uuid as app_metadata_pharmacy_id,
    nullif(auth.jwt() -> 'user_metadata' ->> 'pharmacy_id', '')::uuid as user_metadata_pharmacy_id
  )
  select coalesce(profile_pharmacy_id, app_metadata_pharmacy_id, user_metadata_pharmacy_id)
  from pharmacy_sources;
$$;
