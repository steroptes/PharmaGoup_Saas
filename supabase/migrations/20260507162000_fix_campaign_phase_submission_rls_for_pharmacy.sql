-- Fix pharmacy submission RLS false negatives
-- 1) Accept legacy JWT role aliases (e.g. "pharmacy")
-- 2) Rebuild campaign phase submission policies to rely on pharmacy scope

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
    lower(auth.jwt() -> 'app_metadata' ->> 'role') as app_metadata_role,
    lower(auth.jwt() -> 'user_metadata' ->> 'role') as user_metadata_role
  )
  select case
    when profile_role in ('admin', 'pharmacy_user') then profile_role::public.app_role
    when app_metadata_role = 'admin' then 'admin'::public.app_role
    when app_metadata_role in ('pharmacy_user', 'pharmacy', 'pharmacie') then 'pharmacy_user'::public.app_role
    when user_metadata_role = 'admin' then 'admin'::public.app_role
    when user_metadata_role in ('pharmacy_user', 'pharmacy', 'pharmacie') then 'pharmacy_user'::public.app_role
    else null
  end
  from role_sources;
$$;

drop policy if exists "pharmacy own campaign_phase_submissions" on public.campaign_phase_submissions;
drop policy if exists "pharmacy insert own campaign_phase_submissions" on public.campaign_phase_submissions;
drop policy if exists "pharmacy update own campaign_phase_submissions" on public.campaign_phase_submissions;

create policy "pharmacy own campaign_phase_submissions" on public.campaign_phase_submissions
  for select using (
    pharmacy_id = public.current_user_pharmacy_id()
  );

create policy "pharmacy insert own campaign_phase_submissions" on public.campaign_phase_submissions
  for insert with check (
    pharmacy_id = public.current_user_pharmacy_id()
  );

create policy "pharmacy update own campaign_phase_submissions" on public.campaign_phase_submissions
  for update using (
    pharmacy_id = public.current_user_pharmacy_id()
  ) with check (
    pharmacy_id = public.current_user_pharmacy_id()
  );

drop policy if exists "pharmacy own campaign_phase_submission_lines" on public.campaign_phase_submission_lines;
drop policy if exists "pharmacy insert own campaign_phase_submission_lines" on public.campaign_phase_submission_lines;
drop policy if exists "pharmacy delete own campaign_phase_submission_lines" on public.campaign_phase_submission_lines;

create policy "pharmacy own campaign_phase_submission_lines" on public.campaign_phase_submission_lines
  for select using (
    exists (
      select 1
      from public.campaign_phase_submissions s
      where s.id = submission_id
        and s.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy insert own campaign_phase_submission_lines" on public.campaign_phase_submission_lines
  for insert with check (
    exists (
      select 1
      from public.campaign_phase_submissions s
      where s.id = submission_id
        and s.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy delete own campaign_phase_submission_lines" on public.campaign_phase_submission_lines
  for delete using (
    exists (
      select 1
      from public.campaign_phase_submissions s
      where s.id = submission_id
        and s.pharmacy_id = public.current_user_pharmacy_id()
    )
  );
