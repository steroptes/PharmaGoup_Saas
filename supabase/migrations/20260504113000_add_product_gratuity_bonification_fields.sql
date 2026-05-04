alter table public.campaign_bonifications
  add column if not exists buy_qty_threshold integer,
  add column if not exists free_qty integer,
  add column if not exists is_repeatable boolean;

alter table public.campaign_bonifications
  drop constraint if exists campaign_bonifications_products_gratuity_check;

alter table public.campaign_bonifications
  add constraint campaign_bonifications_products_gratuity_check
  check (
    (
      nature = 'products'
      and buy_qty_threshold is not null and buy_qty_threshold > 0
      and free_qty is not null and free_qty > 0
      and is_repeatable is not null
    )
    or (
      nature <> 'products'
      and buy_qty_threshold is null
      and free_qty is null
      and is_repeatable is null
    )
  );
