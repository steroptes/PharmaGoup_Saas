import { supabase } from '@/lib/supabase';

export type SupplierNature = 'medicament' | 'para' | 'mixte';

export type Supplier = {
  id: string;
  name: string;
  address: string | null;
  mobile_phone: string | null;
  landline_phone: string | null;
  nature: SupplierNature;
  is_active: boolean;
  created_at: string;
};

export type SupplierInput = {
  name: string;
  address?: string;
  mobile_phone?: string;
  landline_phone?: string;
  nature: SupplierNature;
};

export type SupplierContact = {
  id: string;
  supplier_id: string;
  first_name: string;
  last_name: string;
  function_title: string | null;
  phone: string | null;
  created_at: string;
};

export type OrderFrequency = 'daily' | 'weekly' | 'monthly' | 'occasional';

export type PartnerSupplierSetting = {
  supplier_id: string;
  order_frequency: OrderFrequency;
  delivery_weekdays: number[];
  delivery_month_days: number[];
};

export const listSuppliers = async (): Promise<Supplier[]> => {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id, name, address, mobile_phone, landline_phone, nature, is_active, created_at')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Supplier[];
};

export const createSupplier = async (payload: SupplierInput): Promise<Supplier> => {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({
      name: payload.name.trim(),
      address: payload.address?.trim() || null,
      mobile_phone: payload.mobile_phone?.trim() || null,
      landline_phone: payload.landline_phone?.trim() || null,
      nature: payload.nature,
    })
    .select('id, name, address, mobile_phone, landline_phone, nature, is_active, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as Supplier;
};

export const updateSupplier = async (id: string, payload: SupplierInput): Promise<Supplier> => {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      name: payload.name.trim(),
      address: payload.address?.trim() || null,
      mobile_phone: payload.mobile_phone?.trim() || null,
      landline_phone: payload.landline_phone?.trim() || null,
      nature: payload.nature,
    })
    .eq('id', id)
    .select('id, name, address, mobile_phone, landline_phone, nature, is_active, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as Supplier;
};

export const deleteSupplier = async (id: string) => {
  const { error } = await supabase.from('suppliers').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const listSupplierContacts = async (supplierId: string): Promise<SupplierContact[]> => {
  const { data, error } = await supabase
    .from('supplier_contacts')
    .select('id, supplier_id, first_name, last_name, function_title, phone, created_at')
    .eq('supplier_id', supplierId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SupplierContact[];
};

export const createSupplierContact = async (payload: {
  supplier_id: string;
  first_name: string;
  last_name: string;
  function_title?: string;
  phone?: string;
}): Promise<SupplierContact> => {
  const { data, error } = await supabase
    .from('supplier_contacts')
    .insert({
      supplier_id: payload.supplier_id,
      first_name: payload.first_name.trim(),
      last_name: payload.last_name.trim(),
      function_title: payload.function_title?.trim() || null,
      phone: payload.phone?.trim() || null,
    })
    .select('id, supplier_id, first_name, last_name, function_title, phone, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data as SupplierContact;
};

export const deleteSupplierContact = async (id: string) => {
  const { error } = await supabase.from('supplier_contacts').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export const listMyPartnerSupplierIds = async (pharmacyId?: string | null): Promise<string[]> => {
  const settings = await listMyPartnerSupplierSettings(pharmacyId);
  return settings.map((item) => item.supplier_id);
};

export const listMyPartnerSupplierSettings = async (pharmacyId?: string | null): Promise<PartnerSupplierSetting[]> => {
  const { data: resolvedPharmacyId, error: pharmacyError } = pharmacyId
    ? ({ data: pharmacyId, error: null } as const)
    : await supabase.rpc('current_user_pharmacy_id');
  if (pharmacyError) throw new Error(pharmacyError.message);
  if (!resolvedPharmacyId) return [];

  const { data, error } = await supabase
    .from('pharmacy_partner_suppliers')
    .select('supplier_id, order_frequency, delivery_weekdays, delivery_month_days')
    .eq('pharmacy_id', resolvedPharmacyId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    supplier_id: row.supplier_id as string,
    order_frequency: (row.order_frequency as OrderFrequency | null) ?? 'occasional',
    delivery_weekdays: Array.isArray(row.delivery_weekdays) ? (row.delivery_weekdays as number[]) : [],
    delivery_month_days: Array.isArray(row.delivery_month_days) ? (row.delivery_month_days as number[]) : [],
  }));
};

export const replaceMyPartnerSuppliers = async (
  supplierIdsOrSettings: string[] | PartnerSupplierSetting[],
  pharmacyId?: string | null,
) => {
  const { data: resolvedPharmacyId, error: pharmacyError } = pharmacyId
    ? ({ data: pharmacyId, error: null } as const)
    : await supabase.rpc('current_user_pharmacy_id');
  if (pharmacyError) throw new Error(pharmacyError.message);
  if (!resolvedPharmacyId) throw new Error('Pharmacie introuvable.');

  const { error: deleteError } = await supabase
    .from('pharmacy_partner_suppliers')
    .delete()
    .eq('pharmacy_id', resolvedPharmacyId);
  if (deleteError) throw new Error(deleteError.message);

  const settings: PartnerSupplierSetting[] = (
    Array.isArray(supplierIdsOrSettings) && supplierIdsOrSettings.length > 0 && typeof supplierIdsOrSettings[0] === 'string'
      ? (supplierIdsOrSettings as string[]).map((supplierId) => ({
        supplier_id: supplierId,
        order_frequency: 'occasional',
        delivery_weekdays: [],
        delivery_month_days: [],
      }))
      : (supplierIdsOrSettings as PartnerSupplierSetting[])
  );

  if (!settings.length) return;

  const payload = settings.map((item) => ({
    pharmacy_id: resolvedPharmacyId,
    supplier_id: item.supplier_id,
    order_frequency: item.order_frequency,
    delivery_weekdays: item.order_frequency === 'weekly' ? Array.from(new Set(item.delivery_weekdays)).sort((a, b) => a - b) : [],
    delivery_month_days: item.order_frequency === 'monthly' ? Array.from(new Set(item.delivery_month_days)).sort((a, b) => a - b) : [],
  }));

  const { error: insertError } = await supabase
    .from('pharmacy_partner_suppliers')
    .insert(payload);
  if (insertError) throw new Error(insertError.message);
};
