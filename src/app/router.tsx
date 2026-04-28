import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { HomePage } from '@/pages/HomePage';
import { UploadPage } from '@/pages/pharmacy/UploadPage';
import { CorrectionPage } from '@/pages/pharmacy/CorrectionPage';
import { CampaignsPage } from '@/pages/admin/CampaignsPage';
import { ReviewPage } from '@/pages/admin/ReviewPage';
import { GroupagePage } from '@/pages/admin/GroupagePage';

export const AppRouter = () => (
  <Routes>
    <Route element={<AppShell />}>
      <Route path="/" element={<HomePage />} />
      <Route path="/pharmacy/upload" element={<UploadPage />} />
      <Route path="/pharmacy/correction" element={<CorrectionPage />} />
      <Route path="/admin/campaigns" element={<CampaignsPage />} />
      <Route path="/admin/review" element={<ReviewPage />} />
      <Route path="/admin/groupage" element={<GroupagePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes>
);
