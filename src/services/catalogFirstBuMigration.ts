import { supabase } from '@/lib/supabase';

export interface CreateBusinessUnitResult {
  status: 'created' | 'migration_required';
  business_unit?: { id: string; name: string };
  business_unit_draft?: { name: string };
  inventory?: {
    root_products: Array<{ id: string; designation: string }>;
    root_group_brands: Array<{ id: string; name: string; products: Array<{ id: string; designation: string }> }>;
    root_product_count: number;
    root_group_brand_count: number;
  };
}

export const createBusinessUnitOrRequireMigration = async (laboratoryId: string, name: string) => {
  const { data, error } = await supabase.rpc('create_business_unit_or_require_migration', {
    p_laboratory_id: laboratoryId,
    p_name: name,
  });
  if (error) throw error;
  return data as CreateBusinessUnitResult;
};

export const initFirstBuMigration = async (laboratoryId: string, businessUnitName: string) => {
  const { data, error } = await supabase.rpc('catalog_first_bu_migration_init', {
    p_laboratory_id: laboratoryId,
    p_business_unit_name: businessUnitName,
  });
  if (error) throw error;
  return data as { migration_id: string; business_unit_id: string; inventory: CreateBusinessUnitResult['inventory'] };
};

export const previewFirstBuMigration = async (laboratoryId: string, migrationId: string, plan: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc('catalog_first_bu_migration_preview', {
    p_laboratory_id: laboratoryId,
    p_migration_id: migrationId,
    p_plan: plan,
  });
  if (error) throw error;
  return data as { migration_id: string; business_unit_id: string; product_moves: number; group_brand_moves: number; status: 'preview_ready' };
};

export const commitFirstBuMigration = async (laboratoryId: string, migrationId: string, plan: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc('catalog_first_bu_migration_commit', {
    p_laboratory_id: laboratoryId,
    p_migration_id: migrationId,
    p_plan: plan,
  });
  if (error) throw error;
  return data as { status: 'committed'; migration_id: string; business_unit_id: string; moved_products: number; moved_group_brands: number; created_brands: number };
};

export const cancelFirstBuMigration = async (laboratoryId: string, migrationId: string) => {
  const { data, error } = await supabase.rpc('catalog_first_bu_migration_cancel', {
    p_laboratory_id: laboratoryId,
    p_migration_id: migrationId,
  });
  if (error) throw error;
  return data as { status: 'cancelled'; migration_id: string };
};
