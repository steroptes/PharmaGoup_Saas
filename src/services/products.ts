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
    .select('*, vat_rate:vat_rates(id, label, rate), laboratory:laboratories(id, designation)')
    .order('designation', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ManagedProduct[];
};

const normalizePayload = (payload: ManagedProductInput) => {
  const pctCode = payload.pct_code?.trim() || null;
  const hasExplicitBarcode = !!payload.barcode?.trim();
  const barcode = hasExplicitBarcode
    ? payload.barcode!.trim()
    : (pctCode || generateBarcode());

  return {
    designation: payload.designation.trim(),
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
    .select('*, vat_rate:vat_rates(id, label, rate), laboratory:laboratories(id, designation)')
    .single();

  if (error) throw error;
  return data as ManagedProduct;
};

export const updateManagedProduct = async (id: string, payload: ManagedProductInput) => {
  const { data, error } = await supabase
    .from('managed_products')
    .update(normalizePayload(payload))
    .eq('id', id)
    .select('*, vat_rate:vat_rates(id, label, rate), laboratory:laboratories(id, designation)')
    .single();

  if (error) throw error;
  return data as ManagedProduct;
};

export const setManagedProductArchived = async (id: string, archived: boolean) => {
  const { data, error } = await supabase
    .from('managed_products')
    .update({ is_active: !archived })
    .eq('id', id)
    .select('*, vat_rate:vat_rates(id, label, rate), laboratory:laboratories(id, designation)')
    .single();

  if (error) throw error;
  return data as ManagedProduct;
};

export const deleteManagedProduct = async (id: string) => {
  const { error } = await supabase.from('managed_products').delete().eq('id', id);
  if (error) throw error;
};
