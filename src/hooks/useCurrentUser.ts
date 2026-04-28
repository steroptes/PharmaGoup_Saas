import { useMemo } from 'react';
import type { Role } from '@/types/domain';

export const useCurrentUser = () => {
  // MVP: remplacer par un profil Supabase réel via useQuery.
  return useMemo(() => ({
    id: 'demo-user',
    full_name: 'Utilisateur Démo',
    role: 'admin' as Role,
    pharmacy_id: null as string | null,
  }), []);
};
