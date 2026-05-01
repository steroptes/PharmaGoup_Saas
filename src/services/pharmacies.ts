import { supabase } from '@/lib/supabase';

export type Pharmacy = {
  id: string;
  name: string;
  is_active: boolean;
};

export const listPharmacies = async () => {
  const { data, error } = await supabase
    .from('pharmacies')
    .select('id, name, is_active')
    .order('name', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Pharmacy[];
};
