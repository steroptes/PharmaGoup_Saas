import { useEffect, useMemo, useState } from 'react';
import { PostgrestError } from '@supabase/supabase-js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { supabase } from '@/lib/supabase';

type UserRow = {
  id: string;
  full_name: string;
  role: 'admin' | 'pharmacy_user';
  pharmacy_id: string | null;
  created_at: string;
  is_banned: boolean;
  pharmacies: { name: string | null }[] | null;
};

export const UsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRow['role']>('all');
  const [banFilter, setBanFilter] = useState<'all' | 'banned' | 'active'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setBanFilter('all');
  };

  const loadUsers = async () => {
    setIsLoading(true);
    setError(null);

    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, full_name, role, pharmacy_id, created_at, is_banned, pharmacies(name)')
      .order('created_at', { ascending: false });

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
    const roleName = user.role === 'admin' ? 'admin' : 'pharmacie';
    const pharmacyName = user.pharmacies?.[0]?.name?.toLowerCase() ?? '';
    const matchesSearch = !query
      || user.full_name.toLowerCase().includes(query)
      || user.id.toLowerCase().includes(query)
      || roleName.includes(query)
      || pharmacyName.includes(query);

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesBanStatus = banFilter === 'all'
      || (banFilter === 'banned' && user.is_banned)
      || (banFilter === 'active' && !user.is_banned);

    return matchesSearch && matchesRole && matchesBanStatus;
  }), [users, search, roleFilter, banFilter]);

  const toggleBan = async (user: UserRow) => {
    setActionMessage(null);
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ is_banned: !user.is_banned })
      .eq('id', user.id);

    if (updateError) {
      setActionMessage(`Erreur bannissement: ${(updateError as PostgrestError).message}`);
      return;
    }

    setActionMessage(`Compte ${user.full_name} ${user.is_banned ? 'débanni' : 'banni'} avec succès.`);
    await loadUsers();
  };

  const deleteUser = async (user: UserRow) => {
    setActionMessage(null);
    const { error: deleteError } = await supabase
      .from('profiles')
      .delete()
      .eq('id', user.id);

    if (deleteError) {
      setActionMessage(`Erreur suppression: ${(deleteError as PostgrestError).message}`);
      return;
    }

    setActionMessage(`Profil ${user.full_name} supprimé.`);
    await loadUsers();
  };

  return (
    <div className="grid">
      <Card>
        <h1>Gestion des utilisateurs</h1>
        <p>Module connecté à Supabase (table `profiles`) pour lister, filtrer et administrer les comptes.</p>
      </Card>

      <Card className="grid">
        <div className="grid-2">
          <label>
            Recherche
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, id, pharmacie..." />
          </label>

          <label>
            Rôle
            <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as 'all' | UserRow['role'])}>
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateurs</option>
              <option value="pharmacy_user">Utilisateurs pharmacie</option>
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
        {actionMessage && <div className="alert">{actionMessage}</div>}
        <p>{isLoading ? 'Chargement...' : `${filteredUsers.length} utilisateur(s) trouvé(s) sur ${users.length}`}</p>

        {!isLoading && !error && users.length > 0 && filteredUsers.length === 0 && (
          <div className="alert">
            Aucun résultat avec les filtres actuels. Vérifiez le filtre Rôle (actuellement: {roleFilter === 'all' ? 'Tous les rôles' : roleFilter}).
            <div style={{ marginTop: '0.5rem' }}>
              <Button variant="secondary" onClick={resetFilters}>Réinitialiser les filtres</Button>
            </div>
          </div>
        )}

        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Utilisateur</TableHeaderCell>
              <TableHeaderCell>Rôle</TableHeaderCell>
              <TableHeaderCell>Pharmacie</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Création</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <strong>{user.full_name}</strong>
                  <br />
                  <small>{user.id}</small>
                </TableCell>
                <TableCell>{user.role === 'admin' ? 'Admin' : 'Pharmacie'}</TableCell>
                <TableCell>{user.pharmacies?.[0]?.name ?? '—'}</TableCell>
                <TableCell>Stocké uniquement dans auth.users</TableCell>
                <TableCell>{new Date(user.created_at).toLocaleDateString('fr-FR')}</TableCell>
                <TableCell>
                  <Badge className={user.is_banned ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}>
                    {user.is_banned ? 'Banni' : 'Actif'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="actions">
                    <Button variant="secondary" disabled>Modifier</Button>
                    <Button variant="secondary" disabled>Relancer email</Button>
                    <Button variant="secondary" disabled>Réinit. mot de passe</Button>
                    <Button variant="danger" onClick={() => void toggleBan(user)}>{user.is_banned ? 'Débannir' : 'Bannir'}</Button>
                    <Button variant="danger" onClick={() => void deleteUser(user)}>Supprimer</Button>
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
