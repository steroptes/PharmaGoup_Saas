import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCheck, CheckCircle2, Eye, Mail, MessageCircle, MessageSquare, PencilLine, Printer, RotateCcw, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select as NativeSelect } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CampaignPhaseKey, getCampaignById, listCampaignBusinessUnits, listCampaignGroupBrands, listCampaignPhases } from '@/services/campaigns';
import { buildPurchaseOrderDispatchDocument, CampaignCorrectionItem, dispatchPurchaseOrderToSuppliers, getCampaignPhaseSubmissionDetail, listCampaignPhaseSubmissionSummaries, listCampaignSubmissionStatusesByPharmacy, listSubmissionSelectedSuppliers, listSubmissionSupplierOrderSummaries, listSubmissionSupplierReviews, markPurchaseOrderAsPassedByAdmin, reviewCampaignPhaseSubmission, reviewSubmissionSupplierOrder, saveCampaignPhaseCorrectionTracking, saveSubmissionSupplierCorrectionTracking, SubmissionSupplierOrderSummary, SubmissionSupplierReview } from '@/services/campaignParticipationForms';
import { blobToBase64, buildPurchaseOrderInvoicePdf, downloadBlob } from '@/utils/pdf';

const PHASE_OPTIONS: Array<{ key: CampaignPhaseKey; label: string }> = [
  { key: 'purchase_intentions', label: 'Intentions d\'achat' },
  { key: 'purchase_orders', label: 'Bons de commande' },
  { key: 'delivery_notes', label: 'Bons de livraison' },
];

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const formatDateTime = (value: string | null) => {
  if (!value) return 'Non soumise';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('fr-FR');
};
const statusLabel = (
  status: 'draft' | 'submitted' | 'needs_correction' | 'accepted',
  opts?: { allCorrectionsAccepted?: boolean },
) => {
  if (status === 'draft') return 'Brouillon';
  if (status === 'submitted') return 'Soumise';
  if (status === 'needs_correction' && opts?.allCorrectionsAccepted) return 'Rectification acceptee';
  if (status === 'needs_correction') return 'Rectification demandee';
  return 'Acceptee';
};
const statusToneClass = (
  status: 'draft' | 'submitted' | 'needs_correction' | 'accepted',
  opts?: { allCorrectionsAccepted?: boolean },
) => {
  if (status === 'accepted') return 'ok';
  if (status === 'needs_correction' && opts?.allCorrectionsAccepted) return 'ok';
  if (status === 'needs_correction') return 'warn';
  return '';
};
const statusLabelShort = (status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | undefined) => {
  if (status === 'accepted') return 'Acceptee';
  if (status === 'submitted') return 'Soumise';
  if (status === 'needs_correction') return 'Rectification';
  if (status === 'draft') return 'Brouillon';
  return 'Non soumise';
};
const supplierReviewStatusLabel = (status: 'draft' | 'submitted' | 'needs_correction' | 'accepted' | undefined) => {
  if (status === 'accepted') return 'Acceptee';
  if (status === 'needs_correction') return 'Rectification demandee';
  if (status === 'draft') return 'Brouillon';
  return 'Soumise';
};

