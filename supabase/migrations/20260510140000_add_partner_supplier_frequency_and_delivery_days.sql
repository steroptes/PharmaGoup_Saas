do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'order_frequency'
  ) then
    create type public.order_frequency as enum ('daily', 'weekly', 'monthly', 'occasional');
  end if;
end $$;

alter table if exists public.pharmacy_partner_suppliers
  add column if not exists order_frequency public.order_frequency not null default 'occasional',
  add column if not exists delivery_weekdays smallint[] not null default '{}',
  add column if not exists delivery_month_days smallint[] not null default '{}';

create or replace function public.is_valid_weekdays(days smallint[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(d between 1 and 7), true)
  from unnest(days) as d;
$$;

create or replace function public.is_valid_month_days(days smallint[])
returns boolean
language sql
immutable
as $$
  select coalesce(bool_and(d between 1 and 31), true)
  from unnest(days) as d;
$$;

alter table if exists public.pharmacy_partner_suppliers
  drop constraint if exists pharmacy_partner_suppliers_delivery_weekdays_valid,
  drop constraint if exists pharmacy_partner_suppliers_delivery_month_days_valid;

alter table if exists public.pharmacy_partner_suppliers
  add constraint pharmacy_partner_suppliers_delivery_weekdays_valid
  check (public.is_valid_weekdays(delivery_weekdays));

alter table if exists public.pharmacy_partner_suppliers
  add constraint pharmacy_partner_suppliers_delivery_month_days_valid
  check (public.is_valid_month_days(delivery_month_days));
