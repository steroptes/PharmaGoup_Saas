alter table if exists public.campaign_phases
  add column if not exists allow_higher_than_intentions boolean not null default false;

comment on column public.campaign_phases.allow_higher_than_intentions is
  'Applique a la phase purchase_orders: autorise une quantite BC superieure aux quantites d intentions acceptees.';
