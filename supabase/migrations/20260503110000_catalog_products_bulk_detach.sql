create or replace function public.catalog_products_bulk_detach(
  p_laboratory_id uuid,
  p_product_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count integer;
begin
  if coalesce(array_length(p_product_ids, 1), 0) = 0 then
    raise exception 'CATALOG_BULK_PRODUCTS_EMPTY: no product ids provided';
  end if;

  select count(*) into existing_count
  from public.managed_products p
  where p.id = any(p_product_ids)
    and p.laboratory_id = p_laboratory_id;

  if existing_count <> cardinality(p_product_ids) then
    raise exception 'CATALOG_BULK_PRODUCTS_NOT_FOUND: some products are missing for this laboratory';
  end if;

  update public.managed_products p
  set business_unit_id = null,
      group_brand_id = null
  where p.id = any(p_product_ids)
    and p.laboratory_id = p_laboratory_id;

  perform public.log_catalog_bulk_operation(
    'products.bulk_detach',
    p_laboratory_id,
    jsonb_build_object('product_count', cardinality(p_product_ids))
  );

  return jsonb_build_object('detached_count', cardinality(p_product_ids));
end;
$$;
