import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

export const VerifyEmailPage = () => {
  const { session } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!session?.user) {
    return <Navigate to="/auth/login" replace />;
  }

  if (session.user.email_confirmed_at) {
    return <Navigate to="/" replace />;
  }

  const resend = async () => {
    if (!session.user.email) return;
    setLoading(true);

    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: session.user.email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    });

    setStatus(error ? error.message : 'Email de vérification renvoyé. Vérifiez votre boîte mail.');
    setLoading(false);
  };

  return (
    <div className="auth-layout">
      <div className="card auth-card grid">
        <h1>Vérification email</h1>
        <p>
          Votre adresse <strong>{session.user.email}</strong> n'est pas encore confirmée.
          Cliquez sur le lien reçu par email puis reconnectez-vous.
        </p>
        {status && <p className="alert">{status}</p>}
        <button className="btn" type="button" onClick={resend} disabled={loading}>
          {loading ? 'Envoi...' : 'Renvoyer le lien'}
        </button>
        <Link to="/auth/login">Retour à la connexion</Link>
      </div>
    </div>
  );
};
