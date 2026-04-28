import { Link, Outlet } from 'react-router-dom';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export const AppShell = () => {
  const user = useCurrentUser();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>PharmaGroup</h2>
        <p>{user.full_name}</p>
        <p className="badge">{user.role}</p>
        <nav>
          <Link to="/">Tableau de bord</Link>
          <Link to="/pharmacy/upload">Téléverser un BL</Link>
          <Link to="/admin/campaigns">Campagnes</Link>
          <Link to="/admin/review">Validation BL</Link>
          <Link to="/admin/groupage">Groupage & Export</Link>
        </nav>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
};
