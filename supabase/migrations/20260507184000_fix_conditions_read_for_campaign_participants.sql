-- Relax pharmacy read scope for campaign conditions/config to campaign participants.
-- Keep write/submit guarded elsewhere.

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

drop policy if exists "pharmacy read campaign_product_settings for accepted open campaigns" on public.campaign_product_settings;
drop policy if exists "pharmacy read campaign_product_arrangements for accepted open campaigns" on public.campaign_product_arrangements;
drop policy if exists "pharmacy read campaign_business_units for accepted open campaigns" on public.campaign_business_units;
drop policy if exists "pharmacy read campaign_group_brands for accepted open campaigns" on public.campaign_group_brands;
drop policy if exists "pharmacy read campaign_conditions for accepted open campaigns" on public.campaign_conditions;
drop policy if exists "pharmacy read campaign_bonifications for accepted open campaigns" on public.campaign_bonifications;

drop policy if exists "pharmacy read campaign_product_settings for open participant campaigns" on public.campaign_product_settings;
drop policy if exists "pharmacy read campaign_product_arrangements for open participant campaigns" on public.campaign_product_arrangements;
drop policy if exists "pharmacy read campaign_business_units for open participant campaigns" on public.campaign_business_units;
drop policy if exists "pharmacy read campaign_group_brands for open participant campaigns" on public.campaign_group_brands;
drop policy if exists "pharmacy read campaign_conditions for open participant campaigns" on public.campaign_conditions;
drop policy if exists "pharmacy read campaign_bonifications for open participant campaigns" on public.campaign_bonifications;

create policy "pharmacy read campaign_product_settings for open participant campaigns"
  on public.campaign_product_settings
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      join public.campaign_participants cp on cp.campaign_id = c.id
      where c.id = campaign_product_settings.campaign_id
        and c.status = 'open'
        and cp.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy read campaign_product_arrangements for open participant campaigns"
  on public.campaign_product_arrangements
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      join public.campaign_participants cp on cp.campaign_id = c.id
      where c.id = campaign_product_arrangements.campaign_id
        and c.status = 'open'
        and cp.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy read campaign_business_units for open participant campaigns"
  on public.campaign_business_units
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      join public.campaign_participants cp on cp.campaign_id = c.id
      where c.id = campaign_business_units.campaign_id
        and c.status = 'open'
        and cp.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy read campaign_group_brands for open participant campaigns"
  on public.campaign_group_brands
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      join public.campaign_participants cp on cp.campaign_id = c.id
      where c.id = campaign_group_brands.campaign_id
        and c.status = 'open'
        and cp.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy read campaign_conditions for open participant campaigns"
  on public.campaign_conditions
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      join public.campaign_participants cp on cp.campaign_id = c.id
      where c.id = campaign_conditions.campaign_id
        and c.status = 'open'
        and cp.pharmacy_id = public.current_user_pharmacy_id()
    )
  );

create policy "pharmacy read campaign_bonifications for open participant campaigns"
  on public.campaign_bonifications
  for select
  using (
    exists (
      select 1
      from public.campaigns c
      join public.campaign_participants cp on cp.campaign_id = c.id
      where c.id = campaign_bonifications.campaign_id
        and c.status = 'open'
        and cp.pharmacy_id = public.current_user_pharmacy_id()
    )
  );
