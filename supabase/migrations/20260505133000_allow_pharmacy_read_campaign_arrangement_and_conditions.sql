do $$
begin
  if to_regprocedure('public.current_user_role()') is null then
    return;
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_product_settings' and policyname='pharmacy read campaign_product_settings for accepted open campaigns') then
    create policy "pharmacy read campaign_product_settings for accepted open campaigns"
      on public.campaign_product_settings
      for select
      using (
        public.current_user_role() = 'pharmacy_user'
        and exists (
          select 1
          from public.campaigns c
          join public.campaign_participants cp on cp.campaign_id = c.id
          where c.id = campaign_product_settings.campaign_id
            and c.status = 'open'
            and cp.pharmacy_id = public.current_user_pharmacy_id()
            and cp.participation_status = 'accepted'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_product_arrangements' and policyname='pharmacy read campaign_product_arrangements for accepted open campaigns') then
    create policy "pharmacy read campaign_product_arrangements for accepted open campaigns"
      on public.campaign_product_arrangements
      for select
      using (
        public.current_user_role() = 'pharmacy_user'
        and exists (
          select 1
          from public.campaigns c
          join public.campaign_participants cp on cp.campaign_id = c.id
          where c.id = campaign_product_arrangements.campaign_id
            and c.status = 'open'
            and cp.pharmacy_id = public.current_user_pharmacy_id()
            and cp.participation_status = 'accepted'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_business_units' and policyname='pharmacy read campaign_business_units for accepted open campaigns') then
    create policy "pharmacy read campaign_business_units for accepted open campaigns"
      on public.campaign_business_units
      for select
      using (
        public.current_user_role() = 'pharmacy_user'
        and exists (
          select 1
          from public.campaigns c
          join public.campaign_participants cp on cp.campaign_id = c.id
          where c.id = campaign_business_units.campaign_id
            and c.status = 'open'
            and cp.pharmacy_id = public.current_user_pharmacy_id()
            and cp.participation_status = 'accepted'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_group_brands' and policyname='pharmacy read campaign_group_brands for accepted open campaigns') then
    create policy "pharmacy read campaign_group_brands for accepted open campaigns"
      on public.campaign_group_brands
      for select
      using (
        public.current_user_role() = 'pharmacy_user'
        and exists (
          select 1
          from public.campaigns c
          join public.campaign_participants cp on cp.campaign_id = c.id
          where c.id = campaign_group_brands.campaign_id
            and c.status = 'open'
            and cp.pharmacy_id = public.current_user_pharmacy_id()
            and cp.participation_status = 'accepted'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_conditions' and policyname='pharmacy read campaign_conditions for accepted open campaigns') then
    create policy "pharmacy read campaign_conditions for accepted open campaigns"
      on public.campaign_conditions
      for select
      using (
        public.current_user_role() = 'pharmacy_user'
        and exists (
          select 1
          from public.campaigns c
          join public.campaign_participants cp on cp.campaign_id = c.id
          where c.id = campaign_conditions.campaign_id
            and c.status = 'open'
            and cp.pharmacy_id = public.current_user_pharmacy_id()
            and cp.participation_status = 'accepted'
        )
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_bonifications' and policyname='pharmacy read campaign_bonifications for accepted open campaigns') then
    create policy "pharmacy read campaign_bonifications for accepted open campaigns"
      on public.campaign_bonifications
      for select
      using (
        public.current_user_role() = 'pharmacy_user'
        and exists (
          select 1
          from public.campaigns c
          join public.campaign_participants cp on cp.campaign_id = c.id
          where c.id = campaign_bonifications.campaign_id
            and c.status = 'open'
            and cp.pharmacy_id = public.current_user_pharmacy_id()
            and cp.participation_status = 'accepted'
        )
      );
  end if;
end $$;
