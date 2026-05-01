import { supabase } from '@/lib/supabase';

export type Pharmacy = {
  id: string;
  name: string;
  is_active: boolean;
};

const fromAdminUsersRpc = async (): Promise<Pharmacy[]> => {
  const { data, error } = await supabase.rpc('admin_list_users');
  if (error || !Array.isArray(data)) return [];

  const unique = new Map<string, Pharmacy>();
  for (const row of data) {
    if (row?.role !== 'pharmacy_user') continue;
    if (!row?.pharmacy_id || !row?.pharmacy_name) continue;
    unique.set(row.pharmacy_id, { id: row.pharmacy_id, name: row.pharmacy_name, is_active: true });
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
};

const fromPharmaciesTable = async (): Promise<Pharmacy[]> => {
  const { data, error } = await supabase
    .from('pharmacies')
    .select('id, name, is_active')
    .order('name', { ascending: true });

  if (error) return [];
  return (data ?? []) as Pharmacy[];
};

const fromProfilesJoin = async (): Promise<Pharmacy[]> => {
  const { data: profileRows, error } = await supabase
    .from('profiles')
    .select('pharmacy_id, pharmacies(id, name, is_active)')
    .eq('role', 'pharmacy_user')
    .not('pharmacy_id', 'is', null);

  if (error) return [];

  const unique = new Map<string, Pharmacy>();
  for (const row of profileRows ?? []) {
    const linked = Array.isArray(row.pharmacies) ? row.pharmacies[0] : row.pharmacies;
    if (!linked?.id || !linked?.name) continue;
    unique.set(linked.id, { id: linked.id, name: linked.name, is_active: linked.is_active ?? true });
  }
  return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
};

export const listPharmacies = async () => {
  const rpcRows = await fromAdminUsersRpc();
  if (rpcRows.length) return rpcRows;

  const tableRows = await fromPharmaciesTable();
  if (tableRows.length) return tableRows;

  const profileRows = await fromProfilesJoin();
  if (profileRows.length) return profileRows;

  return [];
};
