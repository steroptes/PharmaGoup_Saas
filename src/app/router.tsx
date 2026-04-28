import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth, roleHomePath } from '@/context/AuthContext';
import { HomePage } from '@/pages/HomePage';
import { UploadPage } from '@/pages/pharmacy/UploadPage';
import { CorrectionPage } from '@/pages/pharmacy/CorrectionPage';
import { CampaignsPage } from '@/pages/admin/CampaignsPage';
import { ReviewPage } from '@/pages/admin/ReviewPage';
import { GroupagePage } from '@/pages/admin/GroupagePage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';

const FullPageLoader = () => <div className="auth-layout">Chargement de la session...</div>;

const RequireAuth = () => {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader />;
  if (!session) return <Navigate to="/auth/login" replace />;
  if (!session.user.email_confirmed_at) return <Navigate to="/auth/verify-email" replace />;
  if (!profile) return <Navigate to="/auth/login" replace />;

  return <Outlet />;
};

const RequireRole = ({ role }: { role: 'admin' | 'pharmacy_user' }) => {
  const { profile } = useAuth();

  if (!profile) return <Navigate to="/auth/login" replace />;
  if (profile.role !== role) return <Navigate to={roleHomePath(profile.role)} replace />;

  return <Outlet />;
};

const GuestOnly = () => {
  const { session, profile, isLoading } = useAuth();

  if (isLoading) return <FullPageLoader />;

  if (session && session.user.email_confirmed_at && profile) {
    return <Navigate to={roleHomePath(profile.role)} replace />;
  }

  return <Outlet />;
};

export const AppRouter = () => (
  <Routes>
    <Route element={<GuestOnly />}>
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
    </Route>

    <Route path="/auth/verify-email" element={<VerifyEmailPage />} />

    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />

        <Route element={<RequireRole role="pharmacy_user" />}>
          <Route path="/pharmacy/upload" element={<UploadPage />} />
          <Route path="/pharmacy/correction" element={<CorrectionPage />} />
        </Route>

        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin/campaigns" element={<CampaignsPage />} />
          <Route path="/admin/review" element={<ReviewPage />} />
          <Route path="/admin/groupage" element={<GroupagePage />} />
        </Route>
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
