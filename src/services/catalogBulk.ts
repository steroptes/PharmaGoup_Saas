import { supabase } from '@/lib/supabase';

export interface BulkMoveProductsInput {
  laboratoryId: string;
  productIds: string[];
  targetBusinessUnitId?: string | null;
  targetGroupBrandId?: string | null;
}

export interface BulkDeleteProductsInput {
  laboratoryId: string;
  productIds: string[];
}

export interface BulkMoveGroupBrandsInput {
  laboratoryId: string;
  groupBrandIds: string[];
  targetBusinessUnitId: string;
}

export interface BulkDeleteGroupBrandsInput {
  laboratoryId: string;
  groupBrandIds: string[];
  mode: 'delete_with_products' | 'relocate_products';
  relocateToBusinessUnitId?: string | null;
  relocateToGroupBrandId?: string | null;
}

export const bulkMoveProducts = async (payload: BulkMoveProductsInput) => {
  const { data, error } = await supabase.rpc('catalog_products_bulk_move', {
    p_laboratory_id: payload.laboratoryId,
    p_product_ids: payload.productIds,
    p_target_business_unit_id: payload.targetBusinessUnitId ?? null,
    p_target_group_brand_id: payload.targetGroupBrandId ?? null,
  });
  if (error) throw error;
  return data as { moved_count: number };
};

export const bulkDeleteProducts = async (payload: BulkDeleteProductsInput) => {
  const { data, error } = await supabase.rpc('catalog_products_bulk_delete', {
    p_laboratory_id: payload.laboratoryId,
    p_product_ids: payload.productIds,
  });
  if (error) throw error;
  return data as { deleted_count: number };
};

export const bulkMoveGroupBrands = async (payload: BulkMoveGroupBrandsInput) => {
  const { data, error } = await supabase.rpc('catalog_group_brands_bulk_move', {
    p_laboratory_id: payload.laboratoryId,
    p_group_brand_ids: payload.groupBrandIds,
    p_target_business_unit_id: payload.targetBusinessUnitId,
  });
  if (error) throw error;
  return data as { moved_count: number };
};

export const bulkDeleteGroupBrands = async (payload: BulkDeleteGroupBrandsInput) => {
  const { data, error } = await supabase.rpc('catalog_group_brands_bulk_delete', {
    p_laboratory_id: payload.laboratoryId,
    p_group_brand_ids: payload.groupBrandIds,
    p_mode: payload.mode,
    p_relocate_to_business_unit_id: payload.relocateToBusinessUnitId ?? null,
    p_relocate_to_group_brand_id: payload.relocateToGroupBrandId ?? null,
  });
  if (error) throw error;
  return data as { deleted_group_brand_count: number; impacted_products_count: number };
};

export const deleteBusinessUnit = async (businessUnitId: string) => {
  const { error } = await supabase.rpc('delete_business_unit', { p_business_unit_id: businessUnitId });
  if (error) throw error;
};
