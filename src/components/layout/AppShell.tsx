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
        <div className="grid">
          <h2>PharmaGroup</h2>
          <p>{user.full_name}</p>
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
              <Link to="/admin/campaigns">Campagnes</Link>
              <Link to="/admin/review">Validation BL</Link>
              <Link to="/admin/groupage">Groupage & Export</Link>
            </>
          )}
        </nav>
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
