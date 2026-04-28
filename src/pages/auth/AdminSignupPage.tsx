import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export const AdminSignupPage = () => {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    if (password.length < 8) {
      setStatus('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
        data: {
          full_name: fullName,
          role: 'admin',
        },
      },
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    setStatus('Compte admin créé. Vérifiez votre email pour activer le compte.');
    setLoading(false);
    navigate('/auth/verify-email', { replace: true });
  };

  return (
    <div className="auth-layout">
      <form className="card auth-card grid" onSubmit={onSubmit}>
        <h1>Créer un compte admin</h1>
        <label>
          Nom complet
          <input className="input" required value={fullName} onChange={(event) => setFullName(event.target.value)} />
        </label>
        <label>
          Email
          <input className="input" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label>
          Mot de passe
          <input
            className="input"
            type="password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {status && <p className="alert">{status}</p>}
        <button className="btn" type="submit" disabled={loading}>
          {loading ? 'Création...' : 'Créer le compte admin'}
        </button>
        <Link to="/auth/login">Déjà inscrit ? Se connecter</Link>
      </form>
    </div>
  );
};
