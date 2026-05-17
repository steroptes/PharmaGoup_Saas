import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth, roleHomePath } from '@/context/AuthContext';
import { HomePage } from '@/pages/HomePage';
import { CampaignsPortalPage } from '@/pages/pharmacy/CampaignsPortalPage';
import { PharmacyCampaignPhaseFormPage } from '@/pages/pharmacy/CampaignPhaseFormPage';
import { UploadPage } from '@/pages/pharmacy/UploadPage';
import { CorrectionPage } from '@/pages/pharmacy/CorrectionPage';
import { PharmacyProfilePage } from '@/pages/pharmacy/ProfilePage';
import { PharmacySettingsPage } from '@/pages/pharmacy/SettingsPage';
import { CampaignsPage } from '@/pages/admin/CampaignsPage';
import { CampaignSetupPage } from '@/pages/admin/CampaignSetupPage';
import { CampaignParticipationsPage } from '@/pages/admin/CampaignParticipationsPage';
import { ReviewPage } from '@/pages/admin/ReviewPage';
import { GroupagePage } from '@/pages/admin/GroupagePage';
import { SuppliersPage } from '@/pages/admin/SuppliersPage';
import { LaboratoriesPage } from '@/pages/admin/LaboratoriesPage';
import { ProductsPage } from '@/pages/admin/ProductsPage';
import { UsersPage } from '@/pages/admin/UsersPage';
import { ProfilePage } from '@/pages/admin/ProfilePage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { LoginPage } from '@/pages/auth/LoginPage';
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';
import { PharmacySignupPage } from '@/pages/auth/PharmacySignupPage';
import { AdminSignupPage } from '@/pages/auth/AdminSignupPage';

const FullPageLoader = () => <div className="auth-layout">Chargement de la session...</div>;
const isPasswordRecoveryFlow = (pathname: string, search: string, hash: string) => {
  if (pathname !== '/auth/reset-password') return false;

  // Keep reset-password route accessible in guest flow even when Supabase
  // has already consumed query/hash tokens and established a temporary session.
  const payload = `${search}${hash}`;
  return payload.length === 0
    || payload.includes('type=recovery')
    || payload.includes('access_token=')
    || payload.includes('refresh_token=')
    || payload.includes('token_hash=')
    || payload.includes('code=');
};


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
  const location = useLocation();

  if (isLoading) return <FullPageLoader />;

  if (isPasswordRecoveryFlow(location.pathname, location.search, location.hash)) {
    return <Outlet />;
  }

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
      <Route path="/auth/register/pharmacy" element={<PharmacySignupPage />} />
      <Route path="/auth/register/admin" element={<AdminSignupPage />} />
    </Route>

    <Route path="/auth/verify-email" element={<VerifyEmailPage />} />

    <Route element={<RequireAuth />}>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />

        <Route element={<RequireRole role="pharmacy_user" />}>
          <Route path="/pharmacy/campaigns" element={<CampaignsPortalPage />} />
          <Route path="/pharmacy/campaigns/:campaignId/form" element={<PharmacyCampaignPhaseFormPage />} />
          <Route path="/pharmacy/upload" element={<UploadPage />} />
          <Route path="/pharmacy/correction" element={<CorrectionPage />} />
          <Route path="/pharmacy/profile" element={<PharmacyProfilePage />} />
          <Route path="/pharmacy/settings" element={<PharmacySettingsPage />} />
        </Route>

        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin/campaigns" element={<CampaignsPage />} />
          <Route path="/admin/campaigns/:campaignId/setup" element={<CampaignSetupPage />} />
          <Route path="/admin/campaigns/:campaignId/participations" element={<CampaignParticipationsPage />} />
          <Route path="/admin/review" element={<ReviewPage />} />
          <Route path="/admin/groupage" element={<GroupagePage />} />
          <Route path="/admin/suppliers" element={<SuppliersPage />} />
          <Route path="/admin/laboratories" element={<LaboratoriesPage />} />
          <Route path="/admin/products" element={<ProductsPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
          <Route path="/admin/profile" element={<ProfilePage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
