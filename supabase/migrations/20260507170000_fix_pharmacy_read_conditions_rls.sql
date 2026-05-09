-- Fix pharmacy read policies for campaign configuration/conditions.
-- Symptom: pharmacy form shows "0 condition(s)" even when admin configured rules.

drop policy if exists "pharmacy read campaign_product_settings for accepted open campaigns" on public.campaign_product_settings;
drop policy if exists "pharmacy read campaign_product_arrangements for accepted open campaigns" on public.campaign_product_arrangements;
drop policy if exists "pharmacy read campaign_business_units for accepted open campaigns" on public.campaign_business_units;
drop policy if exists "pharmacy read campaign_group_brands for accepted open campaigns" on public.campaign_group_brands;
drop policy if exists "pharmacy read campaign_conditions for accepted open campaigns" on public.campaign_conditions;
drop policy if exists "pharmacy read campaign_bonifications for accepted open campaigns" on public.campaign_bonifications;

create policy "pharmacy read campaign_product_settings for accepted open campaigns"
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
        and cp.participation_status = 'accepted'
    )
  );

create policy "pharmacy read campaign_product_arrangements for accepted open campaigns"
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
        and cp.participation_status = 'accepted'
    )
  );

create policy "pharmacy read campaign_business_units for accepted open campaigns"
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
        and cp.participation_status = 'accepted'
    )
  );

create policy "pharmacy read campaign_group_brands for accepted open campaigns"
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
        and cp.participation_status = 'accepted'
    )
  );

create policy "pharmacy read campaign_conditions for accepted open campaigns"
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
        and cp.participation_status = 'accepted'
    )
  );

create policy "pharmacy read campaign_bonifications for accepted open campaigns"
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
        and cp.participation_status = 'accepted'
    )
  );
