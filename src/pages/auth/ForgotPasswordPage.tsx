import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });

    setStatus(
      error
        ? error.message
        : 'Si cet email existe, un lien de réinitialisation vient d\'être envoyé.',
    );
    setLoading(false);
  };

  return (
    <div className="auth-layout">
      <form className="card auth-card grid" onSubmit={onSubmit}>
        <h1>Mot de passe oublié</h1>
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
        {status && <p className="alert">{status}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Envoi...' : 'Envoyer le lien'}
        </button>
        <Link to="/auth/login">Retour à la connexion</Link>
      </form>
    </div>
  );
};
