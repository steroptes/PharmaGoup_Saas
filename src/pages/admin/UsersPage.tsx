import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';

type UserStatus = 'active' | 'pending' | 'banned';

type UserRow = {
  id: string;
  fullName: string;
  email: string;
  role: 'admin' | 'pharmacy_user';
  status: UserStatus;
  emailConfirmed: boolean;
  createdAt: string;
};

const USERS: UserRow[] = [
  {
    id: 'USR-1001',
    fullName: 'Amina El Fassi',
    email: 'amina@pharmagroup.ma',
    role: 'admin',
    status: 'active',
    emailConfirmed: true,
    createdAt: '2026-03-15',
  },
  {
    id: 'USR-1002',
    fullName: 'Pharmacie Centrale - Casablanca',
    email: 'contact@pharma-centrale.ma',
    role: 'pharmacy_user',
    status: 'pending',
    emailConfirmed: false,
    createdAt: '2026-04-27',
  },
  {
    id: 'USR-1003',
    fullName: 'Karim Benali',
    email: 'karim.benali@pharmagroup.ma',
    role: 'admin',
    status: 'active',
    emailConfirmed: true,
    createdAt: '2026-02-19',
  },
  {
    id: 'USR-1004',
    fullName: 'Pharmacie Al Amal',
    email: 'admin@alamal.ma',
    role: 'pharmacy_user',
    status: 'banned',
    emailConfirmed: true,
    createdAt: '2026-01-08',
  },
  {
    id: 'USR-1005',
    fullName: 'Nadia Ziani',
    email: 'nadia.ziani@pharmagroup.ma',
    role: 'admin',
    status: 'pending',
    emailConfirmed: false,
    createdAt: '2026-04-29',
  },
];

const badgeByStatus: Record<UserStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  banned: 'bg-red-50 text-red-700 border-red-200',
};

const labelByStatus: Record<UserStatus, string> = {
  active: 'Actif',
  pending: 'Demande en attente',
  banned: 'Banni',
};

export const UsersPage = () => {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRow['role']>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | UserStatus>('all');
  const [emailFilter, setEmailFilter] = useState<'all' | 'confirmed' | 'unconfirmed'>('all');

  const filteredUsers = useMemo(() => USERS.filter((user) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query
      || user.fullName.toLowerCase().includes(query)
      || user.email.toLowerCase().includes(query)
      || user.id.toLowerCase().includes(query);

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || user.status === statusFilter;
    const matchesEmail = emailFilter === 'all'
      || (emailFilter === 'confirmed' && user.emailConfirmed)
      || (emailFilter === 'unconfirmed' && !user.emailConfirmed);

    return matchesSearch && matchesRole && matchesStatus && matchesEmail;
  }), [search, roleFilter, statusFilter, emailFilter]);

  return (
    <div className="grid">
      <Card>
        <h1>Gestion des utilisateurs</h1>
        <p>
          Module réservé aux administrateurs: consultation, filtrage, recherche et actions de gestion des comptes.
        </p>
      </Card>

      <Card className="grid">
        <div className="grid-2">
          <label>
            Recherche
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, email ou identifiant..."
            />
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
            Statut du compte
            <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | UserStatus)}>
              <option value="all">Tous les statuts</option>
              <option value="pending">Demandes en attente</option>
              <option value="active">Comptes actifs</option>
              <option value="banned">Comptes bannis</option>
            </Select>
          </label>

          <label>
            Confirmation email
            <Select value={emailFilter} onChange={(event) => setEmailFilter(event.target.value as 'all' | 'confirmed' | 'unconfirmed')}>
              <option value="all">Tous</option>
              <option value="confirmed">Email confirmé</option>
              <option value="unconfirmed">Email non confirmé</option>
            </Select>
          </label>
        </div>
      </Card>

      <Card>
        <p>{filteredUsers.length} utilisateur(s) trouvé(s)</p>
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Utilisateur</TableHeaderCell>
              <TableHeaderCell>Rôle</TableHeaderCell>
              <TableHeaderCell>Statut</TableHeaderCell>
              <TableHeaderCell>Email</TableHeaderCell>
              <TableHeaderCell>Créé le</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <strong>{user.fullName}</strong>
                  <br />
                  <small>{user.email} · {user.id}</small>
                </TableCell>
                <TableCell>{user.role === 'admin' ? 'Admin' : 'Pharmacie'}</TableCell>
                <TableCell>
                  <Badge className={badgeByStatus[user.status]}>{labelByStatus[user.status]}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={user.emailConfirmed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'}>
                    {user.emailConfirmed ? 'Confirmé' : 'Non confirmé'}
                  </Badge>
                </TableCell>
                <TableCell>{user.createdAt}</TableCell>
                <TableCell>
                  <div className="actions">
                    <Button variant="secondary">Modifier</Button>
                    <Button variant="secondary">Relancer email</Button>
                    <Button variant="secondary">Réinit. mot de passe</Button>
                    <Button variant="danger">Bannir</Button>
                    <Button variant="danger">Supprimer</Button>
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
