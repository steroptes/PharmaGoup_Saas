import { useEffect, useMemo, useState } from 'react';
import { PostgrestError } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';

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

export const UsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'pharmacy_user' | 'unknown'>('all');
  const [banFilter, setBanFilter] = useState<'all' | 'banned' | 'active'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase.rpc('admin_list_users');

    if (queryError) {
      setError(queryError.message);
      setUsers([]);
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
                  <br />
                  <small>{user.user_id}</small>
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
                  <div className="actions">
                    <Button variant="secondary" disabled={!user.email}>Relancer email</Button>
                    <Button variant="secondary" disabled={!user.email}>Réinit. mot de passe</Button>
                    <Button variant="danger" disabled={!user.role} onClick={() => void toggleBan(user)}>{user.is_banned ? 'Débannir' : 'Bannir'}</Button>
                    <Button variant="danger" disabled={!user.role} onClick={() => void deleteUser(user)}>Supprimer profil</Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};
