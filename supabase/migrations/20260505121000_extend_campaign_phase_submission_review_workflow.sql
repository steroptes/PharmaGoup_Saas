do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'campaign_phase_submission_status'
  ) then
    begin
      alter type public.campaign_phase_submission_status add value if not exists 'needs_correction';
    exception when duplicate_object then null;
    end;
    begin
      alter type public.campaign_phase_submission_status add value if not exists 'accepted';
    exception when duplicate_object then null;
    end;
  end if;
end $$;

alter table if exists public.campaign_phase_submissions
  add column if not exists admin_correction_note text,
  add column if not exists reviewed_at timestamptz;
