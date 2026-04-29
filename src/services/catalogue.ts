import { supabase } from '@/lib/supabase';

export interface CatalogProductNode { id: string; designation: string; nature: 'medicament' | 'para' }
export interface CatalogGroupBrandNode { id: string; name: string; products: CatalogProductNode[] }
export interface CatalogBusinessUnitNode {
  id: string;
  name: string;
  products: CatalogProductNode[];
  group_brands: CatalogGroupBrandNode[];
}

export interface LaboratoryCatalogTree {
  laboratory_id: string;
  business_units: CatalogBusinessUnitNode[];
  root_group_brands: CatalogGroupBrandNode[];
  root_products: CatalogProductNode[];
}

export const getLaboratoryCatalogTree = async (laboratoryId: string) => {
  const { data, error } = await supabase.rpc('get_laboratory_catalog_tree', { target_laboratory_id: laboratoryId });
  if (error) throw error;
  return data as LaboratoryCatalogTree;
};
