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

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="grid">
            <h2>PharmaGroup</h2>
            <p>{user.full_name}</p>
          </div>
          <Badge>{user.role}</Badge>
        </div>
        <nav>
          <Link to="/">Tableau de bord</Link>
          {!isAdmin && (
            <>
              <Link to="/pharmacy/upload">Téléverser un BL</Link>
              <Link to="/pharmacy/correction">Correction OCR</Link>
            </>
          )}
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
              <Link to="/admin/profile">Gestion du profil</Link>
            </>
          )}
        </nav>
        {isAdmin && (
          <Link to="/admin/settings" className="sidebar-settings-link">
            Paramètres
          </Link>
        )}
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            void supabase.auth.signOut();
          }}
        >
          Se déconnecter
        </Button>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
};
