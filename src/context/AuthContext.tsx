import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Role } from '@/types/domain';

export interface UserProfile {
  id: string;
  full_name: string;
  role: Role;
  pharmacy_id: string | null;
}

interface AuthContextValue {
  session: Session | null;
  profile: UserProfile | null;
  isLoading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const roleHomePath = (role: Role) => (role === 'admin' ? '/admin/campaigns' : '/pharmacy/campaigns');

const resolveRoleFromUser = (user: User): Role | null => {
  const metadataRole = user.user_metadata?.role ?? user.app_metadata?.role;
  return metadataRole === 'admin' || metadataRole === 'pharmacy_user' ? metadataRole : null;
};

const fallbackProfileFromUser = (user: User): UserProfile | null => {
  const role = resolveRoleFromUser(user);
  if (!role) return null;

  return {
    id: user.id,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? 'Utilisateur',
    role,
    pharmacy_id: (user.user_metadata?.pharmacy_id as string | undefined) ?? null,
  };
};

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = async (user: User) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, pharmacy_id')
      .eq('id', user.id)
      .limit(1);

    const profileRow = data?.[0] ?? null;

    if (error || !profileRow) {
      setProfile(fallbackProfileFromUser(user));
      return;
    }

    setProfile(profileRow);
  };

  const refreshProfile = async () => {
    const user = session?.user;
    if (!user) {
      setProfile(null);
      return;
    }

    await loadProfile(user);
  };

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);

      if (data.session?.user) {
        await loadProfile(data.session.user);
      }

      if (active) setIsLoading(false);
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      void loadProfile(nextSession.user).finally(() => setIsLoading(false));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      profile,
      isLoading,
      refreshProfile,
    }),
    [session, profile, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l\'intérieur de AuthProvider');
  }

  return context;
};