export const CampaignParticipationsPage = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const phase = (searchParams.get('phase') as CampaignPhaseKey | null) ?? 'purchase_intentions';

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCampaignPhaseSubmissionSummaries>>>([]);
  const [phaseStatusesByPharmacy, setPhaseStatusesByPharmacy] = useState<Record<string, Partial<Record<CampaignPhaseKey, 'draft' | 'submitted' | 'needs_correction' | 'accepted'>>>>({});
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getCampaignPhaseSubmissionDetail>> | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [buNames, setBuNames] = useState<Map<string, string>>(new Map());
  const [groupNames, setGroupNames] = useState<Map<string, string>>(new Map());
  const [correctionItems, setCorrectionItems] = useState<CampaignCorrectionItem[]>([]);
  const [correctionScope, setCorrectionScope] = useState<'campaign' | 'business_unit' | 'group_brand' | 'product'>('campaign');
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState<string>('');
  const [selectedGroupBrand, setSelectedGroupBrand] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<string>('');
  const [correctionMessage, setCorrectionMessage] = useState('');
  const [isAddCorrectionModalOpen, setIsAddCorrectionModalOpen] = useState(false);
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [isSavingTracking, setIsSavingTracking] = useState(false);
  const [selectedSuppliers, setSelectedSuppliers] = useState<Array<{ supplier_id: string; supplier_name: string }>>([]);
  const [dispatchSupplierId, setDispatchSupplierId] = useState<string>('');
  const [dispatchChannel, setDispatchChannel] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [supplierOrderSummaries, setSupplierOrderSummaries] = useState<SubmissionSupplierOrderSummary[]>([]);
  const [supplierReviews, setSupplierReviews] = useState<SubmissionSupplierReview[]>([]);
  const [campaignIsMultiSupplier, setCampaignIsMultiSupplier] = useState(false);
  const [previewSupplierId, setPreviewSupplierId] = useState<string | null>(null);
  const [previewDocsBySupplierId, setPreviewDocsBySupplierId] = useState<Record<string, Awaited<ReturnType<typeof buildPurchaseOrderDispatchDocument>>>>({});
  const [detailReloadToken, setDetailReloadToken] = useState(0);
  const [pendingOpenSupplierId, setPendingOpenSupplierId] = useState<string | null>(null);
  const lastLoadedSubmissionIdRef = useRef<string | null>(null);
  const [isLoadingRectifMonitor, setIsLoadingRectifMonitor] = useState(false);
  const [rectifMonitorSupplierFilter, setRectifMonitorSupplierFilter] = useState<string>('all');
  const [rectifMonitorRows, setRectifMonitorRows] = useState<Array<{
    submission_id: string;
    pharmacy_name: string;
    supplier_id: string | null;
    supplier_name: string;
    unresolved_total: number;
    unresolved_product: number;
    unresolved_bu: number;
    unresolved_group: number;
    unresolved_campaign: number;
  }>>([]);
  const iconActionBtnStyle: React.CSSProperties = {
    width: 38,
    height: 38,
    padding: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const load = async () => {
    if (!campaignId) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const [data, statuses] = await Promise.all([
        listCampaignPhaseSubmissionSummaries(campaignId, phase),
        listCampaignSubmissionStatusesByPharmacy(campaignId),
      ]);
      setRows(data);
      setPhaseStatusesByPharmacy(statuses);
      setSelectedSubmissionId((current) => {
        if (current && data.some((row) => row.submission_id === current)) return current;
        return data[0]?.submission_id ?? null;
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Chargement impossible.');
      setRows([]);
      setPhaseStatusesByPharmacy({});
      setSelectedSubmissionId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [campaignId, phase]);
  useEffect(() => {
    const loadRectifMonitor = async () => {
      if (phase !== 'purchase_orders' || rows.length === 0) {
        setRectifMonitorRows([]);
        return;
      }
      setIsLoadingRectifMonitor(true);
      try {
        const monitorBatches = await Promise.all(
          rows.map(async (row) => {
            const [detailRow, supplierReviewsRows] = await Promise.all([
              getCampaignPhaseSubmissionDetail(row.submission_id),
              listSubmissionSupplierReviews(row.submission_id).catch(() => [] as SubmissionSupplierReview[]),
            ]);
            const globalItems = (detailRow.admin_correction_items ?? []).filter((item) => !item.resolved);
            const globalEntry = {
              submission_id: row.submission_id,
              pharmacy_name: row.pharmacy_name,
              supplier_id: null,
              supplier_name: 'General',
              unresolved_total: globalItems.length,
              unresolved_product: globalItems.filter((item) => item.scope_type === 'product').length,
              unresolved_bu: globalItems.filter((item) => item.scope_type === 'business_unit').length,
              unresolved_group: globalItems.filter((item) => item.scope_type === 'group_brand').length,
              unresolved_campaign: globalItems.filter((item) => item.scope_type === 'campaign').length,
            };
            const supplierEntries = supplierReviewsRows.map((review) => {
              const items = (review.correction_items ?? []).filter((item) => !item.resolved);
              return {
                submission_id: row.submission_id,
                pharmacy_name: row.pharmacy_name,
                supplier_id: review.supplier_id,
                supplier_name: review.supplier_name,
                unresolved_total: items.length,
                unresolved_product: items.filter((item) => item.scope_type === 'product').length,
                unresolved_bu: items.filter((item) => item.scope_type === 'business_unit').length,
                unresolved_group: items.filter((item) => item.scope_type === 'group_brand').length,
                unresolved_campaign: items.filter((item) => item.scope_type === 'campaign').length,
              };
            });
            return [globalEntry, ...supplierEntries];
          }),
        );
        setRectifMonitorRows(monitorBatches.flat().filter((entry) => entry.unresolved_total > 0));
      } finally {
        setIsLoadingRectifMonitor(false);
      }
    };
    void loadRectifMonitor();
  }, [phase, rows]);

  useEffect(() => {
    const loadCampaign = async () => {
      if (!campaignId) return;
      try {
        const [campaign, bus, groups, phases] = await Promise.all([
          getCampaignById(campaignId),
          listCampaignBusinessUnits(campaignId),
          listCampaignGroupBrands(campaignId),
          listCampaignPhases(campaignId),
        ]);
        setCampaignName(campaign.name);
        setBuNames(new Map(bus.map((bu) => [bu.id, bu.name])));
        setGroupNames(new Map(groups.map((group) => [group.id, group.name])));
        setCampaignIsMultiSupplier(Boolean(phases.find((item) => item.phase_key === 'purchase_orders')?.multi_supplier_enabled));
      } catch {
        setCampaignName(null);
        setBuNames(new Map());
        setGroupNames(new Map());
        setCampaignIsMultiSupplier(false);
      }
    };
    void loadCampaign();
  }, [campaignId]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedSubmissionId) {
        setDetail(null);
        return;
      }
      try {
        const isSubmissionChanged = lastLoadedSubmissionIdRef.current !== selectedSubmissionId;
        const payload = await getCampaignPhaseSubmissionDetail(selectedSubmissionId);
        setDetail(payload);
        setCorrectionItems(payload.admin_correction_items ?? []);
        const suppliers = await listSubmissionSelectedSuppliers(selectedSubmissionId);
        setSelectedSuppliers(suppliers);
        setDispatchSupplierId(suppliers[0]?.supplier_id ?? '');
        const summaries = await listSubmissionSupplierOrderSummaries(selectedSubmissionId);
        setSupplierOrderSummaries(summaries);
        setSupplierReviews(await listSubmissionSupplierReviews(selectedSubmissionId));
        if (isSubmissionChanged) {
          setPreviewDocsBySupplierId({});
          if (!pendingOpenSupplierId) setPreviewSupplierId(null);
        }
        setIsAddCorrectionModalOpen(false);
        setIsTrackingModalOpen(false);
        if (pendingOpenSupplierId && suppliers.some((item) => item.supplier_id === pendingOpenSupplierId)) {
          const doc = await buildPurchaseOrderDispatchDocument({
            submissionId: selectedSubmissionId,
            supplierId: pendingOpenSupplierId,
          });
          setPreviewDocsBySupplierId((current) => ({ ...current, [pendingOpenSupplierId]: doc }));
          setPreviewSupplierId(pendingOpenSupplierId);
          setPendingOpenSupplierId(null);
        }
        lastLoadedSubmissionIdRef.current = selectedSubmissionId;
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Detail indisponible.');
        setDetail(null);
        setCorrectionItems([]);
        setSelectedSuppliers([]);
        setDispatchSupplierId('');
        setSupplierOrderSummaries([]);
        setSupplierReviews([]);
        setPreviewSupplierId(null);
        setPreviewDocsBySupplierId({});
        setPendingOpenSupplierId(null);
      }
    };

    void loadDetail();
  }, [selectedSubmissionId, detailReloadToken]);

  useEffect(() => {
    if (!detail) return;
    const firstSection = detail.lines.find((line) => !!line.campaign_business_unit_id || !!line.campaign_group_brand_id);
    setSelectedBusinessUnit(firstSection?.campaign_business_unit_id ?? '');
    setSelectedGroupBrand(firstSection?.campaign_group_brand_id ?? '');
    setSelectedProduct(detail.lines[0]?.product_id ?? '');
  }, [detail]);
  const canReview = phase === 'purchase_intentions' || phase === 'purchase_orders';
  const isMultiSupplierSplitReview = phase === 'purchase_orders' && !!detail?.purchase_order_multi_supplier_enabled && selectedSuppliers.length > 1;
  const activeCorrectionSupplierId = phase === 'purchase_orders' && detail?.purchase_order_multi_supplier_enabled
    ? previewSupplierId
    : null;
  const activeCorrectionSupplierName = activeCorrectionSupplierId
    ? (selectedSuppliers.find((s) => s.supplier_id === activeCorrectionSupplierId)?.supplier_name ?? activeCorrectionSupplierId)
    : null;
  const resolveScopeItems = (
    supplierId: string | null,
    detailValue: Awaited<ReturnType<typeof getCampaignPhaseSubmissionDetail>> | null,
    reviewsValue: SubmissionSupplierReview[],
  ): CampaignCorrectionItem[] => {
    if (supplierId) return reviewsValue.find((item) => item.supplier_id === supplierId)?.correction_items ?? [];
    return detailValue?.admin_correction_items ?? [];
  };
  const canReviewCurrentSubmission = detail?.status === 'submitted' || detail?.status === 'needs_correction';
  const canUnfreezeCurrentSubmission = canReview && detail?.status === 'accepted';
  const unresolvedCorrectionsCount = correctionItems.filter((item) => !item.resolved).length;
  const linkedPurchaseOrderStatus = detail?.pharmacy_id
    ? phaseStatusesByPharmacy[detail.pharmacy_id]?.purchase_orders
    : undefined;
  const isUnfreezeBlockedByLinkedPurchaseOrder = phase === 'purchase_intentions'
    && detail?.status === 'accepted'
    && (linkedPurchaseOrderStatus === 'submitted' || linkedPurchaseOrderStatus === 'needs_correction' || linkedPurchaseOrderStatus === 'accepted');
  const unfreezeBlockedReason = isUnfreezeBlockedByLinkedPurchaseOrder
    ? 'Defige interdit: le BC est deja engage (soumis/rectification/accepte).'
    : '';
  const freezeToggleLabel = detail?.status === 'accepted' ? 'Rouvrir la soumission' : 'Bloquer soumission';
  const canFreezeCurrentSubmission = canReviewCurrentSubmission && unresolvedCorrectionsCount === 0;
  const freezeToggleDisabled = isReviewing
    || (detail?.status === 'accepted'
      ? (!canUnfreezeCurrentSubmission || isUnfreezeBlockedByLinkedPurchaseOrder)
      : !canFreezeCurrentSubmission);
  const freezeToggleTitle = detail?.status === 'accepted'
    ? unfreezeBlockedReason
    : unresolvedCorrectionsCount > 0
      ? `Blocage impossible: ${unresolvedCorrectionsCount} rectification(s) reste(nt) a verifier.`
      : '';

  const review = async (action: 'accept' | 'request_correction' | 'unfreeze') => {
    if (!selectedSubmissionId) return;
    const unresolvedCount = correctionItems.filter((item) => !item.resolved).length;
    if (action === 'accept' && unresolvedCount > 0) {
      setFeedback(`Acceptation impossible: ${unresolvedCount} rectification(s) reste(nt) a verifier.`);
      return;
    }
    setIsReviewing(true);
    setFeedback(null);
    try {
      if (action === 'request_correction' && phase === 'purchase_orders' && activeCorrectionSupplierId) {
        await reviewSubmissionSupplierOrder({
          submissionId: selectedSubmissionId,
          supplierId: activeCorrectionSupplierId,
          action: 'request_correction',
          note: reviewNote,
          correctionItems,
        });
      } else {
      await reviewCampaignPhaseSubmission({
        submissionId: selectedSubmissionId,
        action,
        note: reviewNote,
        correctionItems: action === 'request_correction' ? correctionItems : [],
      });
      }
      await load();
      const [freshDetail, freshReviews] = await Promise.all([
        getCampaignPhaseSubmissionDetail(selectedSubmissionId),
        listSubmissionSupplierReviews(selectedSubmissionId),
      ]);
      setDetail(freshDetail);
      setSupplierReviews(freshReviews);
      setCorrectionItems(resolveScopeItems(activeCorrectionSupplierId, freshDetail, freshReviews));
      setFeedback(
        action === 'accept'
          ? 'Soumission acceptee et figee.'
          : action === 'unfreeze'
            ? 'Soumission defigee: la pharmacie peut modifier et resoumettre.'
            : 'Rectification demandee.',
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setIsReviewing(false);
    }
  };

  const globalTotals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.qty += row.total_quantity;
      acc.amount += row.total_amount_ht;
      return acc;
    }, { qty: 0, amount: 0 });
  }, [rows]);
  const rectifMonitorSuppliers = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rectifMonitorRows) {
      if (!row.supplier_id) continue;
      map.set(row.supplier_id, row.supplier_name);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rectifMonitorRows]);
  const filteredRectifMonitorRows = useMemo(() => {
    if (rectifMonitorSupplierFilter === 'all') return rectifMonitorRows;
    if (rectifMonitorSupplierFilter === 'general') return rectifMonitorRows.filter((row) => row.supplier_id === null);
    return rectifMonitorRows.filter((row) => row.supplier_id === rectifMonitorSupplierFilter);
  }, [rectifMonitorRows, rectifMonitorSupplierFilter]);
  const trackingFilteredSupplierId = useMemo(() => {
    if (rectifMonitorSupplierFilter === 'all' || rectifMonitorSupplierFilter === 'general') return null;
    return rectifMonitorSupplierFilter;
  }, [rectifMonitorSupplierFilter]);
  const statusBreakdown = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc[row.status] += 1;
      return acc;
    }, {
      draft: 0,
      submitted: 0,
      needs_correction: 0,
      accepted: 0,
    } as Record<'draft' | 'submitted' | 'needs_correction' | 'accepted', number>);
  }, [rows]);
  const arrangedLines = useMemo(() => {
    if (!detail) return [] as Array<{ section: string; row: { product_id: string; product_name: string; campaign_business_unit_id: string | null; campaign_group_brand_id: string | null; quantity: number; unit_price_ht: number; line_total_ht: number }; supplier_qty: number; supplier_ht: number }>;
    const activePreviewDoc = previewSupplierId ? previewDocsBySupplierId[previewSupplierId] : null;
    const supplierQtyByProduct = new Map<string, number>();
    const supplierHtByProduct = new Map<string, number>();
    for (const line of activePreviewDoc?.lines ?? []) {
      supplierQtyByProduct.set(line.product_id, Number(line.quantity ?? 0));
      supplierHtByProduct.set(line.product_id, Number(line.line_total_ht ?? 0));
    }
    return detail.lines
      .map((row) => {
        const bu = row.campaign_business_unit_id ? (buNames.get(row.campaign_business_unit_id) ?? `BU ${row.campaign_business_unit_id.slice(0, 6)}`) : 'Hors BU';
        const group = row.campaign_group_brand_id ? (groupNames.get(row.campaign_group_brand_id) ?? `GROUP ${row.campaign_group_brand_id.slice(0, 6)}`) : 'Sans GROUP';
        return {
          section: `${bu} / ${group}`,
          row,
          supplier_qty: supplierQtyByProduct.get(row.product_id) ?? 0,
          supplier_ht: supplierHtByProduct.get(row.product_id) ?? 0,
        };
      })
      .sort((a, b) => a.section.localeCompare(b.section) || a.row.product_name.localeCompare(b.row.product_name));
  }, [detail, buNames, groupNames, previewSupplierId, previewDocsBySupplierId]);
  const allCorrectionsAcceptedForDetail = useMemo(() => {
    if (!detail) return false;
    if (detail.status !== 'needs_correction') return false;
    if (!detail.admin_correction_items.length) return false;
    return detail.admin_correction_items.every((item) => item.resolved);
  }, [detail]);
  const supplierAcceptanceProgress = useMemo(() => {
    if (phase !== 'purchase_orders') return null;
    const total = selectedSuppliers.length;
    if (!total) return null;
    const accepted = selectedSuppliers.reduce((count, supplier) => {
      const status = supplierReviews.find((review) => review.supplier_id === supplier.supplier_id)?.status ?? 'submitted';
      return count + (status === 'accepted' ? 1 : 0);
    }, 0);
    return { accepted, total };
  }, [phase, selectedSuppliers, supplierReviews]);
  const globalAcceptBlockedBySupplierReviews = !!supplierAcceptanceProgress && supplierAcceptanceProgress.accepted < supplierAcceptanceProgress.total;
  const sectionOptions = useMemo(() => {
    if (!detail) return [] as Array<{ key: string; label: string; buId: string | null; groupId: string | null }>;
    const unique = new Map<string, { key: string; label: string; buId: string | null; groupId: string | null }>();
    for (const line of detail.lines) {
      const buId = line.campaign_business_unit_id ?? null;
      const groupId = line.campaign_group_brand_id ?? null;
      const key = `${buId ?? ''}::${groupId ?? ''}`;
      if (unique.has(key)) continue;
      const buName = buId ? (buNames.get(buId) ?? 'BU') : 'Hors BU';
      const groupName = groupId ? (groupNames.get(groupId) ?? 'GROUP') : 'Sans GROUP';
      unique.set(key, { key, label: `${buName} / ${groupName}`, buId, groupId });
    }
    return Array.from(unique.values());
  }, [detail, buNames, groupNames]);
  const businessUnitOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const section of sectionOptions) {
      if (!section.buId) continue;
      unique.set(section.buId, buNames.get(section.buId) ?? 'BU');
    }
    return Array.from(unique.entries()).map(([id, label]) => ({ id, label }));
  }, [sectionOptions, buNames]);
  const groupOptions = useMemo(() => {
    const unique = new Map<string, { id: string; label: string; buId: string | null }>();
    for (const section of sectionOptions) {
      if (!section.groupId) continue;
      unique.set(section.groupId, { id: section.groupId, label: section.label, buId: section.buId });
    }
    return Array.from(unique.values());
  }, [sectionOptions]);
  const hasBusinessUnitScopes = businessUnitOptions.length > 0;
  const hasGroupScopes = groupOptions.length > 0;

  useEffect(() => {
    if (correctionScope === 'business_unit' && !hasBusinessUnitScopes) setCorrectionScope('campaign');
    if (correctionScope === 'group_brand' && !hasGroupScopes) setCorrectionScope('campaign');
  }, [correctionScope, hasBusinessUnitScopes, hasGroupScopes]);

  const addCorrectionItem = () => {
    const message = correctionMessage.trim();
    if (!message) return;
    if (!detail) return;

    let nextItems: CampaignCorrectionItem[] = correctionItems;
    if (correctionScope === 'campaign') {
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'campaign',
        campaign_business_unit_id: null,
        campaign_group_brand_id: null,
        product_id: null,
        message,
        resolved: false,
        resolved_at: null,
      }];
    } else if (correctionScope === 'business_unit') {
      const buId = selectedBusinessUnit || businessUnitOptions[0]?.id || null;
      if (!buId) return;
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'business_unit',
        campaign_business_unit_id: buId,
        campaign_group_brand_id: null,
        product_id: null,
        message,
        resolved: false,
        resolved_at: null,
      }];
    } else if (correctionScope === 'group_brand') {
      const group = groupOptions.find((item) => item.id === selectedGroupBrand) ?? groupOptions[0];
      if (!group) return;
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'group_brand',
        campaign_business_unit_id: group.buId,
        campaign_group_brand_id: group.id,
        product_id: null,
        message,
        resolved: false,
        resolved_at: null,
      }];
    } else {
      const product = detail.lines.find((line) => line.product_id === selectedProduct) ?? detail.lines[0];
      if (!product) return;
      nextItems = [...correctionItems, {
        id: `corr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        scope_type: 'product',
        campaign_business_unit_id: product.campaign_business_unit_id ?? null,
        campaign_group_brand_id: product.campaign_group_brand_id ?? null,
        product_id: product.product_id,
        message,
        resolved: false,
        resolved_at: null,
      }];
    }
    setCorrectionMessage('');
    setCorrectionItems(nextItems);
    setFeedback('Point ajoute en brouillon. Cliquez sur "Envoyer la demande de rectification" pour notifier le participant.');
    setIsAddCorrectionModalOpen(false);
  };
  const openCorrectionModalFor = (scope: 'campaign' | 'business_unit' | 'group_brand' | 'product', payload?: { buId?: string | null; groupId?: string | null; productId?: string | null }) => {
    setCorrectionScope(scope);
    if (scope === 'business_unit' && payload?.buId) setSelectedBusinessUnit(payload.buId);
    if (scope === 'group_brand' && payload?.groupId) setSelectedGroupBrand(payload.groupId);
    if (scope === 'product' && payload?.productId) setSelectedProduct(payload.productId);
    setIsAddCorrectionModalOpen(true);
  };

  const correctionItemLabel = (item: CampaignCorrectionItem) => {
    if (item.scope_type === 'campaign') return 'Campagne';
    if (item.scope_type === 'business_unit') {
      const buName = item.campaign_business_unit_id ? (buNames.get(item.campaign_business_unit_id) ?? 'BU') : 'Hors BU';
      return `Section BU: ${buName}`;
    }
    if (item.scope_type === 'group_brand') {
      const buName = item.campaign_business_unit_id ? (buNames.get(item.campaign_business_unit_id) ?? 'BU') : 'Hors BU';
      const groupName = item.campaign_group_brand_id ? (groupNames.get(item.campaign_group_brand_id) ?? 'GROUP') : 'Sans GROUP';
      return `Section GROUP: ${buName} / ${groupName}`;
    }
    const product = detail?.lines.find((line) => line.product_id === item.product_id);
    return `Produit: ${product?.product_name ?? item.product_id ?? 'N/A'}`;
  };
  const persistCorrectionTracking = async (items: CampaignCorrectionItem[], overrideSupplierId?: string | null) => {
    if (!detail) return;
    setIsSavingTracking(true);
    setFeedback(null);
    try {
      const modalTargetSupplierId = overrideSupplierId !== undefined
        ? overrideSupplierId
        : activeCorrectionSupplierId;
      if (phase === 'purchase_orders' && modalTargetSupplierId) {
        await saveSubmissionSupplierCorrectionTracking({
          submissionId: detail.submission_id,
          supplierId: modalTargetSupplierId,
          note: reviewNote,
          correctionItems: items,
        });
      } else {
        await saveCampaignPhaseCorrectionTracking({
          submissionId: detail.submission_id,
          note: reviewNote,
          correctionItems: items,
        });
      }
      const [freshDetail, freshReviews] = await Promise.all([
        getCampaignPhaseSubmissionDetail(detail.submission_id),
        listSubmissionSupplierReviews(detail.submission_id),
      ]);
      setDetail(freshDetail);
      setSupplierReviews(freshReviews);
      setCorrectionItems(resolveScopeItems(modalTargetSupplierId ?? activeCorrectionSupplierId, freshDetail, freshReviews));
      setFeedback('Suivi des rectifications mis a jour.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Sauvegarde du suivi impossible.');
    } finally {
      setIsSavingTracking(false);
    }
  };
  const dispatchAsAdmin = async (channel: 'email' | 'sms' | 'whatsapp') => {
    if (!detail) return;
    if (!dispatchSupplierId) {
      setFeedback('Choisissez un fournisseur concerne pour passer la commande.');
      return;
    }
    try {
      const supplier = selectedSuppliers.find((item) => item.supplier_id === dispatchSupplierId);
      if (!supplier) throw new Error('Fournisseur introuvable.');
      const doc = await buildPurchaseOrderDispatchDocument({
        submissionId: detail.submission_id,
        supplierId: supplier.supplier_id,
      });
      const pdfBlob = buildPurchaseOrderInvoicePdf({
        date: new Date().toLocaleDateString('fr-FR'),
        participant: doc.participant,
        laboratory_name: doc.laboratory_name,
        supplier_name: doc.supplier.name,
        lines: doc.lines,
        total_ht: doc.total_ht,
        total_tva: doc.total_tva,
        total_ttc: doc.total_ttc,
        dispatch_info: doc.last_dispatch ?? null,
      });
      const fileName = `BC_${doc.participant.name.replace(/\s+/g, '_')}_${doc.supplier.name.replace(/\s+/g, '_')}.pdf`;
      downloadBlob(pdfBlob, fileName);
      await dispatchPurchaseOrderToSuppliers({
        submissionId: detail.submission_id,
        supplierIds: [supplier.supplier_id],
        channel,
        attachment: {
          file_name: fileName,
          mime_type: 'application/pdf',
          base64: await blobToBase64(pdfBlob),
        },
      });
      setFeedback(`Commande envoyee (${channel}) au fournisseur ${supplier.supplier_name}.`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Envoi impossible.');
    }
  };

  const printPurchaseOrderPdf = async () => {
    if (!detail) return;
    if (!dispatchSupplierId) {
      setFeedback('Choisissez un fournisseur concerne pour imprimer le BC.');
      return;
    }
    const supplier = selectedSuppliers.find((item) => item.supplier_id === dispatchSupplierId);
    if (!supplier) return;
    const doc = await buildPurchaseOrderDispatchDocument({
      submissionId: detail.submission_id,
      supplierId: supplier.supplier_id,
    });
    const pdfBlob = buildPurchaseOrderInvoicePdf({
      date: new Date().toLocaleDateString('fr-FR'),
      participant: doc.participant,
      laboratory_name: doc.laboratory_name,
      supplier_name: doc.supplier.name,
      lines: doc.lines,
      total_ht: doc.total_ht,
      total_tva: doc.total_tva,
      total_ttc: doc.total_ttc,
      dispatch_info: doc.last_dispatch ?? null,
    });
    const fileName = `BC_${doc.participant.name.replace(/\s+/g, '_')}_${doc.supplier.name.replace(/\s+/g, '_')}.pdf`;
    downloadBlob(pdfBlob, fileName);
    setFeedback(`PDF du bon de commande genere pour ${supplier.supplier_name}.`);
  };
  const printPurchaseOrderPdfForSupplier = async (supplierId: string) => {
    if (!detail) return;
    const supplier = selectedSuppliers.find((item) => item.supplier_id === supplierId);
    if (!supplier) return;
    const doc = await buildPurchaseOrderDispatchDocument({
      submissionId: detail.submission_id,
      supplierId: supplier.supplier_id,
    });
    const pdfBlob = buildPurchaseOrderInvoicePdf({
      date: new Date().toLocaleDateString('fr-FR'),
      participant: doc.participant,
      laboratory_name: doc.laboratory_name,
      supplier_name: doc.supplier.name,
      lines: doc.lines,
      total_ht: doc.total_ht,
      total_tva: doc.total_tva,
      total_ttc: doc.total_ttc,
      dispatch_info: doc.last_dispatch ?? null,
    });
    const fileName = `BC_${doc.participant.name.replace(/\s+/g, '_')}_${doc.supplier.name.replace(/\s+/g, '_')}.pdf`;
    downloadBlob(pdfBlob, fileName);
    setFeedback(`PDF du bon de commande genere pour ${supplier.supplier_name}.`);
  };
  const toggleSupplierPreview = async (supplierId: string) => {
    if (!detail) return;
    if (previewSupplierId === supplierId) {
      setPreviewSupplierId(null);
      setCorrectionItems(detail.admin_correction_items ?? []);
      return;
    }
    if (!previewDocsBySupplierId[supplierId]) {
      const doc = await buildPurchaseOrderDispatchDocument({
        submissionId: detail.submission_id,
        supplierId,
      });
      setPreviewDocsBySupplierId((current) => ({ ...current, [supplierId]: doc }));
    }
    setPreviewSupplierId(supplierId);
  };
  useEffect(() => {
    if (!detail) return;
    setCorrectionItems(resolveScopeItems(activeCorrectionSupplierId, detail, supplierReviews));
  }, [activeCorrectionSupplierId, detail, supplierReviews]);
  const trackingDisplayedItems = useMemo(() => {
    if (!isTrackingModalOpen || !detail) return correctionItems;
    if (rectifMonitorSupplierFilter === 'all') {
      return [
        ...(detail.admin_correction_items ?? []),
        ...supplierReviews.flatMap((item) => item.correction_items ?? []),
      ];
    }
    if (rectifMonitorSupplierFilter === 'general') return detail.admin_correction_items ?? [];
    return supplierReviews.find((item) => item.supplier_id === rectifMonitorSupplierFilter)?.correction_items ?? [];
  }, [correctionItems, detail, isTrackingModalOpen, rectifMonitorSupplierFilter, supplierReviews]);
  const reviewSupplier = async (supplierId: string, action: 'accept' | 'request_correction' | 'reset_to_submitted') => {
    if (!detail) return;
    try {
      await reviewSubmissionSupplierOrder({
        submissionId: detail.submission_id,
        supplierId,
        action,
        note: reviewNote,
        correctionItems: action === 'request_correction' ? correctionItems : undefined,
      });
      setSupplierReviews(await listSubmissionSupplierReviews(detail.submission_id));
      const updated = await getCampaignPhaseSubmissionDetail(detail.submission_id);
      setDetail(updated);
      setFeedback(action === 'accept' ? 'Sous-commande acceptee.' : action === 'request_correction' ? 'Rectification demandee pour la sous-commande.' : 'Sous-commande remise en soumise.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Action fournisseur impossible.');
    }
  };
  const markAsPassedByAdmin = async () => {
    if (!detail || !dispatchSupplierId) return;
    try {
      await markPurchaseOrderAsPassedByAdmin({
        submissionId: detail.submission_id,
        supplierId: dispatchSupplierId,
        channel: dispatchChannel,
      });
      setFeedback(`Commande marquee comme passee (${dispatchChannel}).`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Operation impossible.');
    }
  };

  return (
    <TooltipProvider delayDuration={120}>
    <div className="grid">
      <Card className="phase-hero">
        <div className="toolbar">
          <div>
            <h1>Pilotage des participations</h1>
            <p>Suivi des formulaires participants et totaux consolides.</p>
            {campaignName && (
              <p style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>{campaignName}</p>
            )}
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Retour campagnes</Button>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <NativeSelect value={phase} onChange={(event) => setSearchParams({ phase: event.target.value })}>
            {PHASE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </NativeSelect>
          <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Total campagne phase: {globalTotals.qty} U - {money(globalTotals.amount)} HT</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {phase === 'purchase_orders' && campaignIsMultiSupplier && (
            <span className="status-pill ok">Mode multi-fournisseurs</span>
          )}
          <span className="status-pill">{statusBreakdown.submitted} soumise(s)</span>
          <span className="status-pill warn">{statusBreakdown.needs_correction} rectification(s)</span>
          <span className="status-pill ok">{statusBreakdown.accepted} acceptee(s)</span>
          <span className="status-pill">{statusBreakdown.draft} brouillon(s)</span>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}
      {isLoading && <Card><p style={{ margin: 0 }}>Chargement...</p></Card>}

      {!isLoading && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <h2>Participants</h2>
            <div className="grid" style={{ gap: 8 }}>
              {rows.length === 0 && <p style={{ margin: 0 }}>Aucune soumission pour cette phase.</p>}
              {rows.map((row) => (
                <button
                  key={row.submission_id}
                  type="button"
                  onClick={() => setSelectedSubmissionId(row.submission_id)}
                  style={{
                    textAlign: 'left',
                    border: selectedSubmissionId === row.submission_id ? '1px solid #18181b' : '1px solid #e4e4e7',
                    background: '#fff',
                    borderRadius: 10,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <div className="toolbar" style={{ alignItems: 'flex-start' }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{row.pharmacy_name}</p>
                    <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {phase === 'purchase_orders' && campaignIsMultiSupplier && <span className="status-pill ok">BC multi</span>}
                      <span className={`status-pill ${statusToneClass(row.status)}`}>{statusLabel(row.status)}</span>
                    </div>
                  </div>
                  <p style={{ margin: '4px 0 0 0', color: '#475467', fontSize: 13 }}>{row.total_quantity} U - {money(row.total_amount_ht)} HT</p>
                  <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12, display: 'inline-flex', flexWrap: 'wrap', gap: 10 }}>
                    <span>Intentions: {statusLabelShort(phaseStatusesByPharmacy[row.pharmacy_id]?.purchase_intentions)}</span>
                    <span>BC: {statusLabelShort(phaseStatusesByPharmacy[row.pharmacy_id]?.purchase_orders)}</span>
                    <span>BL: {statusLabelShort(phaseStatusesByPharmacy[row.pharmacy_id]?.delivery_notes)}</span>
                  </p>
                  <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12 }}>Derniere soumission: {formatDateTime(row.submitted_at)}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2>Detail formulaire</h2>
            {!detail && <p style={{ margin: 0 }}>Selectionnez une soumission.</p>}
            {detail && (
              <div className="grid" style={{ gap: 8 }}>
                <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{detail.pharmacy_name}</strong>
                  <span className={`status-pill ${statusToneClass(detail.status, { allCorrectionsAccepted: allCorrectionsAcceptedForDetail })}`}>
                    {statusLabel(detail.status, { allCorrectionsAccepted: allCorrectionsAcceptedForDetail })}
                  </span>
                </p>
                <p style={{ margin: 0 }}>Total: {detail.total_quantity} U - {money(detail.total_amount_ht)} HT</p>
                {phase === 'purchase_orders' && detail.purchase_order_order_placement_mode === 'participant_choice' && (
                  <p style={{ margin: 0, fontSize: 12, color: '#475467' }}>
                    Choix participant: {detail.purchase_order_delegate_to_admin ? 'delegue a l administrateur' : 'garde la main'}
                  </p>
                )}
                {phase === 'purchase_orders' && (
                  <p style={{ margin: 0, fontSize: 12, color: detail.purchase_order_multi_supplier_enabled ? '#166534' : '#475467' }}>
                    Mode BC: {detail.purchase_order_multi_supplier_enabled ? 'Multi-fournisseurs' : 'Mono-fournisseur'}
                  </p>
                )}
                {phase === 'purchase_orders' && detail.purchase_order_multi_supplier_enabled && supplierOrderSummaries.length > 0 && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#334155', fontWeight: 600 }}>
                      Visualisation des sous-commandes par fournisseur
                    </p>
                    {supplierOrderSummaries.map((summary) => (
                      <div key={summary.supplier_id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <p style={{ margin: 0, fontSize: 12, color: '#334155' }}>
                            <strong>{summary.supplier_name}</strong> - {summary.lines_count} ligne(s) - {money(summary.total_ht)} HT - {money(summary.total_ttc)} TTC
                          </p>
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            {(() => {
                              const review = supplierReviews.find((item) => item.supplier_id === summary.supplier_id);
                              const status = review?.status ?? 'submitted';
                              return <span className={`status-pill ${status === 'accepted' ? 'ok' : status === 'needs_correction' ? 'warn' : ''}`}>Statut fournisseur: {supplierReviewStatusLabel(status)}</span>;
                            })()}
                          </div>
                        </div>
                        <div style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                          <div className="supplier-action-stack">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" title="Accepter le sous-BC" variant="secondary" className="supplier-action-icon-btn" style={iconActionBtnStyle} onClick={() => void reviewSupplier(summary.supplier_id, 'accept')}>
                                  <CheckCircle2 size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Accepter le sous-BC</TooltipContent>
                            </Tooltip>
                            <span className="supplier-action-label">Accepter</span>
                          </div>
                          <div className="supplier-action-stack">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" title="Demander rectification" variant="secondary" className="supplier-action-icon-btn" style={iconActionBtnStyle} onClick={() => void reviewSupplier(summary.supplier_id, 'request_correction')}>
                                  <PencilLine size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Envoyer la demande de rectification</TooltipContent>
                            </Tooltip>
                            <span className="supplier-action-label">Rectifier</span>
                          </div>
                          <div className="supplier-action-stack">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" title="Remettre en attente de revue" variant="secondary" className="supplier-action-icon-btn" style={iconActionBtnStyle} onClick={() => void reviewSupplier(summary.supplier_id, 'reset_to_submitted')}>
                                  <Undo2 size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Remettre en attente de revue</TooltipContent>
                            </Tooltip>
                            <span className="supplier-action-label">Revoir</span>
                          </div>
                          <div className="supplier-action-stack">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" title={previewSupplierId === summary.supplier_id ? 'Revenir aux quantites totales' : 'Visualiser la commande'} variant="secondary" className="supplier-action-icon-btn" style={iconActionBtnStyle} onClick={() => void toggleSupplierPreview(summary.supplier_id)}>
                                  {previewSupplierId === summary.supplier_id ? <RotateCcw size={16} /> : <Eye size={16} />}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {previewSupplierId === summary.supplier_id ? 'Revenir aux quantites totales' : 'Visualiser la commande'}
                              </TooltipContent>
                            </Tooltip>
                            <span className="supplier-action-label">Visualiser</span>
                          </div>
                          <div className="supplier-action-stack">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" title="Imprimer BC (PDF)" variant="secondary" className="supplier-action-icon-btn" style={iconActionBtnStyle} onClick={() => void printPurchaseOrderPdfForSupplier(summary.supplier_id)}>
                                  <Printer size={16} />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Imprimer BC (PDF)</TooltipContent>
                            </Tooltip>
                            <span className="supplier-action-label">Imprimer</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {phase === 'purchase_orders'
                  && detail.status === 'accepted'
                  && selectedSuppliers.length > 0
                  && detail.purchase_order_can_admin_place_order
                  && (detail.purchase_order_order_placement_mode !== 'participant_choice' || detail.purchase_order_delegate_to_admin) && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, display: 'grid', gap: 8 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#334155' }}>
                      Passage de commande admin (fournisseurs: {selectedSuppliers.map((item) => item.supplier_name).join(', ')})
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <Select value={dispatchSupplierId} onValueChange={setDispatchSupplierId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selectionner un fournisseur" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedSuppliers.map((supplier) => (
                            <SelectItem key={supplier.supplier_id} value={supplier.supplier_id}>{supplier.supplier_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={dispatchChannel} onValueChange={(value) => setDispatchChannel(value as 'email' | 'sms' | 'whatsapp')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Canal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="email">Canal: Email</SelectItem>
                          <SelectItem value="sms">Canal: SMS</SelectItem>
                          <SelectItem value="whatsapp">Canal: WhatsApp</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="secondary" style={iconActionBtnStyle} onClick={() => void markAsPassedByAdmin()}>
                            <CheckCheck size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Marquer comme passee</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="secondary" style={iconActionBtnStyle} onClick={() => void printPurchaseOrderPdf()}>
                            <Printer size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Imprimer le BC (PDF)</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="secondary" style={iconActionBtnStyle} onClick={() => void dispatchAsAdmin('email')}>
                            <Mail size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Envoyer email</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="secondary" style={iconActionBtnStyle} onClick={() => void dispatchAsAdmin('sms')}>
                            <MessageSquare size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Envoyer SMS</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button type="button" variant="secondary" style={iconActionBtnStyle} onClick={() => void dispatchAsAdmin('whatsapp')}>
                            <MessageCircle size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Envoyer WhatsApp</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )}
                <p style={{ margin: 0, color: '#667085', fontSize: 12 }}>
                  Soumise le: {formatDateTime(detail.submitted_at)} · Revue le: {formatDateTime(detail.reviewed_at)}
                </p>
                {detail.admin_correction_note && <p style={{ margin: 0, color: '#475467' }}>Note admin: {detail.admin_correction_note}</p>}
                {canReview && (
                  <div className="grid" style={{ gap: 8 }}>
                    <Input placeholder="Note admin (optionnelle)" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                    {phase === 'purchase_orders' && detail.purchase_order_multi_supplier_enabled && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          fontWeight: 700,
                          color: activeCorrectionSupplierId ? '#1d4ed8' : '#166534',
                        }}
                      >
                        Scope actif: {activeCorrectionSupplierId
                          ? `Fournisseur ${activeCorrectionSupplierName ?? activeCorrectionSupplierId}`
                          : 'General'}
                      </p>
                    )}
                    {isMultiSupplierSplitReview && (
                      <p style={{ margin: 0, color: '#475467', fontSize: 12 }}>
                        Rectifications ciblees sur: <strong>{activeCorrectionSupplierName ?? 'BC global (rectification generale)'}</strong>
                      </p>
                    )}
                    {phase === 'purchase_orders' && detail.purchase_order_multi_supplier_enabled && !isMultiSupplierSplitReview && (
                      <p style={{ margin: 0, color: '#475467', fontSize: 12 }}>
                        Rectifications globales (mono-fournisseur ou un seul fournisseur selectionne).
                      </p>
                    )}
                    <div className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 10px', background: '#f8fafc' }}>
                      <p style={{ margin: 0, fontSize: 13, color: '#475467' }}>
                        Rectifications: <strong>{correctionItems.length}</strong> ·
                        <strong style={{ color: '#b45309' }}> {correctionItems.filter((item) => !item.resolved).length}</strong> a verifier
                      </p>
                      <div style={{ display: 'inline-flex', gap: 8 }}>
                        <Button type="button" className="rectif-cta-btn rectif-cta-primary" onClick={() => setIsAddCorrectionModalOpen(true)}>
                          Ajouter un point a corriger
                        </Button>
                        <Button
                          type="button"
                          className="rectif-cta-btn rectif-cta-secondary"
                          disabled={correctionItems.length === 0}
                          onClick={() => setIsTrackingModalOpen(true)}
                        >
                          Monitorer les rectifications
                        </Button>
                      </div>
                    </div>
                    <div className="toolbar">
                      <Button
                        variant="secondary"
                        disabled={isReviewing || !canReviewCurrentSubmission}
                        onClick={() => void review('request_correction')}
                      >
                        Envoyer la demande de rectification
                      </Button>
                      <span
                        style={{
                          alignSelf: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                          color: correctionItems.length > 0 ? '#b45309' : '#64748b',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Points a rectifier non envoyes: {correctionItems.length}
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>
                        <Button
                          disabled={isReviewing || !canReviewCurrentSubmission || unresolvedCorrectionsCount > 0 || globalAcceptBlockedBySupplierReviews}
                          title={globalAcceptBlockedBySupplierReviews
                            ? `Sous-BC acceptes: ${supplierAcceptanceProgress?.accepted ?? 0}/${supplierAcceptanceProgress?.total ?? 0}`
                            : undefined}
                          onClick={() => void review('accept')}
                        >
                          Accepter
                        </Button>
                        {supplierAcceptanceProgress && (
                          <span
                            style={{
                              alignSelf: 'center',
                              fontSize: 12,
                              color: supplierAcceptanceProgress.accepted === supplierAcceptanceProgress.total ? '#166534' : '#9a3412',
                              fontWeight: 600,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Sous-BC acceptes: {supplierAcceptanceProgress.accepted}/{supplierAcceptanceProgress.total}
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          disabled={freezeToggleDisabled}
                          title={freezeToggleTitle}
                          onClick={() => void review(detail?.status === 'accepted' ? 'unfreeze' : 'accept')}
                        >
                          {freezeToggleLabel}
                        </Button>
                      </div>
                    </div>
                    {isUnfreezeBlockedByLinkedPurchaseOrder && (
                      <p style={{ margin: 0, color: '#9a3412', fontSize: 12 }}>
                        {unfreezeBlockedReason}
                      </p>
                    )}
                  </div>
                )}
                {isAddCorrectionModalOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="pg-modal-overlay"
                    onClick={() => setIsAddCorrectionModalOpen(false)}
                  >
                    <div
                      className="pg-modal-card"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="toolbar pg-modal-header">
                        <h3 style={{ margin: 0 }}>Ajouter une demande de rectification</h3>
                        <Button type="button" variant="secondary" onClick={() => setIsAddCorrectionModalOpen(false)}>Fermer</Button>
                      </div>
                      {isMultiSupplierSplitReview && (
                        <p style={{ margin: 0, fontSize: 12, color: '#475467' }}>
                          Cible implicite: <strong>{activeCorrectionSupplierName ?? 'BC global (rectification generale)'}</strong>
                        </p>
                      )}
                      <Select value={correctionScope} onValueChange={(value) => setCorrectionScope(value as 'campaign' | 'business_unit' | 'group_brand' | 'product')}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir une portee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="campaign">Portee campagne</SelectItem>
                          {hasBusinessUnitScopes && <SelectItem value="business_unit">Portee BU</SelectItem>}
                          {hasGroupScopes && <SelectItem value="group_brand">Portee GROUP</SelectItem>}
                          <SelectItem value="product">Portee produit</SelectItem>
                        </SelectContent>
                      </Select>
                      {correctionScope === 'business_unit' && (
                        <Select value={selectedBusinessUnit} onValueChange={setSelectedBusinessUnit}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une BU" />
                          </SelectTrigger>
                          <SelectContent>
                            {businessUnitOptions.length === 0 && (
                              <div style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>Aucune BU disponible</div>
                            )}
                            {businessUnitOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {correctionScope === 'group_brand' && (
                        <Select value={selectedGroupBrand} onValueChange={setSelectedGroupBrand}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un GROUP" />
                          </SelectTrigger>
                          <SelectContent>
                            {groupOptions.length === 0 && (
                              <div style={{ padding: '8px 10px', fontSize: 12, color: '#64748b' }}>Aucun GROUP disponible</div>
                            )}
                            {groupOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {correctionScope === 'product' && (
                        <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir un produit" />
                          </SelectTrigger>
                          <SelectContent>
                            {(detail?.lines ?? []).map((line) => (
                              <SelectItem key={line.product_id} value={line.product_id}>{line.product_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <div className="toolbar pg-modal-row">
                        <Input placeholder="Ex: Corriger la quantite minimale de ce produit" value={correctionMessage} onChange={(event) => setCorrectionMessage(event.target.value)} />
                        <Button type="button" variant="secondary" onClick={addCorrectionItem}>Ajouter</Button>
                      </div>
                      <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>
                        Les demandes ajoutees apparaissent dans le modal de suivi.
                      </p>
                    </div>
                  </div>
                )}
                {isTrackingModalOpen && (
                  <div
                    role="dialog"
                    aria-modal="true"
                    className="pg-modal-overlay"
                    onClick={() => setIsTrackingModalOpen(false)}
                  >
                    <div
                      className="pg-modal-card"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <div className="toolbar pg-modal-header">
                        <h3 style={{ margin: 0 }}>Suivi des rectifications</h3>
                        <Button type="button" variant="secondary" onClick={() => setIsTrackingModalOpen(false)}>Fermer</Button>
                      </div>
                      <div className="grid" style={{ gap: 6 }}>
                        {phase === 'purchase_orders' && (
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, display: 'grid', gap: 8, background: '#f8fafc' }}>
                            <div className="toolbar" style={{ alignItems: 'center' }}>
                              <p style={{ margin: 0, fontWeight: 700 }}>Monitoring campagne (tous les BC)</p>
                              <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                                <span style={{ fontSize: 12, color: '#64748b' }}>Filtre fournisseur:</span>
                                <Select value={rectifMonitorSupplierFilter} onValueChange={setRectifMonitorSupplierFilter}>
                                  <SelectTrigger style={{ width: 240 }}>
                                    <SelectValue placeholder="Tous" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">Tous</SelectItem>
                                    <SelectItem value="general">General (non fournisseur)</SelectItem>
                                    {rectifMonitorSuppliers.map((s) => (
                                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            {isLoadingRectifMonitor && <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Chargement monitoring...</p>}
                            {!isLoadingRectifMonitor && filteredRectifMonitorRows.length === 0 && <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Aucune rectification pour ce filtre.</p>}
                            {!isLoadingRectifMonitor && filteredRectifMonitorRows.length > 0 && (
                              <div className="grid" style={{ gap: 6, maxHeight: 220, overflow: 'auto' }}>
                                {filteredRectifMonitorRows.map((row) => (
                                  <div key={`${row.submission_id}-${row.supplier_id ?? 'general'}`} className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', background: '#fff', alignItems: 'center' }}>
                                    <p style={{ margin: 0, fontSize: 12, flex: 1 }}>
                                      <strong>{row.pharmacy_name}</strong> - {row.supplier_name}
                                      <span style={{ marginLeft: 8, color: '#9a3412', fontWeight: 700 }}>{row.unresolved_total} a verifier</span>
                                      <span style={{ marginLeft: 8, color: '#475467' }}>P:{row.unresolved_product} BU:{row.unresolved_bu} G:{row.unresolved_group} C:{row.unresolved_campaign}</span>
                                    </p>
                                    <Button variant="secondary" onClick={() => {
                                      setSelectedSubmissionId(row.submission_id);
                                      setPendingOpenSupplierId(row.supplier_id ?? null);
                                      if (!row.supplier_id) setPreviewSupplierId(null);
                                      setDetailReloadToken((v) => v + 1);
                                      setIsTrackingModalOpen(false);
                                    }}>
                                      Ouvrir
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, display: 'grid', gap: 6 }}>
                          <p style={{ margin: 0, fontWeight: 700 }}>
                            Rectifications a traiter
                            {rectifMonitorSupplierFilter === 'general'
                              ? ' - General'
                              : rectifMonitorSupplierFilter !== 'all'
                                ? ` - ${rectifMonitorSuppliers.find((s) => s.id === rectifMonitorSupplierFilter)?.name ?? rectifMonitorSupplierFilter}`
                                : ''}
                          </p>
                          {trackingDisplayedItems.length === 0 && <p style={{ margin: 0, color: '#64748b', fontSize: 12 }}>Aucune rectification structuree.</p>}
                          {trackingDisplayedItems.map((item, index) => (
                            <div key={`${item.scope_type}-${item.product_id ?? index}-${index}`} className="toolbar" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 8px', background: '#fff' }}>
                              <p style={{ margin: 0, fontSize: 12, flex: 1 }}>
                                <strong>{correctionItemLabel(item)}</strong> - {item.message}
                                <span style={{ marginLeft: 8, color: item.resolved ? '#166534' : '#9a3412', fontWeight: 700 }}>
                                  {item.resolved ? 'Acceptee' : 'A rectifier'}
                                </span>
                              </p>
                              <Button
                                type="button"
                                className="rectif-action-btn rectif-action-accept"
                                disabled={isSavingTracking}
                                onClick={() => void persistCorrectionTracking(trackingDisplayedItems.map((entry, entryIndex) => (
                                  entryIndex === index
                                    ? { ...entry, resolved: !entry.resolved, resolved_at: !entry.resolved ? new Date().toISOString() : null }
                                    : entry
                                )), trackingFilteredSupplierId)}
                              >
                                {item.resolved ? 'Rectifier' : 'Accepter'}
                              </Button>
                              <Button
                                type="button"
                                className="rectif-action-btn rectif-action-remove"
                                disabled={isSavingTracking}
                                onClick={() => void persistCorrectionTracking(trackingDisplayedItems.filter((_, itemIndex) => itemIndex !== index), trackingFilteredSupplierId)}
                              >
                                Retirer
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 210px', gap: 10, padding: '6px 0', color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                    <span>Designation</span>
                    <span style={{ textAlign: 'right' }}>{previewSupplierId ? 'Qte du BC / Qte Total' : 'Quantite'}</span>
                    <span style={{ textAlign: 'right' }}>{previewSupplierId ? 'ST du BC / ST Total (HT)' : 'Sous-total HT'}</span>
                  </div>
                  {arrangedLines.map((item, index) => {
                    const previousSection = index > 0 ? arrangedLines[index - 1].section : null;
                    const showSection = item.section !== previousSection;
                    return (
                      <div key={`${item.row.product_id}-${index}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {showSection && (
                          <p style={{ margin: '8px 0 4px 0', fontSize: 12, color: '#1d4ed8', fontWeight: 700 }}>
                            {item.section}
                          </p>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 210px', gap: 10, padding: '6px 0' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {item.row.product_name}
                            <button
                              type="button"
                              className="rectif-icon-btn"
                              title="Demander une rectification (produit)"
                              onClick={() => openCorrectionModalFor('product', { productId: item.row.product_id })}
                            >
                              <AlertTriangle size={14} />
                            </button>
                          </span>
                          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {previewSupplierId ? `${item.supplier_qty} / ${item.row.quantity} U` : `${item.row.quantity} U`}
                          </span>
                          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {previewSupplierId ? `${money(item.supplier_ht)} / ${money(item.row.line_total_ht)} HT` : `${money(item.row.line_total_ht)} HT`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
};
