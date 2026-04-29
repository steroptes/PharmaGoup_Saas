-- Normalize existing values before enforcing stricter uniqueness
update public.managed_products
set pct_code = nullif(trim(pct_code), ''),
    barcode = trim(barcode);

-- Case-insensitive uniqueness to prevent duplicates with different casing/spacing
create unique index if not exists managed_products_pct_code_ci_unique
  on public.managed_products (lower(pct_code))
  where pct_code is not null;

create unique index if not exists managed_products_barcode_ci_unique
  on public.managed_products (lower(barcode));
