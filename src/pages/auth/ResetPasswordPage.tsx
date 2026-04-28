import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const hasRecoveryToken = () => {
  const hash = window.location.hash;
  return hash.includes('type=recovery') || hash.includes('access_token=');
};

export const ResetPasswordPage = () => {
  const { session } = useAuth();
  const canUpdatePassword = useMemo(() => Boolean(session?.user) || hasRecoveryToken(), [session]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!canUpdatePassword) {
    return <Navigate to="/auth/forgot-password" replace />;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      setStatus('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    if (password !== confirmPassword) {
      setStatus('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setStatus(error ? error.message : 'Mot de passe mis à jour. Vous pouvez vous connecter.');
    setLoading(false);
  };

  return (
    <div className="auth-layout">
      <form className="card auth-card grid" onSubmit={onSubmit}>
        <h1>Nouveau mot de passe</h1>
        <label>
          Nouveau mot de passe
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label>
          Confirmer le mot de passe
          <input
            className="input"
            type="password"
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
        {status && <p className="alert">{status}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
        </button>
        <Link to="/auth/login">Retour à la connexion</Link>
      </form>
    </div>
  );
};
