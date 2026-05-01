do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'campaign_condition_kind') then
    create type public.campaign_condition_kind as enum (
      'product_min_qty',
      'product_max_qty',
      'product_modulo_qty',
      'product_min_pct_total',
      'product_max_pct_total',
      'group_min_amount',
      'group_max_amount',
      'group_min_pct_total',
      'group_max_pct_total',
      'business_unit_min_amount',
      'business_unit_max_amount',
      'business_unit_min_pct_total',
      'business_unit_max_pct_total',
      'campaign_min_amount',
      'campaign_max_amount'
    );
  end if;
end $$;

alter table public.campaign_conditions
  add column if not exists condition_kind public.campaign_condition_kind,
  add column if not exists reference_scope_type public.campaign_scope_type;

