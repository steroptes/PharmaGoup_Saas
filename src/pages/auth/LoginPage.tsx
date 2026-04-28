import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { roleHomePath, useAuth } from '@/context/AuthContext';

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
      setError(signInError.message);
      setLoading(false);
      return;
    }

    await refreshProfile();

    if (!data.user?.email_confirmed_at) {
      navigate('/auth/verify-email', { replace: true });
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (!profile) {
      setError('Profil introuvable. Contactez un administrateur.');
      setLoading(false);
      return;
    }

    navigate(roleHomePath(profile.role), { replace: true });
    setLoading(false);
  };

  return (
    <div className="auth-layout">
      <form className="card auth-card grid" onSubmit={onSubmit}>
        <h1>Connexion</h1>
        <label>
          Email
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Mot de passe
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="alert">{error}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>
        <Link to="/auth/forgot-password">Mot de passe oublié ?</Link>
      </form>
    </div>
  );
};
