do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'bonification_cash_mode') then
    create type public.bonification_cash_mode as enum ('transfer', 'check');
  end if;
end $$;

alter table public.campaign_bonifications
  add column if not exists cash_mode public.bonification_cash_mode;

alter table public.campaign_bonifications
  drop constraint if exists campaign_bonifications_cash_mode_check;

alter table public.campaign_bonifications
  add constraint campaign_bonifications_cash_mode_check
  check (
    (nature = 'cash' and cash_mode is not null)
    or (nature <> 'cash' and cash_mode is null)
  );
