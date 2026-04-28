import { supabase } from '@/lib/supabase';

export interface Laboratory {
  id: string;
  designation: string;
  tax_identifier: string | null;
  address: string | null;
  mobile_phone: string | null;
  landline_phone: string | null;
  created_at: string;
}

export interface LaboratoryInput {
  designation: string;
  tax_identifier?: string;
  address?: string;
  mobile_phone?: string;
  landline_phone?: string;
}

export const listLaboratories = async () => {
  const { data, error } = await supabase
    .from('laboratories')
    .select('*')
    .order('designation', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Laboratory[];
};

export const createLaboratory = async (payload: LaboratoryInput) => {
  const { data, error } = await supabase
    .from('laboratories')
    .insert({
      designation: payload.designation,
      tax_identifier: payload.tax_identifier || null,
      address: payload.address || null,
      mobile_phone: payload.mobile_phone || null,
      landline_phone: payload.landline_phone || null,
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as Laboratory;
};

export const updateLaboratory = async (id: string, payload: LaboratoryInput) => {
  const { data, error } = await supabase
    .from('laboratories')
    .update({
      designation: payload.designation,
      tax_identifier: payload.tax_identifier || null,
      address: payload.address || null,
      mobile_phone: payload.mobile_phone || null,
      landline_phone: payload.landline_phone || null,
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return data as Laboratory;
};

export const deleteLaboratory = async (id: string) => {
  const { error } = await supabase.from('laboratories').delete().eq('id', id);
  if (error) throw error;
};
