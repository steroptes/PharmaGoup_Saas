import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { roleHomePath, useAuth } from '@/context/AuthContext';

const resolveRoleFromMetadata = (metadata: unknown): 'admin' | 'pharmacy_user' | null => {
  if (
    metadata
    && typeof metadata === 'object'
    && 'role' in metadata
    && (metadata.role === 'admin' || metadata.role === 'pharmacy_user')
  ) {
    return metadata.role;
  }

  return null;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(
        signInError.message === 'Invalid login credentials'
          ? 'Identifiants invalides. Vérifiez email/mot de passe ou utilisez "Mot de passe oublié ?".'
          : signInError.message,
      );
      setLoading(false);
      return;
    }

    await refreshProfile();

    if (!data.user?.email_confirmed_at) {
      navigate('/auth/verify-email', { replace: true });
      setLoading(false);
      return;
    }

    let role = resolveRoleFromMetadata(data.user.user_metadata) ?? resolveRoleFromMetadata(data.user.app_metadata);

    if (!role) {
      const { data: dbProfiles } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .limit(1);

      const dbProfile = dbProfiles?.[0];

      if (dbProfile?.role === 'admin' || dbProfile?.role === 'pharmacy_user') {
        role = dbProfile.role;
      }
    }

    if (!role) {
      setError('Rôle utilisateur introuvable. Vérifiez que le profil existe dans public.profiles.');
      setLoading(false);
      return;
    }

    navigate(roleHomePath(role), { replace: true });
    setLoading(false);
  };

  return (
    <div className="auth-layout">
      <Card as="form" className="auth-card grid" onSubmit={onSubmit}>
        <h1>Connexion</h1>
        <label>
          Email
          <Input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mot de passe
          <Input
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <Button type="submit" disabled={loading}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </Button>
        <Link to="/auth/forgot-password">Mot de passe oublié ?</Link>
        <div className="auth-links">
          <Link to="/auth/register/pharmacy">Créer un compte pharmacie</Link>
          <Link to="/auth/register/admin">Créer un compte admin</Link>
        </div>
      </Card>
    </div>
  );
};
