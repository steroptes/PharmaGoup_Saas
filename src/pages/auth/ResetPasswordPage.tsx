import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

const hasRecoveryToken = () => {
  const payload = `${window.location.search}${window.location.hash}`;
  return payload.includes('type=recovery')
    || payload.includes('access_token=')
    || payload.includes('refresh_token=')
    || payload.includes('token_hash=')
    || payload.includes('code=');
};

export const ResetPasswordPage = () => {
  const { session } = useAuth();
  const navigate = useNavigate();
  const canUpdatePassword = useMemo(() => Boolean(session?.user) || hasRecoveryToken(), [session]);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

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

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    setIsSuccess(true);
    setStatus('Mot de passe mis à jour avec succès. Déconnexion puis redirection vers la page de connexion...');
    setLoading(false);

    await supabase.auth.signOut();
    window.setTimeout(() => {
      navigate('/auth/login', { replace: true });
    }, 900);
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
        <button className="btn" type="submit" disabled={loading || isSuccess}>
          {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
        </button>
        <Link to="/auth/login">Retour à la connexion</Link>
      </form>
    </div>
  );
};
