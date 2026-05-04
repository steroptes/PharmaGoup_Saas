import { Link, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const AppShell = () => {
  const user = useCurrentUser();

  if (!user) {
    return null;
  }

  const isAdmin = user.role === 'admin';
  const roleLabel = isAdmin ? 'admin' : 'pharmacie';

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="grid" style={{ width: '100%' }}>
            <h2>PharmaGroup</h2>
            <div className="sidebar-user-row">
              <p>{user.full_name}</p>
              <Badge>{roleLabel}</Badge>
            </div>
          </div>
        </div>
        <nav>
          <Link to="/">Tableau de bord</Link>
          {!isAdmin && <Link to="/pharmacy/campaigns">Mes campagnes</Link>}
          {isAdmin && (
            <>
              <hr className="sidebar-divider" />
              <Link to="/admin/laboratories">Laboratoires</Link>
              <Link to="/admin/products">Produits</Link>
              <Link to="/admin/campaigns">Campagnes</Link>
              <Link to="/admin/review">Traitement BL</Link>
              <Link to="/admin/groupage">Groupage</Link>
              <hr className="sidebar-divider" />
              <Link to="/admin/users">Utilisateurs</Link>
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <hr className="sidebar-divider" />
          <Link to={isAdmin ? '/admin/profile' : '/pharmacy/profile'} className="sidebar-settings-link">
            Gestion du profil
          </Link>
          <hr className="sidebar-divider" />
          <Link to={isAdmin ? '/admin/settings' : '/pharmacy/settings'} className="sidebar-settings-link">
            Paramètres
          </Link>
          <Button
            variant="secondary"
            type="button"
            onClick={() => {
              void supabase.auth.signOut();
            }}
          >
            Se déconnecter
          </Button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
};
