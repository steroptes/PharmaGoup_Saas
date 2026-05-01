import { useEffect, useMemo, useState } from 'react';
import { PostgrestError } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';

type ToastMessage = { id: string; message: string };

type UserRow = {
  user_id: string;
  email: string | null;
  email_confirmed_at: string | null;
  created_at: string;
  full_name: string | null;
  role: 'admin' | 'pharmacy_user' | null;
  pharmacy_id: string | null;
  pharmacy_name: string | null;
  is_banned: boolean;
};


const mapProfilesToRows = (profiles: Array<{
  id: string;
  full_name: string;
  role: 'admin' | 'pharmacy_user';
  pharmacy_id: string | null;
  created_at: string;
  is_banned?: boolean | null;
  pharmacies: { name: string | null }[] | null;
}>): UserRow[] => profiles.map((profile) => ({
  user_id: profile.id,
  email: null,
  email_confirmed_at: null,
  created_at: profile.created_at,
  full_name: profile.full_name,
  role: profile.role,
  pharmacy_id: profile.pharmacy_id,
  pharmacy_name: profile.pharmacies?.[0]?.name ?? null,
  is_banned: Boolean(profile.is_banned),
}));

export const UsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pharmacy_user' | 'unknown'>('all');
  const [banFilter, setBanFilter] = useState<'all' | 'banned' | 'active'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);


  const showToast = (message: string) => {
    const toast = { id: `${Date.now()}-${Math.random()}`, message };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 3500);
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase.rpc('admin_list_users');

    if (queryError) {
      const rpcMissing = queryError.message.toLowerCase().includes('could not find the function public.admin_list_users');
      if (!rpcMissing) {
        setError(queryError.message);
        setUsers([]);
        setIsLoading(false);
        return;
      }

      const { data: profileRows, error: fallbackError } = await supabase
        .from('profiles')
        .select('id, full_name, role, pharmacy_id, created_at, is_banned, pharmacies(name)')
        .order('created_at', { ascending: false });

      if (fallbackError) {
        setError(`${queryError.message}. Fallback profiles échoué: ${fallbackError.message}`);
        setUsers([]);
        setIsLoading(false);
        return;
      }

      setError('Fonction RPC `admin_list_users` absente sur ce projet Supabase. Affichage en mode dégradé via `profiles` uniquement. Appliquez les migrations Supabase.');
      setUsers(mapProfilesToRows((profileRows ?? []) as Array<{
        id: string;
        full_name: string;
        role: 'admin' | 'pharmacy_user';
        pharmacy_id: string | null;
        created_at: string;
        is_banned?: boolean | null;
        pharmacies: { name: string | null }[] | null;
      }>));
      setIsLoading(false);
      return;
    }

    setUsers((data ?? []) as UserRow[]);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const query = search.trim().toLowerCase();
    const roleName = user.role ?? 'unknown';
    const matchesSearch = !query
      || (user.full_name ?? '').toLowerCase().includes(query)
      || (user.email ?? '').toLowerCase().includes(query)
      || user.user_id.toLowerCase().includes(query)
      || (user.pharmacy_name ?? '').toLowerCase().includes(query);

    const matchesRole = roleFilter === 'all'
      || (roleFilter === 'unknown' && !user.role)
      || user.role === roleFilter;
    const matchesBanStatus = banFilter === 'all'
      || (banFilter === 'banned' && user.is_banned)
      || (banFilter === 'active' && !user.is_banned);

    return matchesSearch && matchesRole && matchesBanStatus && !!roleName;
  }), [users, search, roleFilter, banFilter]);

  const toggleBan = async (user: UserRow) => {
    if (!user.role) return;

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_banned: !user.is_banned })
      .eq('id', user.user_id);

    if (!updateError) await loadUsers();
  };

  const deleteUser = async (user: UserRow) => {
    if (!user.role) return;

    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.user_id);

    if (!deleteError) await loadUsers();
  };


  const resendVerificationEmail = async (user: UserRow) => {
    if (!user.email) return;
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: user.email,
    });
    if (resendError) {
      setError(`Relance email échouée pour ${user.email}: ${resendError.message}`);
      return;
    }
    showToast(`Email de vérification renvoyé à ${user.email}.`);
  };

  const sendResetPasswordEmail = async (user: UserRow) => {
    if (!user.email) return;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (resetError) {
      setError(`Email de réinitialisation échoué pour ${user.email}: ${resetError.message}`);
      return;
    }
    showToast(`Email de réinitialisation envoyé à ${user.email}.`);
  };

  return (
    <div className="grid">
      <Card>
        <h1>Gestion des utilisateurs</h1>
        <p>Module connecté à Supabase via RPC `admin_list_users` (auth.users + profiles).</p>
      </Card>

      <Card className="grid">
        <div className="grid-2">
          <label>
            Recherche
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, email, id, pharmacie..." />
          </label>

          <label>
            Rôle
            <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | 'admin' | 'pharmacy_user' | 'unknown')}>
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateurs</option>
              <option value="pharmacy_user">Utilisateurs pharmacie</option>
              <option value="unknown">Sans profil</option>
            </Select>
          </label>

          <label>
            État du compte
            <Select value={banFilter} onChange={(event) => setBanFilter(event.target.value as 'all' | 'banned' | 'active')}>
              <option value="all">Tous</option>
              <option value="active">Actifs</option>
              <option value="banned">Bannis</option>
            </Select>
          </label>
        </div>
      </Card>

      <Card>
        {error && <div className="alert">Erreur chargement utilisateurs: {error}</div>}
        <p>{isLoading ? 'Chargement...' : `${filteredUsers.length} utilisateur(s) trouvé(s) sur ${users.length}`}</p>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Utilisateur</TableHeaderCell>
              <TableHeaderCell>Rôle</TableHeaderCell>
              <TableHeaderCell>Pharmacie</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Email confirmé</TableHeaderCell>
              <TableHeaderCell>Création</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.user_id}>
                <TableCell>
                  <strong>{user.full_name ?? 'Profil manquant'}</strong>

                </TableCell>
                <TableCell>{user.role === 'admin' ? 'Admin' : user.role === 'pharmacy_user' ? 'Pharmacie' : 'Sans profil'}</TableCell>
                <TableCell>{user.pharmacy_name ?? '—'}</TableCell>
                <TableCell>{user.email ?? '—'}</TableCell>
                <TableCell>{user.email_confirmed_at ? 'Oui' : 'Non'}</TableCell>
                <TableCell>{new Date(user.created_at).toLocaleDateString('fr-FR')}</TableCell>
                <TableCell>
                  <Badge className={user.is_banned ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                    {user.is_banned ? 'Banni' : 'Actif'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="actions user-actions">
                    <Button variant="secondary" disabled={!user.email} onClick={() => void resendVerificationEmail(user)}>Relancer email</Button>
                    <Button variant="secondary" disabled={!user.email} onClick={() => void sendResetPasswordEmail(user)}>Réinit. mot de passe</Button>
                    <Button variant="danger" disabled={!user.role} onClick={() => void toggleBan(user)}>{user.is_banned ? 'Débannir' : 'Bannir'}</Button>
                    <Button variant="danger" disabled={!user.role} onClick={() => void deleteUser(user)}>Supprimer profil</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="toast-stack">
        {toasts.map((toast) => (
          <Card key={toast.id} className="toast-success">{toast.message}</Card>
        ))}
      </div>
    </div>
  );
};
