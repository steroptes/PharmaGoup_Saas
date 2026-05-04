create or replace function public.list_my_open_campaigns_v2()
returns table (
  campaign_id uuid,
  campaign_name text,
  campaign_status public.campaign_status,
  supplier_id uuid,
  start_date date,
  end_date date,
  participation_status public.campaign_participation_status,
  participation_decided_at timestamptz,
  enabled_phases public.campaign_phase_key[],
  phase_windows jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacy_id uuid;
begin
  select p.pharmacy_id
  into v_pharmacy_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if v_pharmacy_id is null then
    return;
  end if;

  return query
  select
    c.id as campaign_id,
    c.name as campaign_name,
    c.status as campaign_status,
    c.supplier_id,
    c.start_date,
    c.end_date,
    cp.participation_status,
    cp.participation_decided_at,
    coalesce(
      array_agg(ph.phase_key) filter (where ph.is_enabled is true),
      array[]::public.campaign_phase_key[]
    ) as enabled_phases,
    coalesce(
      jsonb_object_agg(
        ph.phase_key::text,
        jsonb_build_object(
          'has_period_limit', ph.has_period_limit,
          'start_date', ph.start_date,
          'end_date', ph.end_date
        )
      ) filter (where ph.is_enabled is true),
      '{}'::jsonb
    ) as phase_windows
  from public.campaign_participants cp
  join public.campaigns c on c.id = cp.campaign_id
  left join public.campaign_phases ph on ph.campaign_id = c.id
  where cp.pharmacy_id = v_pharmacy_id
    and c.status = 'open'
  group by
    c.id, c.name, c.status, c.supplier_id, c.start_date, c.end_date,
    cp.participation_status, cp.participation_decided_at
  order by c.start_date desc;
end;
$$;

grant execute on function public.list_my_open_campaigns_v2() to authenticated;
