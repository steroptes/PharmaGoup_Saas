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

  if (!error && (data ?? []).length > 0) return (data ?? []) as Pharmacy[];

  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select('pharmacy_id, pharmacies(id, name, is_active)')
    .eq('role', 'pharmacy_user')
    .not('pharmacy_id', 'is', null);

  if (profileError) throw new Error(profileError.message);

  const unique = new Map<string, Pharmacy>();
  for (const row of profileRows ?? []) {
    const linked = Array.isArray(row.pharmacies) ? row.pharmacies[0] : row.pharmacies;
    if (!linked?.id || !linked?.name) continue;
    unique.set(linked.id, { id: linked.id, name: linked.name, is_active: linked.is_active ?? true });
  }

  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
};
