-- Reliable pharmacy-side read path for campaign conditions
create or replace function public.get_my_campaign_conditions(
  p_campaign_id uuid
)
returns table (
  id uuid,
  scope_type public.campaign_scope_type,
  campaign_business_unit_id uuid,
  campaign_group_brand_id uuid,
  product_id uuid,
  phase public.campaign_condition_phase,
  condition_kind text,
  reference_scope_type public.campaign_scope_type,
  label text,
  operator text,
  target_value numeric,
  unit text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pharmacy_id uuid;
begin
  v_pharmacy_id := public.current_user_pharmacy_id();
  if v_pharmacy_id is null then
    raise exception 'FORBIDDEN:PHARMACY_NOT_FOUND';
  end if;

  if not exists (
    select 1
    from public.campaigns c
    join public.campaign_participants cp on cp.campaign_id = c.id
    where c.id = p_campaign_id
      and c.status = 'open'
      and cp.pharmacy_id = v_pharmacy_id
      and cp.participation_status = 'accepted'
  ) then
    raise exception 'FORBIDDEN:CAMPAIGN_NOT_ACCESSIBLE';
  end if;

  return query
  select
    cc.id,
    cc.scope_type,
    cc.campaign_business_unit_id,
    cc.campaign_group_brand_id,
    cc.product_id,
    cc.phase,
    cc.condition_kind,
    cc.reference_scope_type,
    cc.label,
    cc.operator,
    cc.target_value,
    cc.unit,
    cc.created_at
  from public.campaign_conditions cc
  where cc.campaign_id = p_campaign_id
  order by cc.created_at asc;
end;
$$;

grant execute on function public.get_my_campaign_conditions(uuid) to authenticated;
