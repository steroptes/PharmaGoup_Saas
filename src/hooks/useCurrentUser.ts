import { useAuth } from '@/context/AuthContext';

export const useCurrentUser = () => {
  const { profile } = useAuth();
  return profile;
};
