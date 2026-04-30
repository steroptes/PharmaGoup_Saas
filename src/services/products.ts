import { supabase } from '@/lib/supabase';

export type ProductNature = 'medicament' | 'para';

export interface VatRate {
  id: string;
  label: string;
  rate: number;
  is_active: boolean;
}

export interface ManagedProduct {
  id: string;
  designation: string;
  nature: ProductNature;
  pct_code: string | null;
  barcode: string;
  purchase_unit_price_ht: number;
  vat_rate_id: string;
  laboratory_id: string;
  is_active: boolean;
  vat_rate?: Pick<VatRate, 'id' | 'label' | 'rate'>;
  laboratory?: { id: string; designation: string };
  created_at: string;
}

export interface ManagedProductInput {
  designation: string;
  nature: ProductNature;
  pct_code?: string;
  barcode?: string;
  purchase_unit_price_ht: number;
  vat_rate_id: string;
  laboratory_id: string;
}

const generateBarcode = () => `AUTO-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

export const listVatRates = async () => {
  const { data, error } = await supabase.from('vat_rates').select('*').eq('is_active', true).order('rate', { ascending: true });
  if (error) throw error;
  return (data ?? []) as VatRate[];
};

export const listManagedProducts = async () => {
  const { data, error } = await supabase
    .from('managed_products')
    .select('*')
    .order('designation', { ascending: true });

  if (error) throw error;
  const products = (data ?? []) as ManagedProduct[];
  if (!products.length) return [];

  const [vatRes, labsRes] = await Promise.all([
    supabase.from('vat_rates').select('id, label, rate'),
    supabase.from('laboratories').select('id, designation'),
  ]);
  if (vatRes.error) throw vatRes.error;
  if (labsRes.error) throw labsRes.error;

  const vatById = new Map((vatRes.data ?? []).map((v) => [v.id, v]));
  const labById = new Map((labsRes.data ?? []).map((l) => [l.id, l]));
  return products.map((product) => ({
    ...product,
    vat_rate: vatById.get(product.vat_rate_id),
    laboratory: labById.get(product.laboratory_id),
  }));
};

const normalizePayload = (payload: ManagedProductInput) => {
  const pctCode = payload.pct_code?.trim() || null;
  const hasExplicitBarcode = !!payload.barcode?.trim();
  const barcode = hasExplicitBarcode
    ? payload.barcode!.trim()
    : (pctCode || generateBarcode());

  return {
    designation: payload.designation.trim().toUpperCase(),
    nature: payload.nature,
    pct_code: pctCode,
    barcode,
    purchase_unit_price_ht: payload.purchase_unit_price_ht,
    vat_rate_id: payload.vat_rate_id,
    laboratory_id: payload.laboratory_id,
  };
};

export const createManagedProduct = async (payload: ManagedProductInput) => {
  const { data, error } = await supabase
    .from('managed_products')
    .insert(normalizePayload(payload))
    .select('*')
    .single();

  if (error) throw error;
  return data as ManagedProduct;
};

export const updateManagedProduct = async (id: string, payload: ManagedProductInput) => {
  const { data, error } = await supabase
    .from('managed_products')
    .update(normalizePayload(payload))
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as ManagedProduct;
};

export const setManagedProductArchived = async (id: string, archived: boolean) => {
  const { data, error } = await supabase
    .from('managed_products')
    .update({ is_active: !archived })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as ManagedProduct;
};

export const deleteManagedProduct = async (id: string) => {
  const { error } = await supabase.from('managed_products').delete().eq('id', id);
  if (error) throw error;
};
