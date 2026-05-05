import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input, Select } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { CatalogBusinessUnitNode, CatalogGroupBrandNode, CatalogProductNode, LaboratoryCatalogTree, getLaboratoryCatalogTree } from '@/services/catalogue';
import {
  CampaignPhase,
  CampaignPhaseKey,
  CampaignScopeType,
  CampaignConditionPhase,
  BonificationNature,
  BonificationCashMode,
  BonificationValueType,
  CampaignCondition,
  CampaignBonification,
  CampaignProductArrangementMode,
  CampaignProductArrangementRow,
  CampaignManagedProduct,
  CampaignBusinessUnit,
  CampaignGroupBrand,
  getCampaignById,
  createCampaignBusinessUnit,
  createCampaignGroupBrand,
  deleteCampaignBusinessUnit,
  deleteCampaignGroupBrand,
  getCampaignProductConfiguration,
  listBusinessUnitsForLaboratory,
  listCampaignBusinessUnits,
  listCampaignGroupBrands,
  listCampaignParticipantIds,
  listCampaignPhases,
  listGroupBrandsForLaboratory,
  listManagedProductsForLaboratory,
  replaceCampaignParticipants,
  saveCampaignProductConfiguration,
  listCampaignConditions,
  saveCampaignConditions,
  listCampaignBonifications,
  saveCampaignBonifications,
  updateCampaignStatus,
  updateCampaignDetails,
  upsertCampaignPhases,
} from '@/services/campaigns';
import { Laboratory, listLaboratories } from '@/services/laboratories';
import { Pharmacy, listPharmacies } from '@/services/pharmacies';

type StepKey = 'details' | 'audience' | 'products' | 'conditions' | 'bonifications' | 'validation';
type ToastMessage = { id: string; message: string };
type ProductArrangementDraft = { campaign_business_unit_id: string | null; campaign_group_brand_id: string | null };
type ProductsView = 'select' | 'arrange';
type AssignTarget = { buId: string | null; groupId: string | null; label: string };
type ConditionKindOption = { value: string; label: string; unit: string; operator: string; requiresReferenceScope: boolean; allowedReferenceScopes: CampaignScopeType[] };
type ConditionTarget = {
  scope_type: CampaignScopeType;
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
  product_id: string | null;
  label: string;
};
type ConditionValidationReport = { blocking: string[]; warnings: string[] };
type ConditionRuleCode =
  | 'COND_SCOPE_001'
  | 'COND_SCOPE_002'
  | 'COND_SCOPE_003'
  | 'COND_SCOPE_004'
  | 'COND_ITEM_001'
  | 'COND_VALUE_001'
  | 'COND_PCT_001'
  | 'COND_PCT_002'
  | 'COND_DUP_001'
  | 'COND_MINMAX_001'
  | 'COND_MOD_001'
  | 'COND_PCTSUM_001'
  | 'COND_WARN_001'
  | 'COND_WARN_002'
  | 'COND_WARN_003';
type BonificationTarget = {
  scope_type: CampaignScopeType;
  campaign_business_unit_id: string | null;
  campaign_group_brand_id: string | null;
  product_id: string | null;
  label: string;
};

const STEP_ORDER: StepKey[] = ['details', 'audience', 'products', 'conditions', 'bonifications', 'validation'];
const PHASE_DEFINITIONS: Array<{ key: CampaignPhaseKey; label: string; required: boolean }> = [
  { key: 'purchase_intentions', label: "Collecte des intentions d'achats", required: false },
  { key: 'purchase_orders', label: 'Collecte des bons de commandes', required: false },
  { key: 'delivery_notes', label: 'Collecte des bons de livraisons', required: true },
];
const DEFAULT_PHASES: CampaignPhase[] = [
  { phase_key: 'purchase_intentions', is_enabled: false, has_period_limit: false, start_date: null, end_date: null },
  { phase_key: 'purchase_orders', is_enabled: false, has_period_limit: false, start_date: null, end_date: null },
  { phase_key: 'delivery_notes', is_enabled: true, has_period_limit: false, start_date: null, end_date: null },
];
const CONDITION_KIND_OPTIONS_BY_SCOPE: Record<CampaignScopeType, ConditionKindOption[]> = {
  product: [
    { value: 'product_min_qty', label: 'Quantité minimale', unit: 'U', operator: '>=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'product_max_qty', label: 'Quantité maximale', unit: 'U', operator: '<=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'product_modulo_qty', label: 'Quantité multiple de', unit: 'U', operator: 'mod', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'product_min_pct_total', label: '% minimal du total', unit: '%', operator: '>=', requiresReferenceScope: true, allowedReferenceScopes: ['business_unit', 'group_brand', 'campaign'] },
    { value: 'product_max_pct_total', label: '% maximal du total', unit: '%', operator: '<=', requiresReferenceScope: true, allowedReferenceScopes: ['business_unit', 'group_brand', 'campaign'] },
  ],
  group_brand: [
    { value: 'group_min_amount', label: 'Montant minimal', unit: 'TND', operator: '>=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'group_max_amount', label: 'Montant maximal', unit: 'TND', operator: '<=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'group_min_pct_total', label: '% minimal du total', unit: '%', operator: '>=', requiresReferenceScope: true, allowedReferenceScopes: ['business_unit', 'campaign'] },
    { value: 'group_max_pct_total', label: '% maximal du total', unit: '%', operator: '<=', requiresReferenceScope: true, allowedReferenceScopes: ['business_unit', 'campaign'] },
  ],
  business_unit: [
    { value: 'business_unit_min_amount', label: 'Montant minimal', unit: 'TND', operator: '>=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'business_unit_max_amount', label: 'Montant maximal', unit: 'TND', operator: '<=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'business_unit_min_pct_total', label: '% minimal du total campagne', unit: '%', operator: '>=', requiresReferenceScope: true, allowedReferenceScopes: ['campaign'] },
    { value: 'business_unit_max_pct_total', label: '% maximal du total campagne', unit: '%', operator: '<=', requiresReferenceScope: true, allowedReferenceScopes: ['campaign'] },
  ],
  campaign: [
    { value: 'campaign_min_amount', label: 'Montant minimal campagne', unit: 'TND', operator: '>=', requiresReferenceScope: false, allowedReferenceScopes: [] },
    { value: 'campaign_max_amount', label: 'Montant maximal campagne', unit: 'TND', operator: '<=', requiresReferenceScope: false, allowedReferenceScopes: [] },
  ],
};

export const CampaignSetupPage = () => {
  const navigate = useNavigate();
  const { campaignId } = useParams();
  const [step, setStep] = useState<StepKey>('details');
  const [name, setName] = useState('');
  const [laboratoryId, setLaboratoryId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [laboratories, setLaboratories] = useState<Laboratory[]>([]);
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [selectedPharmacyIds, setSelectedPharmacyIds] = useState<string[]>([]);
  const [audienceSearch, setAudienceSearch] = useState('');
  const [managedProducts, setManagedProducts] = useState<CampaignManagedProduct[]>([]);
  const [catalogTree, setCatalogTree] = useState<LaboratoryCatalogTree | null>(null);
  const [laboratoryBusinessUnits, setLaboratoryBusinessUnits] = useState<CampaignBusinessUnit[]>([]);
  const [laboratoryGroupBrands, setLaboratoryGroupBrands] = useState<Array<{ id: string; name: string; business_unit_id: string | null }>>([]);
  const [businessUnits, setBusinessUnits] = useState<CampaignBusinessUnit[]>([]);
  const [groupBrands, setGroupBrands] = useState<CampaignGroupBrand[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [arrangementMode, setArrangementMode] = useState<CampaignProductArrangementMode>('inherit_laboratory');
  const [productArrangements, setProductArrangements] = useState<Record<string, ProductArrangementDraft>>({});
  const [productsView, setProductsView] = useState<ProductsView>('select');
  const [newBuName, setNewBuName] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupBuId, setNewGroupBuId] = useState('');
  const [isCreateBuModalOpen, setIsCreateBuModalOpen] = useState(false);
  const [isCreateGroupModalOpen, setIsCreateGroupModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<AssignTarget | null>(null);
  const [assignSearch, setAssignSearch] = useState('');
  const [assignSelectedIds, setAssignSelectedIds] = useState<string[]>([]);
  const [movingProductId, setMovingProductId] = useState<string | null>(null);
  const [moveTargetBuId, setMoveTargetBuId] = useState('');
  const [moveTargetGroupId, setMoveTargetGroupId] = useState('');
  const [phases, setPhases] = useState<CampaignPhase[]>(DEFAULT_PHASES);
  const [initialPhaseEnablement, setInitialPhaseEnablement] = useState<Record<CampaignPhaseKey, boolean>>({
    purchase_intentions: false,
    purchase_orders: false,
    delivery_notes: true,
  });
  const [campaignStatus, setCampaignStatus] = useState<'draft' | 'open' | 'closed' | 'archived'>('draft');
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isSavingDetails, setIsSavingDetails] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [isSavingAudience, setIsSavingAudience] = useState(false);
  const [isSavingProducts, setIsSavingProducts] = useState(false);
  const [isCreatingBu, setIsCreatingBu] = useState(false);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [conditions, setConditions] = useState<CampaignCondition[]>([]);
  const [bonifications, setBonifications] = useState<CampaignBonification[]>([]);
  const [isSavingConditions, setIsSavingConditions] = useState(false);
  const [isSavingBonifications, setIsSavingBonifications] = useState(false);
  const [isOpeningCampaign, setIsOpeningCampaign] = useState(false);
  const [conditionsPhase, setConditionsPhase] = useState<CampaignConditionPhase>('both');
  const [conditionTarget, setConditionTarget] = useState<ConditionTarget | null>(null);
  const [conditionModalError, setConditionModalError] = useState<string | null>(null);
  const [bonificationTarget, setBonificationTarget] = useState<BonificationTarget | null>(null);
  const [bonificationModalError, setBonificationModalError] = useState<string | null>(null);
  const [conditionDraft, setConditionDraft] = useState<CampaignCondition>({
    scope_type: 'campaign',
    campaign_business_unit_id: null,
    campaign_group_brand_id: null,
    product_id: null,
    phase: 'both',
    condition_kind: 'campaign_min_amount',
    reference_scope_type: null,
    label: '',
    operator: '>=',
    target_value: 0,
    unit: 'TND',
  });
  const [bonificationDraft, setBonificationDraft] = useState<CampaignBonification>({
    scope_type: 'campaign',
    campaign_business_unit_id: null,
    campaign_group_brand_id: null,
    product_id: null,
    label: '',
    value_type: 'percent',
    value: 0,
    nature: 'purchase_voucher',
    cash_mode: null,
    buy_qty_threshold: null,
    free_qty: null,
    is_repeatable: null,
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const index = STEP_ORDER.indexOf(step);
  const completion = useMemo(() => Math.round(((index + 1) / STEP_ORDER.length) * 100), [index]);

  useEffect(() => {
    const loadSetupDetails = async () => {
      if (!campaignId) {
        setFeedback('Identifiant de campagne introuvable.');
        setIsLoadingDetails(false);
        return;
      }

      setIsLoadingDetails(true);
      setFeedback(null);
      try {
        const [campaign, labs, campaignPhases, pharmacyRows, participantIds, productConfiguration, conditionRows, bonificationRows] = await Promise.all([
          getCampaignById(campaignId),
          listLaboratories(),
          listCampaignPhases(campaignId),
          listPharmacies(),
          listCampaignParticipantIds(campaignId),
          getCampaignProductConfiguration(campaignId),
          listCampaignConditions(campaignId),
          listCampaignBonifications(campaignId),
        ]);
        setName(campaign.name);
        setLaboratoryId(campaign.supplier_id ?? '');
        setStartDate(campaign.start_date);
        setEndDate(campaign.end_date);
        setCampaignStatus(campaign.status);
        setLaboratories(labs);
        setPharmacies(pharmacyRows.filter((item) => item.is_active));
        setSelectedPharmacyIds(participantIds);
        setSelectedProductIds(productConfiguration.productIds);
        setArrangementMode(productConfiguration.arrangementMode);
        setProductArrangements(
          productConfiguration.arrangements.reduce<Record<string, ProductArrangementDraft>>((acc, row) => {
            acc[row.product_id] = {
              campaign_business_unit_id: row.campaign_business_unit_id,
              campaign_group_brand_id: row.campaign_group_brand_id,
            };
            return acc;
          }, {}),
        );
        setConditions(conditionRows);
        if (conditionRows.length) {
          setConditionsPhase(conditionRows[0].phase);
        }
        setBonifications(bonificationRows);
        if (campaignPhases.length) {
          const byKey = new Map(campaignPhases.map((phase) => [phase.phase_key, phase]));
          const mergedPhases = DEFAULT_PHASES.map((phase) => ({
              ...phase,
              ...byKey.get(phase.phase_key),
            }));
          setPhases(mergedPhases);
          setInitialPhaseEnablement({
            purchase_intentions: mergedPhases.find((phase) => phase.phase_key === 'purchase_intentions')?.is_enabled ?? false,
            purchase_orders: mergedPhases.find((phase) => phase.phase_key === 'purchase_orders')?.is_enabled ?? false,
            delivery_notes: mergedPhases.find((phase) => phase.phase_key === 'delivery_notes')?.is_enabled ?? true,
          });
        } else {
          setPhases(DEFAULT_PHASES);
          setInitialPhaseEnablement({
            purchase_intentions: false,
            purchase_orders: false,
            delivery_notes: true,
          });
        }
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les détails de la campagne.');
      } finally {
        setIsLoadingDetails(false);
      }
    };

    void loadSetupDetails();
  }, [campaignId]);

  const loadProductScopeData = async (targetLaboratoryId: string) => {
    if (!campaignId) return;
    const [products, labBus, labBrands, tree, campaignBus, campaignBrands] = await Promise.all([
      listManagedProductsForLaboratory(targetLaboratoryId),
      listBusinessUnitsForLaboratory(targetLaboratoryId),
      listGroupBrandsForLaboratory(targetLaboratoryId),
      getLaboratoryCatalogTree(targetLaboratoryId),
      listCampaignBusinessUnits(campaignId),
      listCampaignGroupBrands(campaignId),
    ]);
    setManagedProducts(products);
    setCatalogTree(tree);
    setLaboratoryBusinessUnits(labBus);
    setLaboratoryGroupBrands(labBrands);
    setBusinessUnits(campaignBus);
    setGroupBrands(campaignBrands);

    const allowed = new Set(products.map((product) => product.id));
    setSelectedProductIds((current) => current.filter((id) => allowed.has(id)));
    setProductArrangements((current) => {
      const next: Record<string, ProductArrangementDraft> = {};
      for (const [key, value] of Object.entries(current)) {
        if (allowed.has(key)) next[key] = value;
      }
      return next;
    });
  };

  useEffect(() => {
    const loadProductScope = async () => {
      if (!laboratoryId) {
        setManagedProducts([]);
        setCatalogTree(null);
        setLaboratoryBusinessUnits([]);
        setLaboratoryGroupBrands([]);
        setBusinessUnits([]);
        setGroupBrands([]);
        setSelectedProductIds([]);
        setProductArrangements({});
        return;
      }

      try {
        await loadProductScopeData(laboratoryId);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Impossible de charger les produits du laboratoire.');
      }
    };

    void loadProductScope();
  }, [laboratoryId]);

  useEffect(() => {
    const bootstrapInheritedArrangement = async () => {
      if (!campaignId || !laboratoryId) return;
      if (arrangementMode !== 'inherit_laboratory') return;
      if (!selectedProductIds.length) return;

      const hasMissing = selectedProductIds.some((productId) => !productArrangements[productId]);
      if (!hasMissing) return;

      try {
        const inheritLookup = await ensureCampaignContainersFromLaboratory();
        setProductArrangements((current) => {
          const next = { ...current };
          for (const productId of selectedProductIds) {
            if (next[productId]) continue;
            const resolved = inheritLookup.arrangementsByProductId.get(productId) ?? {
              campaign_business_unit_id: null,
              campaign_group_brand_id: null,
            };
            next[productId] = resolved;
          }
          return next;
        });
      } catch {
        // no-op: keep manual save flow as fallback if bootstrap fails
      }
    };

    void bootstrapInheritedArrangement();
  }, [campaignId, laboratoryId, arrangementMode, selectedProductIds, productArrangements]);

  const saveDetails = async () => {
    if (!campaignId) return;
    if (!name.trim() || !laboratoryId || !startDate || !endDate) return setFeedback('Tous les champs de la section Détails sont obligatoires.');
    if (endDate < startDate) return setFeedback("La date de clôture doit être supérieure ou égale à la date d'ouverture.");
    const deliveryNotesPhase = phases.find((phase) => phase.phase_key === 'delivery_notes');
    if (!deliveryNotesPhase?.is_enabled) return setFeedback('La phase "Collecte des bons de livraisons" est obligatoire.');
    if (campaignStatus === 'open') {
      const phaseEnablementChanged = phases.some((phase) => initialPhaseEnablement[phase.phase_key] !== phase.is_enabled);
      if (phaseEnablementChanged) {
        return setFeedback("Campagne ouverte: l'activation des phases ne peut plus être modifiée. Seules les périodes et leurs dates restent éditables.");
      }
    }

    for (const phase of phases) {
      if (!phase.is_enabled) continue;
      if (!phase.has_period_limit) continue;
      if (!phase.start_date || !phase.end_date) {
        const label = PHASE_DEFINITIONS.find((item) => item.key === phase.phase_key)?.label ?? phase.phase_key;
        return setFeedback(`Veuillez renseigner une date de début et une date de fin pour "${label}".`);
      }
      if (phase.end_date < phase.start_date) {
        const label = PHASE_DEFINITIONS.find((item) => item.key === phase.phase_key)?.label ?? phase.phase_key;
        return setFeedback(`La date de fin de "${label}" doit être supérieure ou égale à la date de début.`);
      }
    }

    setIsSavingDetails(true);
    setFeedback(null);
    try {
      await updateCampaignDetails(campaignId, { name: name.trim(), supplier_id: laboratoryId, start_date: startDate, end_date: endDate });
      await upsertCampaignPhases(campaignId, phases);
      setIsEditingDetails(false);
      showToast('Modifications enregistrées avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement des détails impossible.');
    } finally {
      setIsSavingDetails(false);
    }
  };

  const setPhaseEnabled = (phaseKey: CampaignPhaseKey, checked: boolean) => {
    if (campaignStatus === 'open') return;
    const isRequired = PHASE_DEFINITIONS.find((phase) => phase.key === phaseKey)?.required ?? false;
    setPhases((current) =>
      current.map((phase) => {
        if (phase.phase_key !== phaseKey) return phase;
        const nextEnabled = isRequired ? true : checked;
        return {
          ...phase,
          is_enabled: nextEnabled,
          has_period_limit: nextEnabled ? phase.has_period_limit : false,
          start_date: nextEnabled ? phase.start_date : null,
          end_date: nextEnabled ? phase.end_date : null,
        };
      }),
    );
  };

  const setPhasePeriodLimited = (phaseKey: CampaignPhaseKey, checked: boolean) => {
    setPhases((current) =>
      current.map((phase) => {
        if (phase.phase_key !== phaseKey) return phase;
        return {
          ...phase,
          has_period_limit: checked,
          start_date: checked ? phase.start_date : null,
          end_date: checked ? phase.end_date : null,
        };
      }),
    );
  };

  const setPhaseDate = (phaseKey: CampaignPhaseKey, field: 'start_date' | 'end_date', value: string) => {
    setPhases((current) =>
      current.map((phase) => {
        if (phase.phase_key !== phaseKey) return phase;
        return { ...phase, [field]: value || null };
      }),
    );
  };

  const showToast = (message: string) => {
    const toast = { id: `${Date.now()}-${Math.random()}`, message };
    setToasts((current) => [...current, toast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toast.id));
    }, 3500);
  };

  const togglePharmacy = (pharmacyId: string) => {
    setSelectedPharmacyIds((current) => (
      current.includes(pharmacyId)
        ? current.filter((id) => id !== pharmacyId)
        : [...current, pharmacyId]
    ));
  };

  const saveAudience = async () => {
    if (!campaignId) return;
    if (!selectedPharmacyIds.length) {
      setFeedback('Sélectionnez au moins une pharmacie participante.');
      return;
    }

    setIsSavingAudience(true);
    setFeedback(null);
    try {
      await replaceCampaignParticipants(campaignId, selectedPharmacyIds);
      showToast('Audience enregistrée avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Enregistrement de l'audience impossible.");
    } finally {
      setIsSavingAudience(false);
    }
  };

  const filteredPharmacies = useMemo(() => {
    const query = audienceSearch.trim().toLowerCase();
    if (!query) return pharmacies;
    return pharmacies.filter((pharmacy) => pharmacy.name.toLowerCase().includes(query));
  }, [audienceSearch, pharmacies]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return managedProducts;
    return managedProducts.filter((product) => product.designation.toLowerCase().includes(query));
  }, [managedProducts, productSearch]);
  const filteredProductIds = useMemo(() => new Set(filteredProducts.map((product) => product.id)), [filteredProducts]);

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  };

  const toggleAssignProduct = (productId: string) => {
    setAssignSelectedIds((current) => (
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    ));
  };

  const openAssignModal = (target: AssignTarget) => {
    setAssignTarget(target);
    setAssignSearch('');
    setAssignSelectedIds([]);
  };

  const assignProductsToTarget = () => {
    if (!assignTarget || !assignSelectedIds.length) return;
    setProductArrangements((current) => {
      const next = { ...current };
      for (const productId of assignSelectedIds) {
        next[productId] = {
          campaign_business_unit_id: assignTarget.buId,
          campaign_group_brand_id: assignTarget.groupId,
        };
      }
      return next;
    });
    setAssignTarget(null);
    setAssignSelectedIds([]);
  };

  const removeProductFromContainer = (productId: string) => {
    setProductArrangements((current) => ({
      ...current,
      [productId]: {
        campaign_business_unit_id: null,
        campaign_group_brand_id: null,
      },
    }));
  };

  const getCampaignDraftForProduct = (productId: string): ProductArrangementDraft =>
    productArrangements[productId] ?? { campaign_business_unit_id: null, campaign_group_brand_id: null };

  const arrangedProducts = useMemo(
    () => selectedProductIds
      .map((id) => managedProducts.find((product) => product.id === id))
      .filter((product): product is CampaignManagedProduct => Boolean(product)),
    [selectedProductIds, managedProducts],
  );

  const countProductsInGroup = (groupId: string) =>
    arrangedProducts.filter((product) => getCampaignDraftForProduct(product.id).campaign_group_brand_id === groupId).length;

  const countProductsInBu = (buId: string) =>
    arrangedProducts.filter((product) => getCampaignDraftForProduct(product.id).campaign_business_unit_id === buId).length;

  const assignableProducts = useMemo(() => {
    const query = assignSearch.trim().toLowerCase();
    return selectedProductIds
      .map((id) => managedProducts.find((product) => product.id === id))
      .filter((product): product is CampaignManagedProduct => Boolean(product))
      .filter((product) => {
        const draft = getCampaignDraftForProduct(product.id);
        return !draft.campaign_business_unit_id && !draft.campaign_group_brand_id;
      })
      .filter((product) => !query || product.designation.toLowerCase().includes(query));
  }, [assignSearch, selectedProductIds, managedProducts, productArrangements]);

  const setProductArrangementBu = (productId: string, businessUnitId: string) => {
    const nextBu = businessUnitId || null;
    setProductArrangements((current) => ({
      ...current,
      [productId]: {
        campaign_business_unit_id: nextBu,
        campaign_group_brand_id: null,
      },
    }));
  };

  const setProductArrangementGroup = (productId: string, groupBrandId: string) => {
    const nextGroup = groupBrandId || null;
    const brand = groupBrands.find((item) => item.id === nextGroup);
    setProductArrangements((current) => ({
      ...current,
      [productId]: {
        campaign_business_unit_id: brand?.campaign_business_unit_id ?? null,
        campaign_group_brand_id: nextGroup,
      },
    }));
  };

  const getInheritedArrangement = (productId: string): ProductArrangementDraft => {
    const source = managedProducts.find((item) => item.id === productId);
    const labBu = source?.business_unit_id ? laboratoryBusinessUnits.find((item) => item.id === source.business_unit_id) : null;
    const labGroup = source?.group_brand_id ? laboratoryGroupBrands.find((item) => item.id === source.group_brand_id) : null;
    const existingCampaignBu = labBu ? businessUnits.find((item) => item.name.toLowerCase() === labBu.name.toLowerCase()) : null;
    const existingCampaignGroup = labGroup ? groupBrands.find((item) => item.name.toLowerCase() === labGroup.name.toLowerCase()) : null;
    return {
      campaign_business_unit_id: existingCampaignBu?.id ?? null,
      campaign_group_brand_id: existingCampaignGroup?.id ?? null,
    };
  };

  const isProductVisible = (product: CatalogProductNode) => filteredProductIds.has(product.id);
  const hasVisibleProductsInGroup = (group: CatalogGroupBrandNode) => group.products.some(isProductVisible);
  const hasVisibleProductsInBu = (bu: CatalogBusinessUnitNode) =>
    bu.products.some(isProductVisible) || bu.group_brands.some(hasVisibleProductsInGroup);

  const buildProductLocationMap = () => {
    const map = new Map<string, { buName: string | null; groupName: string | null }>();
    if (!catalogTree) return map;
    for (const bu of catalogTree.business_units) {
      for (const product of bu.products) map.set(product.id, { buName: bu.name, groupName: null });
      for (const group of bu.group_brands) {
        for (const product of group.products) map.set(product.id, { buName: bu.name, groupName: group.name });
      }
    }
    for (const group of catalogTree.root_group_brands) {
      for (const product of group.products) map.set(product.id, { buName: null, groupName: group.name });
    }
    for (const product of catalogTree.root_products) map.set(product.id, { buName: null, groupName: null });
    return map;
  };

  const ensureCampaignContainersFromLaboratory = async () => {
    if (!campaignId) {
      return {
        busByName: new Map<string, string>(),
        groupsByKey: new Map<string, string>(),
        arrangementsByProductId: new Map<string, ProductArrangementDraft>(),
      };
    }

    const locationMap = buildProductLocationMap();
    const busByName = new Map<string, string>(
      businessUnits.map((bu) => [bu.name.toLowerCase(), bu.id]),
    );
    const groupsByKey = new Map<string, string>(
      groupBrands.map((group) => [`${group.campaign_business_unit_id ?? 'root'}::${group.name.toLowerCase()}`, group.id]),
    );
    const arrangementsByProductId = new Map<string, ProductArrangementDraft>();

    for (const productId of selectedProductIds) {
      const location = locationMap.get(productId);
      if (!location) continue;

      let campaignBuId: string | null = null;
      if (location.buName) {
        const key = location.buName.toLowerCase();
        if (!busByName.has(key)) {
          const created = await createCampaignBusinessUnit(campaignId, location.buName);
          busByName.set(key, created.id);
        }
        campaignBuId = busByName.get(key) ?? null;
      }

      if (location.groupName) {
        const groupKey = `${campaignBuId ?? 'root'}::${location.groupName.toLowerCase()}`;
        if (!groupsByKey.has(groupKey)) {
          const created = await createCampaignGroupBrand(campaignId, location.groupName, campaignBuId);
          groupsByKey.set(groupKey, created.id);
        }
      }

      const currentGroupId = location.groupName
        ? (groupsByKey.get(`${campaignBuId ?? 'root'}::${location.groupName.toLowerCase()}`) ?? null)
        : null;

      arrangementsByProductId.set(productId, {
        campaign_business_unit_id: campaignBuId,
        campaign_group_brand_id: currentGroupId,
      });
    }

    await loadProductScopeData(laboratoryId);
    return { busByName, groupsByKey, arrangementsByProductId };
  };

  const saveProducts = async () => {
    if (!campaignId) return;
    if (!laboratoryId) {
      setFeedback('Veuillez renseigner le laboratoire de la campagne avant de configurer les produits.');
      return;
    }
    if (!selectedProductIds.length) {
      setFeedback('Sélectionnez au moins un produit pour la campagne.');
      return;
    }
    if (arrangementMode === 'custom') {
      const emptyBus = businessUnits.find((bu) => countProductsInBu(bu.id) === 0);
      if (emptyBus) {
        setFeedback(`La BU "${emptyBus.name}" est vide. Affectez au moins un produit ou supprimez-la.`);
        return;
      }
      const emptyGroup = groupBrands.find((group) => countProductsInGroup(group.id) === 0);
      if (emptyGroup) {
        setFeedback(`Le GROUP "${emptyGroup.name}" est vide. Affectez au moins un produit ou supprimez-le.`);
        return;
      }
    }

    setIsSavingProducts(true);
    setFeedback(null);
    try {
      let inheritLookup: { busByName: Map<string, string>; groupsByKey: Map<string, string>; arrangementsByProductId: Map<string, ProductArrangementDraft> } | null = null;
      if (arrangementMode === 'inherit_laboratory') {
        inheritLookup = await ensureCampaignContainersFromLaboratory();
      }

      const arrangements: CampaignProductArrangementRow[] = selectedProductIds.map((productId) => {
        if (arrangementMode === 'inherit_laboratory') {
          const existing = productArrangements[productId];
          const resolved = existing ?? inheritLookup?.arrangementsByProductId.get(productId) ?? { campaign_business_unit_id: null, campaign_group_brand_id: null };
          return {
            product_id: productId,
            campaign_business_unit_id: resolved.campaign_business_unit_id,
            campaign_group_brand_id: resolved.campaign_group_brand_id,
          };
        }

        const source = productArrangements[productId] ?? { campaign_business_unit_id: null, campaign_group_brand_id: null };
        return {
          product_id: productId,
          campaign_business_unit_id: source.campaign_business_unit_id,
          campaign_group_brand_id: source.campaign_group_brand_id,
        };
      });

      await saveCampaignProductConfiguration(campaignId, {
        productIds: selectedProductIds,
        arrangementMode,
        arrangements,
      });
      if (arrangementMode === 'inherit_laboratory') {
        setProductArrangements((current) => arrangements.reduce<Record<string, ProductArrangementDraft>>((acc, row) => {
          acc[row.product_id] = {
            campaign_business_unit_id: row.campaign_business_unit_id,
            campaign_group_brand_id: row.campaign_group_brand_id,
          };
          return acc;
        }, { ...current }));
      }
      showToast('Produits de campagne enregistrés avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement des produits impossible.');
    } finally {
      setIsSavingProducts(false);
    }
  };

  const createBu = async () => {
    if (!campaignId) return setFeedback('Identifiant de campagne introuvable.');
    if (!newBuName.trim()) return setFeedback('Le nom de la BU est obligatoire.');
    if (businessUnits.some((item) => item.name.trim().toLowerCase() === newBuName.trim().toLowerCase())) {
      return setFeedback('Une BU avec ce nom existe déjà pour ce laboratoire.');
    }

    setIsCreatingBu(true);
    setFeedback(null);
    try {
      await createCampaignBusinessUnit(campaignId, newBuName);
      setNewBuName('');
      setIsCreateBuModalOpen(false);
      await loadProductScopeData(laboratoryId);
      showToast('BU créée avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Création de BU impossible.');
    } finally {
      setIsCreatingBu(false);
    }
  };

  const createGroup = async () => {
    if (!campaignId) return setFeedback('Identifiant de campagne introuvable.');
    if (!newGroupName.trim()) return setFeedback('Le nom du group est obligatoire.');
    if (businessUnits.length > 0 && !newGroupBuId) {
      return setFeedback('Ce laboratoire contient des BU: le group doit être rattaché à une BU.');
    }
    if (
      groupBrands.some((item) => (
        item.name.trim().toLowerCase() === newGroupName.trim().toLowerCase()
        && (item.campaign_business_unit_id ?? null) === (newGroupBuId || null)
      ))
    ) {
      return setFeedback('Un group avec ce nom existe déjà dans ce périmètre BU.');
    }

    setIsCreatingGroup(true);
    setFeedback(null);
    try {
      await createCampaignGroupBrand(campaignId, newGroupName, newGroupBuId || null);
      setNewGroupName('');
      setNewGroupBuId('');
      setIsCreateGroupModalOpen(false);
      await loadProductScopeData(laboratoryId);
      showToast('Group créé avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Création de group impossible.');
    } finally {
      setIsCreatingGroup(false);
    }
  };

  const saveConditionsStep = async () => {
    if (!campaignId) return;
    if (!conditions.length) return setFeedback('Ajoutez au moins une condition avant validation.');
    const report = validateConditionCollection(conditions);
    if (report.blocking.length) {
      return setFeedback(`Validation impossible: ${report.blocking[0]}`);
    }
    if (report.warnings.length) {
      setFeedback(`Alerte cohérence: ${report.warnings[0]}`);
    }
    setIsSavingConditions(true);
    if (!report.warnings.length) setFeedback(null);
    try {
      await saveCampaignConditions(campaignId, conditions.map((row) => ({ ...row, phase: conditionsPhase })));
      showToast('Conditions enregistrées avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement des conditions impossible.');
    } finally {
      setIsSavingConditions(false);
    }
  };

  const saveBonificationsStep = async () => {
    if (!campaignId) return;
    setIsSavingBonifications(true);
    setFeedback(null);
    try {
      await saveCampaignBonifications(campaignId, bonifications);
      showToast('Bonifications enregistrées avec succès.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement des bonifications impossible.');
    } finally {
      setIsSavingBonifications(false);
    }
  };

  const validateCampaign = async () => {
    if (!campaignId) {
      setFeedback('Identifiant de campagne introuvable.');
      return;
    }

    setIsOpeningCampaign(true);
    setFeedback(null);
    try {
      if (campaignStatus !== 'open') {
        await updateCampaignStatus(campaignId, 'open');
        setCampaignStatus('open');
        showToast('Campagne validee et ouverte avec succes.');
      } else {
        showToast('Campagne validee: modifications propagees avec succes.');
      }
      navigate('/admin/campaigns');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Validation de campagne impossible.');
    } finally {
      setIsOpeningCampaign(false);
    }
  };

  const removeInvalidConditions = async () => {
    const invalidIndexes = conditions
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => {
        const standalone = validateConditionCollection([row]);
        if (standalone.blocking.length) return true;
        if (validateConditionScopeShape(row)) return true;
        if (!hasProductsForConditionTarget(row)) return true;
        if (row.target_value <= 0) return true;
        if (row.unit === '%' && row.target_value > 100) return true;
        if (row.condition_kind.includes('_pct_')) {
          const allowed = CONDITION_KIND_OPTIONS_BY_SCOPE[row.scope_type].find((opt) => opt.value === row.condition_kind)?.allowedReferenceScopes ?? [];
          if (!row.reference_scope_type || !allowed.includes(row.reference_scope_type)) return true;
        }
        if (row.condition_kind.includes('_modulo_') && !Number.isInteger(row.target_value)) return true;
        return false;
      })
      .map(({ index }) => index);

    if (!invalidIndexes.length) {
      setFeedback('Aucune condition invalide à nettoyer.');
      return;
    }

    const invalidSet = new Set(invalidIndexes);
    const sanitized = conditions.filter((_, index) => !invalidSet.has(index));
    setConditions(sanitized);
    setFeedback(null);

    if (!campaignId) {
      showToast(`${invalidIndexes.length} condition(s) invalide(s) supprimée(s).`);
      return;
    }

    setIsSavingConditions(true);
    try {
      await saveCampaignConditions(campaignId, sanitized.map((row) => ({ ...row, phase: conditionsPhase })));
      showToast(`${invalidIndexes.length} condition(s) invalide(s) supprimée(s) et enregistrée(s).`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Nettoyage effectué localement, mais enregistrement impossible.');
    } finally {
      setIsSavingConditions(false);
    }
  };

  const currentConditionOptions = CONDITION_KIND_OPTIONS_BY_SCOPE[conditionDraft.scope_type];
  const currentConditionOption = currentConditionOptions.find((option) => option.value === conditionDraft.condition_kind) ?? currentConditionOptions[0];
  const isPercentConditionDraft = conditionDraft.unit === '%';
  const openConditionModal = (target: ConditionTarget) => {
    if (!hasProductsForConditionTarget(target)) {
      setFeedback('Impossible d\'ajouter une condition sur un item sans produit.');
      return;
    }
    setConditionModalError(null);
    const defaultOption = CONDITION_KIND_OPTIONS_BY_SCOPE[target.scope_type][0];
    setConditionTarget(target);
    setConditionDraft({
      scope_type: target.scope_type,
      campaign_business_unit_id: target.campaign_business_unit_id,
      campaign_group_brand_id: target.campaign_group_brand_id,
      product_id: target.product_id,
      phase: conditionsPhase,
      condition_kind: defaultOption.value,
      reference_scope_type: defaultOption.requiresReferenceScope ? (defaultOption.allowedReferenceScopes[0] ?? null) : null,
      label: '',
      operator: defaultOption.operator,
      target_value: 0,
      unit: defaultOption.unit,
    });
  };

  const closeConditionModal = () => {
    setConditionTarget(null);
    setConditionModalError(null);
  };

  const bonificationNatureLabel = (nature: BonificationNature, cashMode: BonificationCashMode | null) => {
    if (nature === 'products') return 'Produits en nature';
    if (nature === 'purchase_voucher') return "Bon d'achat";
    return cashMode === 'check' ? 'Argent (cheque)' : 'Argent (virement)';
  };

  const openBonificationModal = (target: BonificationTarget) => {
    if (!hasProductsForConditionTarget(target)) {
      setFeedback('Impossible d\'ajouter une bonification sur un item sans produit.');
      return;
    }
    setBonificationModalError(null);
    setBonificationTarget(target);
    setBonificationDraft({
      scope_type: target.scope_type,
      campaign_business_unit_id: target.campaign_business_unit_id,
      campaign_group_brand_id: target.campaign_group_brand_id,
      product_id: target.product_id,
      label: '',
      value_type: 'percent',
      value: 0,
      nature: 'purchase_voucher',
      cash_mode: null,
      buy_qty_threshold: null,
      free_qty: null,
      is_repeatable: null,
    });
  };

  const closeBonificationModal = () => {
    setBonificationTarget(null);
    setBonificationModalError(null);
  };

  const handleConditionKindChange = (nextKind: string) => {
    const nextOption = CONDITION_KIND_OPTIONS_BY_SCOPE[conditionDraft.scope_type].find((option) => option.value === nextKind);
    if (!nextOption) return;
    setConditionDraft((current) => ({
      ...current,
      condition_kind: nextKind,
      unit: nextOption.unit,
      operator: nextOption.operator,
      reference_scope_type: nextOption.requiresReferenceScope ? (nextOption.allowedReferenceScopes[0] ?? null) : null,
    }));
  };

  const generateConditionLabel = (row: CampaignCondition) => {
    const buName = row.campaign_business_unit_id ? (businessUnits.find((bu) => bu.id === row.campaign_business_unit_id)?.name ?? 'BU') : null;
    const groupName = row.campaign_group_brand_id ? (groupBrands.find((g) => g.id === row.campaign_group_brand_id)?.name ?? 'GROUP') : null;
    const productName = row.product_id ? (managedProducts.find((p) => p.id === row.product_id)?.designation ?? 'Produit') : null;
    const scopeLabel = row.scope_type === 'campaign'
      ? 'Campagne'
      : row.scope_type === 'business_unit'
        ? `BU ${buName ?? ''}`.trim()
        : row.scope_type === 'group_brand'
          ? `GROUP ${groupName ?? ''}`.trim()
          : `Produit ${productName ?? ''}`.trim();
    const kindLabel = (CONDITION_KIND_OPTIONS_BY_SCOPE[row.scope_type].find((option) => option.value === row.condition_kind)?.label) ?? row.condition_kind;
    const refLabel = row.reference_scope_type
      ? ` / référence ${row.reference_scope_type === 'campaign' ? 'Campagne' : row.reference_scope_type === 'business_unit' ? 'BU' : 'GROUP'}`
      : '';
    return `${scopeLabel}: ${kindLabel} ${row.operator} ${row.target_value}${row.unit ? ` ${row.unit}` : ''}${refLabel}`;
  };

  const generateBonificationLabel = (row: CampaignBonification) => {
    const buName = row.campaign_business_unit_id ? (businessUnits.find((bu) => bu.id === row.campaign_business_unit_id)?.name ?? 'BU') : null;
    const groupName = row.campaign_group_brand_id ? (groupBrands.find((g) => g.id === row.campaign_group_brand_id)?.name ?? 'GROUP') : null;
    const productName = row.product_id ? (managedProducts.find((p) => p.id === row.product_id)?.designation ?? 'Produit') : null;
    const scopeLabel = row.scope_type === 'campaign'
      ? 'Campagne'
      : row.scope_type === 'business_unit'
        ? `BU ${buName ?? ''}`.trim()
        : row.scope_type === 'group_brand'
          ? `GROUP ${groupName ?? ''}`.trim()
          : `Produit ${productName ?? ''}`.trim();
    if (row.nature === 'products') {
      const x = row.buy_qty_threshold ?? 0;
      const y = row.free_qty ?? 0;
      const repeat = row.is_repeatable ? ' (repetable)' : '';
      return `${scopeLabel}: Gratuite ${x}+${y}${repeat}`;
    }
    return `${scopeLabel}: ${bonificationNatureLabel(row.nature, row.cash_mode)} - ${row.value_type === 'percent' ? `${row.value}%` : `${row.value} TND`}`;
  };

  const getConditionsForTarget = (target: Omit<ConditionTarget, 'label'>) => (
    conditions
      .map((condition, index) => ({ condition, index }))
      .filter(({ condition }) => (
        condition.scope_type === target.scope_type
        && (condition.campaign_business_unit_id ?? null) === target.campaign_business_unit_id
        && (condition.campaign_group_brand_id ?? null) === target.campaign_group_brand_id
        && (condition.product_id ?? null) === target.product_id
      ))
  );

  const getBonificationsForTarget = (target: Omit<BonificationTarget, 'label'>) => (
    bonifications
      .map((bonification, index) => ({ bonification, index }))
      .filter(({ bonification }) => (
        bonification.scope_type === target.scope_type
        && (bonification.campaign_business_unit_id ?? null) === target.campaign_business_unit_id
        && (bonification.campaign_group_brand_id ?? null) === target.campaign_group_brand_id
        && (bonification.product_id ?? null) === target.product_id
      ))
  );

  const hasProductsForConditionTarget = (target: Omit<ConditionTarget, 'label'>) => {
    if (target.scope_type === 'campaign') return arrangedProducts.length > 0;
    if (target.scope_type === 'business_unit' && target.campaign_business_unit_id) return countProductsInBu(target.campaign_business_unit_id) > 0;
    if (target.scope_type === 'group_brand' && target.campaign_group_brand_id) return countProductsInGroup(target.campaign_group_brand_id) > 0;
    if (target.scope_type === 'product' && target.product_id) return arrangedProducts.some((product) => product.id === target.product_id);
    return false;
  };

  const getCampaignMaxAmount = () => (
    conditions.find((row) => row.condition_kind === 'campaign_max_amount')?.target_value ?? null
  );

  const getBusinessUnitMaxAmount = (buId: string | null) => {
    if (!buId) return null;
    return (
      conditions.find(
        (row) => row.condition_kind === 'business_unit_max_amount' && row.campaign_business_unit_id === buId,
      )?.target_value ?? null
    );
  };

  const getGroupMaxAmount = (groupId: string | null) => {
    if (!groupId) return null;
    return (
      conditions.find(
        (row) => row.condition_kind === 'group_max_amount' && row.campaign_group_brand_id === groupId,
      )?.target_value ?? null
    );
  };

  const validateMaxAmountConsistency = (draft: CampaignCondition): string | null => {
    if (draft.condition_kind === 'business_unit_max_amount') {
      const campaignMax = getCampaignMaxAmount();
      if (campaignMax !== null && draft.target_value > campaignMax) {
        return 'Le montant maximal BU ne peut pas dépasser le montant maximal de la campagne.';
      }
    }

    if (draft.condition_kind === 'group_max_amount') {
      const buMax = getBusinessUnitMaxAmount(draft.campaign_business_unit_id);
      const campaignMax = getCampaignMaxAmount();
      if (buMax !== null && draft.target_value > buMax) {
        return 'Le montant maximal GROUP ne peut pas dépasser le montant maximal de la BU.';
      }
      if (campaignMax !== null && draft.target_value > campaignMax) {
        return 'Le montant maximal GROUP ne peut pas dépasser le montant maximal de la campagne.';
      }
    }

    if (draft.condition_kind === 'campaign_max_amount') {
      const highestBuMax = Math.max(
        0,
        ...conditions
          .filter((row) => row.condition_kind === 'business_unit_max_amount')
          .map((row) => row.target_value),
      );
      const highestGroupMax = Math.max(
        0,
        ...conditions
          .filter((row) => row.condition_kind === 'group_max_amount')
          .map((row) => row.target_value),
      );
      const highestChildMax = Math.max(highestBuMax, highestGroupMax);
      if (highestChildMax > draft.target_value) {
        return 'Le montant maximal campagne doit être supérieur ou égal aux montants maximaux BU/GROUP déjà définis.';
      }
    }

    return null;
  };

  const getConditionTargetKey = (row: Pick<CampaignCondition, 'scope_type' | 'campaign_business_unit_id' | 'campaign_group_brand_id' | 'product_id'>) =>
    `${row.scope_type}|${row.campaign_business_unit_id ?? 'null'}|${row.campaign_group_brand_id ?? 'null'}|${row.product_id ?? 'null'}`;

  const hasDuplicateConditionKindForTarget = (draft: CampaignCondition) =>
    conditions.some((row) => row.condition_kind === draft.condition_kind && getConditionTargetKey(row) === getConditionTargetKey(draft));

  const getConditionMetric = (kind: string): 'amount' | 'qty' | 'pct' | 'modulo' | 'other' => {
    if (kind.includes('_modulo_')) return 'modulo';
    if (kind.includes('_pct_')) return 'pct';
    if (kind.includes('_amount')) return 'amount';
    if (kind.includes('_qty')) return 'qty';
    return 'other';
  };

  const withRuleCode = (code: ConditionRuleCode, message: string) => `[${code}] ${message}`;

  const getConditionBound = (kind: string): 'min' | 'max' | null => {
    if (kind.includes('_min_') || kind.endsWith('_min_amount') || kind.endsWith('_min_qty')) return 'min';
    if (kind.includes('_max_') || kind.endsWith('_max_amount') || kind.endsWith('_max_qty')) return 'max';
    return null;
  };

  const validateConditionScopeShape = (row: CampaignCondition): string | null => {
    if (row.scope_type === 'campaign') {
      if (row.campaign_business_unit_id || row.campaign_group_brand_id || row.product_id) return withRuleCode('COND_SCOPE_001', 'Scope campagne invalide: BU/GROUP/Produit doivent être vides.');
      return null;
    }
    if (row.scope_type === 'business_unit') {
      if (!row.campaign_business_unit_id || row.campaign_group_brand_id || row.product_id) return withRuleCode('COND_SCOPE_002', 'Scope BU invalide: BU obligatoire, GROUP/Produit vides.');
      return null;
    }
    if (row.scope_type === 'group_brand') {
      if (!row.campaign_business_unit_id || !row.campaign_group_brand_id || row.product_id) return withRuleCode('COND_SCOPE_003', 'Scope GROUP invalide: BU+GROUP obligatoires, Produit vide.');
      return null;
    }
    if (row.scope_type === 'product') {
      if (!row.product_id) return withRuleCode('COND_SCOPE_004', 'Scope produit invalide: Produit obligatoire.');
      return null;
    }
    return null;
  };

  const validateConditionCollection = (rows: CampaignCondition[]): ConditionValidationReport => {
    const blocking: string[] = [];
    const warnings: string[] = [];
    const byTarget = new Map<string, CampaignCondition[]>();

    rows.forEach((row) => {
      const scopeShapeError = validateConditionScopeShape(row);
      if (scopeShapeError) blocking.push(scopeShapeError);
      if (row.target_value <= 0) blocking.push(withRuleCode('COND_VALUE_001', `Condition invalide (${row.label || row.condition_kind}): la valeur doit être > 0.`));
      if (row.unit === '%' && row.target_value > 100) blocking.push(withRuleCode('COND_PCT_001', `Condition invalide (${row.label || row.condition_kind}): un % ne peut pas dépasser 100.`));
      if (row.condition_kind.includes('_pct_')) {
        const allowed = CONDITION_KIND_OPTIONS_BY_SCOPE[row.scope_type].find((opt) => opt.value === row.condition_kind)?.allowedReferenceScopes ?? [];
        if (!row.reference_scope_type || !allowed.includes(row.reference_scope_type)) {
          blocking.push(withRuleCode('COND_PCT_002', `Condition ${row.condition_kind}: référence de total manquante ou non autorisée.`));
        }
      }
      const key = getConditionTargetKey(row);
      byTarget.set(key, [...(byTarget.get(key) ?? []), row]);
      if (!hasProductsForConditionTarget(row)) blocking.push(withRuleCode('COND_ITEM_001', `Item sans produit: impossible d'appliquer "${row.condition_kind}".`));
    });

    byTarget.forEach((targetRows) => {
      const kinds = new Set<string>();
      targetRows.forEach((row) => {
        if (kinds.has(row.condition_kind)) blocking.push(withRuleCode('COND_DUP_001', `Doublon: la nature "${row.condition_kind}" existe plusieurs fois sur un même item.`));
        kinds.add(row.condition_kind);
      });

      const metrics = new Map<string, { min?: number; max?: number; modulo?: number }>();
      targetRows.forEach((row) => {
        const metric = getConditionMetric(row.condition_kind);
        const bound = getConditionBound(row.condition_kind);
        const current = metrics.get(metric) ?? {};
        if (bound === 'min') current.min = row.target_value;
        if (bound === 'max') current.max = row.target_value;
        if (metric === 'modulo') current.modulo = row.target_value;
        metrics.set(metric, current);
      });
      metrics.forEach((v, metric) => {
        if (v.min !== undefined && v.max !== undefined && v.min > v.max) {
          blocking.push(withRuleCode('COND_MINMAX_001', `Contradiction: min > max pour une métrique ${metric} sur un item.`));
        }
        if ((v.min !== undefined) !== (v.max !== undefined)) {
          warnings.push(withRuleCode('COND_WARN_001', `Alerte: métrique ${metric} avec uniquement ${v.min !== undefined ? 'min' : 'max'} sur un item.`));
        }
        if (metric === 'modulo' && v.modulo !== undefined && !Number.isInteger(v.modulo)) {
          blocking.push(withRuleCode('COND_MOD_001', 'Condition modulo invalide: la valeur doit être un entier.'));
        }
      });
      if (targetRows.length >= 4) warnings.push(withRuleCode('COND_WARN_002', 'Alerte: item fortement contraint (4 conditions ou plus).'));
    });

    const hasCampaignOrBranchCoverage = rows.some((r) => r.scope_type === 'campaign') || businessUnits.every((bu) => (
      rows.some((r) => r.scope_type === 'business_unit' && r.campaign_business_unit_id === bu.id)
      || groupBrands.filter((g) => g.campaign_business_unit_id === bu.id).every((group) => rows.some((r) => r.scope_type === 'group_brand' && r.campaign_group_brand_id === group.id))
    ));
    if (!hasCampaignOrBranchCoverage) warnings.push(withRuleCode('COND_WARN_003', 'Alerte: couverture conditionnelle partielle (ni racine campagne, ni couverture complète des branches).'));

    const pctByTarget = new Map<string, number>();
    rows.filter((r) => r.condition_kind.includes('_min_pct_')).forEach((r) => {
      const key = getConditionTargetKey(r);
      pctByTarget.set(key, (pctByTarget.get(key) ?? 0) + r.target_value);
    });
    pctByTarget.forEach((sum) => {
      if (sum > 100) blocking.push(withRuleCode('COND_PCTSUM_001', 'Contradiction: somme des % minimaux > 100 sur un même item.'));
    });

    return { blocking, warnings };
  };

  const conditionsValidationReport = useMemo(() => validateConditionCollection(conditions), [conditions]);

  const getBonificationTargetKey = (row: Pick<CampaignBonification, 'scope_type' | 'campaign_business_unit_id' | 'campaign_group_brand_id' | 'product_id'>) =>
    `${row.scope_type}|${row.campaign_business_unit_id ?? 'null'}|${row.campaign_group_brand_id ?? 'null'}|${row.product_id ?? 'null'}`;

  const hasDuplicateBonificationNatureForTarget = (draft: CampaignBonification) =>
    bonifications.some((row) => row.nature === draft.nature && getBonificationTargetKey(row) === getBonificationTargetKey(draft));

  const findMaxAmountValue = (scope: CampaignScopeType, buId: string | null, groupId: string | null, productId: string | null) => {
    const kind = scope === 'campaign'
      ? 'campaign_max_amount'
      : scope === 'business_unit'
        ? 'business_unit_max_amount'
        : scope === 'group_brand'
          ? 'group_max_amount'
          : 'product_max_amount';
    return conditions.find((row) => (
      row.condition_kind === kind
      && row.scope_type === scope
      && (row.campaign_business_unit_id ?? null) === buId
      && (row.campaign_group_brand_id ?? null) === groupId
      && (row.product_id ?? null) === productId
    ))?.target_value ?? null;
  };

  const validateHierarchyConsistency = (draft: CampaignCondition): string | null => {
    if (!draft.condition_kind.endsWith('_max_amount')) return null;

    const campaignMax = findMaxAmountValue('campaign', null, null, null);
    const buMax = draft.campaign_business_unit_id ? findMaxAmountValue('business_unit', draft.campaign_business_unit_id, null, null) : null;
    const groupMax = draft.campaign_group_brand_id ? findMaxAmountValue('group_brand', draft.campaign_business_unit_id, draft.campaign_group_brand_id, null) : null;

    if (draft.scope_type === 'business_unit') {
      if (campaignMax !== null && draft.target_value > campaignMax) {
        return 'Le montant maximal BU ne peut pas dépasser le montant maximal Campagne.';
      }
      const highestGroupInsideBu = Math.max(
        0,
        ...conditions.filter((row) => row.scope_type === 'group_brand' && row.campaign_business_unit_id === draft.campaign_business_unit_id && row.condition_kind === 'group_max_amount').map((row) => row.target_value),
      );
      if (highestGroupInsideBu > draft.target_value) {
        return 'Le montant maximal BU doit être supérieur ou égal aux montants maximaux GROUP déjà définis.';
      }
    }

    if (draft.scope_type === 'group_brand') {
      if (buMax !== null && draft.target_value > buMax) return 'Le montant maximal GROUP ne peut pas dépasser le montant maximal BU.';
      if (campaignMax !== null && draft.target_value > campaignMax) return 'Le montant maximal GROUP ne peut pas dépasser le montant maximal Campagne.';
      const highestProductInsideGroup = Math.max(
        0,
        ...conditions.filter((row) => row.scope_type === 'product' && row.campaign_group_brand_id === draft.campaign_group_brand_id && row.condition_kind === 'product_max_amount').map((row) => row.target_value),
      );
      if (highestProductInsideGroup > draft.target_value) {
        return 'Le montant maximal GROUP doit être supérieur ou égal aux montants maximaux Produit déjà définis.';
      }
    }

    if (draft.scope_type === 'product') {
      if (groupMax !== null && draft.target_value > groupMax) return 'Le montant maximal Produit ne peut pas dépasser le montant maximal GROUP.';
      if (buMax !== null && draft.target_value > buMax) return 'Le montant maximal Produit ne peut pas dépasser le montant maximal BU.';
      if (campaignMax !== null && draft.target_value > campaignMax) return 'Le montant maximal Produit ne peut pas dépasser le montant maximal Campagne.';
    }

    if (draft.scope_type === 'campaign') {
      const highestChildMax = Math.max(
        0,
        ...conditions.filter((row) => row.condition_kind === 'business_unit_max_amount' || row.condition_kind === 'group_max_amount' || row.condition_kind === 'product_max_amount').map((row) => row.target_value),
      );
      if (highestChildMax > draft.target_value) {
        return 'Le montant maximal Campagne doit être supérieur ou égal aux montants maximaux définis sur BU/GROUP/Produit.';
      }
    }

    return null;
  };

  const removeBu = async (buId: string) => {
    try {
      await deleteCampaignBusinessUnit(buId);
      await loadProductScopeData(laboratoryId);
      showToast('BU supprimée.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Suppression de BU impossible.');
    }
  };

  const removeGroup = async (groupId: string) => {
    try {
      await deleteCampaignGroupBrand(groupId);
      await loadProductScopeData(laboratoryId);
      showToast('Group supprimé.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Suppression de group impossible.');
    }
  };

  const openMoveModal = (productId: string) => {
    const current = getCampaignDraftForProduct(productId);
    setMovingProductId(productId);
    setMoveTargetBuId(current.campaign_business_unit_id ?? '');
    setMoveTargetGroupId(current.campaign_group_brand_id ?? '');
  };

  const applyMoveProduct = () => {
    if (!movingProductId) return;
    const targetGroup = moveTargetGroupId || null;
    const group = groupBrands.find((item) => item.id === targetGroup);
    setProductArrangements((current) => ({
      ...current,
      [movingProductId]: {
        campaign_business_unit_id: group ? (group.campaign_business_unit_id ?? null) : (moveTargetBuId || null),
        campaign_group_brand_id: targetGroup,
      },
    }));
    setMovingProductId(null);
    setMoveTargetBuId('');
    setMoveTargetGroupId('');
  };

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Card>
        <div className="toolbar" style={{ alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: 0, fontSize: 12, color: '#667085' }}>Campagne #{campaignId ?? 'draft'}</p>
            <h1 style={{ marginBottom: 4 }}>Paramétrage de la campagne</h1>
            <p style={{ margin: 0, color: '#475467' }}>Configurez chaque étape avant validation et ouverture.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Retour</Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 18 }}>
        <Card>
          <p style={{ fontWeight: 600, marginTop: 0 }}>Étapes</p>
          <div style={{ display: 'grid', gap: 14 }}>
            {STEP_ORDER.map((item, itemIndex) => {
              const active = item === step;
              const done = itemIndex < index;
              const title = item === 'details'
                ? 'Détails'
                : item === 'audience'
                  ? 'Audience'
                  : item === 'products'
                    ? 'Produits'
                    : item === 'conditions'
                      ? 'Conditions'
                      : item === 'bonifications'
                        ? 'Bonifications'
                    : 'Validation';
              const description = item === 'details'
                ? 'Informations de campagne'
                : item === 'audience'
                  ? 'Pharmacies participantes'
                  : item === 'products'
                    ? 'Sélection et arrangement'
                    : item === 'conditions'
                      ? 'Règles BC & intentions'
                      : item === 'bonifications'
                        ? 'Promesses campagne'
                    : 'Résumé final';

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setStep(item)}
                  style={{
                    all: 'unset',
                    cursor: 'pointer',
                    border: active ? '1px solid #111827' : '1px solid #e4e7ec',
                    borderRadius: 12,
                    padding: '10px 12px',
                    background: active ? '#f8fafc' : '#fff',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 600 }}>{done ? '✓ ' : ''}{title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#667085' }}>{description}</p>
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 12, marginTop: 16, color: '#667085' }}>Progression: {completion}%</p>
        </Card>

        <Card>
          {step === 'details' && (
            <div className="grid" style={{ gap: 18 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0, fontSize: 30, lineHeight: 1.15, letterSpacing: '-0.02em' }}>Généralités</h2>
                <p style={{ margin: 0, color: '#71717a', fontSize: 14 }}>
                  Inspiré du setup Resend, adapté à votre workflow de campagne.
                </p>
              </div>
              <div style={{ border: '1px solid #86efac', borderRadius: 14, padding: 14, background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 45%)' }}>
                <div style={{ marginBottom: 10, border: '1px solid #bbf7d0', borderRadius: 12, background: '#f7fee7', padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 13 }}>Règles de paramétrage</p>
                  <p style={{ margin: '6px 0 0', color: '#365314', fontSize: 13 }}>1. La phase livraison est obligatoire.</p>
                  <p style={{ margin: '4px 0 0', color: '#365314', fontSize: 13 }}>2. Les phases limitées doivent avoir des dates cohérentes.</p>
                </div>
                <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <div className="toolbar" style={{ marginBottom: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Identification de la campagne</p>
                  <Button
                    variant={isEditingDetails ? 'secondary' : 'default'}
                    onClick={() => {
                      setFeedback(null);
                      setIsEditingDetails((current) => !current);
                    }}
                    disabled={isLoadingDetails || isSavingDetails}
                  >
                    {isEditingDetails ? "Terminer l'édition" : 'Modifier'}
                  </Button>
                </div>
                <div className="grid grid-2" style={{ gap: 14 }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label>Nom de campagne</label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isEditingDetails} />
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label>Laboratoire</label>
                    <Select value={laboratoryId} onChange={(e) => setLaboratoryId(e.target.value)} disabled={!isEditingDetails}>
                      <option value="">Sélectionner un laboratoire</option>
                      {laboratories.map((laboratory) => <option key={laboratory.id} value={laboratory.id}>{laboratory.designation}</option>)}
                    </Select>
                  </div>
                </div>
                <div className="grid grid-2" style={{ gap: 14, marginTop: 14 }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label>Date d&apos;ouverture</label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!isEditingDetails} />
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label>Date de clôture</label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!isEditingDetails} />
                  </div>
                </div>
                </div>
              </div>
              <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <p style={{ marginTop: 0, marginBottom: 12, fontWeight: 600 }}>Phases de la campagne</p>
                {campaignStatus === 'open' && (
                  <p style={{ margin: '0 0 12px', color: '#92400e', fontSize: 13 }}>
                    Campagne ouverte: l&apos;activation des phases est verrouillée. Seules les limitations de période et les dates peuvent être ajustées.
                  </p>
                )}
                <div className="grid" style={{ gap: 10 }}>
                  {PHASE_DEFINITIONS.map((phaseDefinition) => {
                    const phase = phases.find((item) => item.phase_key === phaseDefinition.key) ?? DEFAULT_PHASES.find((item) => item.phase_key === phaseDefinition.key)!;
                    return (
                      <div
                        key={phaseDefinition.key}
                        style={{
                          border: phase.is_enabled ? '1px solid #18181b' : '1px solid #e4e4e7',
                          borderRadius: 12,
                          padding: 14,
                          background: phase.is_enabled ? '#fafafa' : '#ffffff',
                          boxShadow: phase.is_enabled ? '0 1px 2px rgba(24,24,27,0.08)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 600 }}>{phaseDefinition.label}</p>
                            <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
                              {phaseDefinition.required ? 'Phase obligatoire' : 'Phase optionnelle'}
                            </p>
                          </div>
                          <Switch
                            checked={phase.is_enabled}
                            disabled={phaseDefinition.required || !isEditingDetails || campaignStatus === 'open'}
                            onCheckedChange={(checked) => setPhaseEnabled(phaseDefinition.key, checked)}
                          />
                        </div>
                        {phase.is_enabled && (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e4e4e7' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                              <div>
                                <p style={{ margin: 0, fontWeight: 500 }}>Limiter cette phase à une période</p>
                                <p style={{ margin: '4px 0 0', color: '#71717a', fontSize: 13 }}>
                                  Définissez une fenêtre d&apos;activation pour cette phase.
                                </p>
                              </div>
                              <Switch
                                checked={phase.has_period_limit}
                                disabled={!isEditingDetails}
                                onCheckedChange={(checked) => setPhasePeriodLimited(phaseDefinition.key, checked)}
                              />
                            </div>
                            {phase.has_period_limit && (
                              <div className="grid grid-2" style={{ marginTop: 8 }}>
                                <div>
                                  <label>Date de début</label>
                                  <Input type="date" value={phase.start_date ?? ''} onChange={(event) => setPhaseDate(phaseDefinition.key, 'start_date', event.target.value)} disabled={!isEditingDetails} />
                                </div>
                                <div>
                                  <label>Date de fin</label>
                                  <Input type="date" value={phase.end_date ?? ''} onChange={(event) => setPhaseDate(phaseDefinition.key, 'end_date', event.target.value)} disabled={!isEditingDetails} />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                  {isLoadingDetails ? 'Chargement des informations initiales...' : isEditingDetails ? 'Modifiez puis enregistrez les informations.' : "Cliquez sur Modifier pour activer l'édition."}
                </p>
                <Button variant="secondary" onClick={() => void saveDetails()} disabled={isLoadingDetails || isSavingDetails || !isEditingDetails}>{isSavingDetails ? 'Enregistrement...' : 'Enregistrer les détails'}</Button>
              </div>
              {feedback && <p style={{ margin: 0, fontSize: 13, color: '#344054' }}>{feedback}</p>}
            </div>
          )}

          {step === 'audience' && (
            <div className="grid" style={{ gap: 16 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0 }}>Audience de la campagne</h2>
                <p style={{ margin: 0, color: '#71717a', fontSize: 14 }}>
                  Sélectionnez les pharmacies participantes qui auront accès à cette campagne.
                </p>
              </div>
              <div style={{ border: '1px solid #86efac', borderRadius: 14, padding: 14, background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 45%)' }}>
                <div style={{ marginBottom: 10, border: '1px solid #bbf7d0', borderRadius: 12, background: '#f7fee7', padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 13 }}>Règles d&apos;audience</p>
                  <p style={{ margin: '6px 0 0', color: '#365314', fontSize: 13 }}>1. Sélectionnez au moins une pharmacie active.</p>
                  <p style={{ margin: '4px 0 0', color: '#365314', fontSize: 13 }}>2. Validez l&apos;audience avant la validation finale.</p>
                </div>
                <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <div className="toolbar" style={{ marginBottom: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Pharmacies participantes</p>
                  <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>{selectedPharmacyIds.length} sélectionnée(s)</p>
                </div>
                <Input
                  placeholder="Rechercher une pharmacie..."
                  value={audienceSearch}
                  onChange={(event) => setAudienceSearch(event.target.value)}
                />
                <div
                  className="grid"
                  style={{
                    gap: 10,
                    marginTop: 12,
                    maxHeight: 360,
                    overflow: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {!filteredPharmacies.length && (
                    <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                      Aucune pharmacie active ne correspond à la recherche.
                    </p>
                  )}
                  {filteredPharmacies.map((pharmacy) => {
                    const checked = selectedPharmacyIds.includes(pharmacy.id);
                    return (
                      <label
                        key={pharmacy.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          border: checked ? '1px solid #18181b' : '1px solid #e4e4e7',
                          borderRadius: 10,
                          padding: '10px 12px',
                          background: checked ? '#fafafa' : '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ color: '#111827', fontSize: 14 }}>{pharmacy.name}</span>
                        <Checkbox checked={checked} onCheckedChange={() => togglePharmacy(pharmacy.id)} />
                      </label>
                    );
                  })}
                </div>
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                    Enregistrez la sélection pour mettre à jour les participants de la campagne.
                  </p>
                  <Button variant="secondary" onClick={() => void saveAudience()} disabled={isLoadingDetails || isSavingAudience}>
                    {isSavingAudience ? 'Enregistrement...' : "Enregistrer l'audience"}
                  </Button>
                </div>
                </div>
              </div>
              <div style={{ border: '1px dashed #d0d5dd', borderRadius: 12, padding: 14 }}>
                <p style={{ margin: 0, fontWeight: 600 }}>Aperçu audience</p>
                <p style={{ margin: '6px 0 0', color: '#667085' }}>
                  {selectedPharmacyIds.length} pharmacie(s) participeront à cette campagne.
                </p>
              </div>
            </div>
          )}

          {step === 'products' && (
            <div className="grid" style={{ gap: 16 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0 }}>Produits de la campagne</h2>
                <p style={{ margin: 0, color: '#71717a', fontSize: 14 }}>
                  Sélectionnez d'abord les produits, puis définissez l'arrangement campagne.
                </p>
              </div>

              <div style={{ border: '1px solid #86efac', borderRadius: 14, padding: 10, background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 45%)' }}>
                <div style={{ marginBottom: 10, border: '1px solid #bbf7d0', borderRadius: 12, background: '#f7fee7', padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 13 }}>Règles produits</p>
                  <p style={{ margin: '6px 0 0', color: '#365314', fontSize: 13 }}>1. Commencez par la sélection puis passez à l&apos;arrangement.</p>
                  <p style={{ margin: '4px 0 0', color: '#365314', fontSize: 13 }}>2. En mode personnalisé, BU/GROUP ne doivent pas être vides.</p>
                </div>
                <div style={{ display: 'flex', gap: 8, border: '1px solid #e4e4e7', borderRadius: 12, padding: 8 }}>
                  <Button variant={productsView === 'select' ? 'default' : 'secondary'} onClick={() => setProductsView('select')}>1. Sélection</Button>
                  <Button variant={productsView === 'arrange' ? 'default' : 'secondary'} onClick={() => setProductsView('arrange')} disabled={!selectedProductIds.length}>2. Arrangement</Button>
                </div>
              </div>

              {productsView === 'select' && (
                <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                  <div className="toolbar" style={{ marginBottom: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Sélection des produits</p>
                    <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>{selectedProductIds.length} sélectionné(s)</p>
                  </div>
                  <Input placeholder="Rechercher un produit..." value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
                  <div className="grid" style={{ gap: 10, marginTop: 12, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
                    {!laboratoryId && <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Sélectionnez d'abord un laboratoire dans Généralités.</p>}
                    {laboratoryId && !filteredProducts.length && <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Aucun produit actif ne correspond à la recherche.</p>}
                    {catalogTree?.business_units.filter(hasVisibleProductsInBu).map((bu) => (
                      <details key={bu.id} open style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: 10 }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>BU: {bu.name}</summary>
                        <div style={{ marginTop: 8 }}>
                          {bu.products.filter(isProductVisible).map((product) => {
                            const checked = selectedProductIds.includes(product.id);
                            return <label key={product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: checked ? '1px solid #18181b' : '1px solid #e4e4e7', borderRadius: 10, padding: '8px 10px', background: checked ? '#fafafa' : '#fff', cursor: 'pointer', marginBottom: 8 }}><span style={{ color: '#111827', fontSize: 14 }}>{product.designation}</span><Checkbox checked={checked} onCheckedChange={() => toggleProduct(product.id)} /></label>;
                          })}
                          {bu.group_brands.filter(hasVisibleProductsInGroup).map((group) => (
                            <details key={group.id} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10, marginTop: 8 }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>GROUP: {group.name}</summary>
                              <div style={{ marginTop: 8 }}>
                                {group.products.filter(isProductVisible).map((product) => {
                                  const checked = selectedProductIds.includes(product.id);
                                  return <label key={product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: checked ? '1px solid #18181b' : '1px solid #e4e4e7', borderRadius: 10, padding: '8px 10px', background: checked ? '#fafafa' : '#fff', cursor: 'pointer', marginBottom: 8 }}><span style={{ color: '#111827', fontSize: 14 }}>{product.designation}</span><Checkbox checked={checked} onCheckedChange={() => toggleProduct(product.id)} /></label>;
                                })}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
              )}

              {productsView === 'arrange' && (
                <>
                  <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                    <p style={{ marginTop: 0, marginBottom: 10, fontWeight: 600 }}>Mode d'arrangement</p>
                    <div className="grid" style={{ gap: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: arrangementMode === 'inherit_laboratory' ? '1px solid #18181b' : '1px solid #e4e4e7', borderRadius: 10, padding: '10px 12px', background: arrangementMode === 'inherit_laboratory' ? '#fafafa' : '#fff' }}>
                        <span style={{ color: '#111827', fontSize: 14 }}>Reprendre l'arrangement du laboratoire</span>
                        <Checkbox checked={arrangementMode === 'inherit_laboratory'} onCheckedChange={() => setArrangementMode('inherit_laboratory')} />
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: arrangementMode === 'custom' ? '1px solid #18181b' : '1px solid #e4e4e7', borderRadius: 10, padding: '10px 12px', background: arrangementMode === 'custom' ? '#fafafa' : '#fff' }}>
                        <span style={{ color: '#111827', fontSize: 14 }}>Créer un nouvel arrangement (BU / GROUP / PRODUIT)</span>
                        <Checkbox checked={arrangementMode === 'custom'} onCheckedChange={() => setArrangementMode('custom')} />
                      </label>
                    </div>
                  </div>

                  {arrangementMode === 'custom' && (
                    <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                      <p style={{ marginTop: 0, marginBottom: 12, fontWeight: 600 }}>Arrangement personnalisé</p>
                      <div className="toolbar" style={{ marginBottom: 12 }}>
                        <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Créez des conteneurs puis affectez les produits sélectionnés via "Ajouter des produits".</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Button variant="secondary" onClick={() => setIsCreateBuModalOpen(true)}>Créer BU</Button>
                          <Button variant="secondary" onClick={() => setIsCreateGroupModalOpen(true)}>Créer GROUP</Button>
                        </div>
                      </div>
                      <div className="grid" style={{ gap: 10 }}>
                        {!selectedProductIds.length && <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Sélectionnez des produits dans l'étape 1.</p>}
                        {(() => {
                          const rootProducts = selectedProductIds
                            .map((id) => managedProducts.find((product) => product.id === id))
                            .filter((product): product is CampaignManagedProduct => Boolean(product))
                            .filter((product) => {
                              const draft = getCampaignDraftForProduct(product.id);
                              return !draft.campaign_business_unit_id && !draft.campaign_group_brand_id;
                            });
                          return (
                            <details open style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: 10 }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Racine campagne (sans BU / GROUP)</summary>
                              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                <div className="toolbar">
                                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{rootProducts.length} produit(s) à la racine</p>
                                  <Button variant="secondary" onClick={() => openAssignModal({ buId: null, groupId: null, label: 'Racine campagne' })}>Ajouter des produits</Button>
                                </div>
                                {rootProducts.map((product) => (
                                  <div key={product.id} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                    <p style={{ margin: 0, fontSize: 14 }}>{product.designation}</p>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <Button variant="ghost" onClick={() => openMoveModal(product.id)}>Déplacer</Button>
                                      <Button variant="ghost" onClick={() => removeProductFromContainer(product.id)}>Retirer</Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          );
                        })()}

                        {businessUnits.map((bu) => {
                          const buProducts = selectedProductIds
                            .map((id) => managedProducts.find((product) => product.id === id))
                            .filter((product): product is CampaignManagedProduct => Boolean(product))
                            .filter((product) => {
                              const draft = getCampaignDraftForProduct(product.id);
                              return draft.campaign_business_unit_id === bu.id && !draft.campaign_group_brand_id;
                            });
                          const buGroups = groupBrands.filter((group) => group.campaign_business_unit_id === bu.id);
                          return (
                            <details key={bu.id} open style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: 10 }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>BU: {bu.name}</summary>
                              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                <div className="toolbar">
                                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{buProducts.length} produit(s) au niveau BU</p>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <Button variant="secondary" onClick={() => openAssignModal({ buId: bu.id, groupId: null, label: `BU ${bu.name}` })}>Ajouter des produits</Button>
                                    <Button variant="ghost" onClick={() => void removeBu(bu.id)}>Supprimer</Button>
                                  </div>
                                </div>
                                {buProducts.map((product) => (
                                  <div key={product.id} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                    <p style={{ margin: 0, fontSize: 14 }}>{product.designation}</p>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                      <Button variant="ghost" onClick={() => openMoveModal(product.id)}>Déplacer</Button>
                                      <Button variant="ghost" onClick={() => removeProductFromContainer(product.id)}>Retirer</Button>
                                    </div>
                                  </div>
                                ))}
                                {buGroups.map((group) => {
                                  const groupProducts = selectedProductIds
                                    .map((id) => managedProducts.find((product) => product.id === id))
                                    .filter((product): product is CampaignManagedProduct => Boolean(product))
                                    .filter((product) => getCampaignDraftForProduct(product.id).campaign_group_brand_id === group.id);
                                  return (
                                    <details key={group.id} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                      <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>GROUP: {group.name}</summary>
                                      <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                        <div className="toolbar">
                                          <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{groupProducts.length} produit(s)</p>
                                          <div style={{ display: 'flex', gap: 8 }}>
                                            <Button variant="secondary" onClick={() => openAssignModal({ buId: bu.id, groupId: group.id, label: `GROUP ${group.name}` })}>Ajouter des produits</Button>
                                            <Button variant="ghost" onClick={() => void removeGroup(group.id)}>Supprimer</Button>
                                          </div>
                                        </div>
                                        {groupProducts.map((product) => (
                                          <div key={product.id} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                            <p style={{ margin: 0, fontSize: 14 }}>{product.designation}</p>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                              <Button variant="ghost" onClick={() => openMoveModal(product.id)}>Déplacer</Button>
                                              <Button variant="ghost" onClick={() => removeProductFromContainer(product.id)}>Retirer</Button>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </details>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="toolbar" style={{ justifyContent: 'space-between' }}>
                <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                  Enregistrez la sélection des produits et leur arrangement pour cette campagne.
                </p>
                <Button variant="secondary" onClick={() => void saveProducts()} disabled={isLoadingDetails || isSavingProducts || !laboratoryId}>
                  {isSavingProducts ? 'Enregistrement...' : 'Enregistrer les produits'}
                </Button>
              </div>
            </div>
          )}

          {step === 'validation' && (
            <div className="grid" style={{ gap: 16 }}>
              <h2 style={{ margin: 0 }}>Validation avant ouverture</h2>
              <p style={{ margin: 0, color: '#475467' }}>Vérifiez les éléments puis ouvrez la campagne.</p>
              <div style={{ border: '1px solid #eaecf0', borderRadius: 12, padding: 14 }}>
                <p style={{ margin: 0 }}><strong>Nom:</strong> {name}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Laboratoire:</strong> {laboratories.find((lab) => lab.id === laboratoryId)?.designation ?? 'Non défini'}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Période:</strong> {startDate || 'Non défini'} → {endDate || 'Non défini'}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Phases actives:</strong> {phases.filter((phase) => phase.is_enabled).map((phase) => PHASE_DEFINITIONS.find((item) => item.key === phase.phase_key)?.label ?? phase.phase_key).join(', ') || 'Aucune'}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Pharmacies participantes:</strong> {selectedPharmacyIds.length}</p>
                <p style={{ margin: '6px 0 0' }}><strong>Produits sélectionnés:</strong> {selectedProductIds.length} ({arrangementMode === 'inherit_laboratory' ? 'arrangement laboratoire' : 'arrangement personnalisé'})</p>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#667085' }}>La campagne restera en brouillon jusqu&apos;à confirmation.</p>
            </div>
          )}

          {step === 'conditions' && (
            <div className="grid" style={{ gap: 16 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0 }}>Conditions</h2>
                <p style={{ margin: 0, color: '#71717a', fontSize: 14 }}>
                  Ajoutez une condition depuis chaque item (BU, GROUP, Produit), puis validez l&apos;ensemble.
                </p>
              </div>
              <div style={{ border: '1px solid #86efac', borderRadius: 14, padding: 14, background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 45%)' }}>
                <div style={{ marginBottom: 10 }}>
                  <label>Phase appliquée à toutes les conditions</label>
                  <Select value={conditionsPhase} onChange={(e) => setConditionsPhase(e.target.value as CampaignConditionPhase)}>
                    <option value="both">Intentions + BC</option>
                    <option value="purchase_intentions">Intentions</option>
                    <option value="purchase_orders">BC</option>
                  </Select>
                </div>
                <div style={{ marginBottom: 10, border: '1px solid #bbf7d0', borderRadius: 12, background: '#f7fee7', padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 13 }}>Règles d&apos;intégrité</p>
                  <p style={{ margin: '6px 0 0', color: '#365314', fontSize: 13 }}>1. Un item sans produit ne peut pas recevoir de condition.</p>
                  <p style={{ margin: '4px 0 0', color: '#365314', fontSize: 13 }}>2. Une même nature de condition ne peut exister qu&apos;une fois par item.</p>
                  <p style={{ margin: '4px 0 0', color: '#365314', fontSize: 13 }}>3. Les montants maximaux doivent rester cohérents dans la hiérarchie: Campagne ≥ BU ≥ GROUP ≥ Produit.</p>
                </div>
                {conditionsValidationReport.blocking.length ? (
                  <div style={{ marginBottom: 10, border: '1px solid #fecaca', borderRadius: 12, background: '#fff1f2', padding: '10px 12px' }}>
                    <div className="toolbar" style={{ gap: 10 }}>
                      <p style={{ margin: 0, fontWeight: 700, color: '#9f1239', fontSize: 13 }}>Erreurs bloquantes ({conditionsValidationReport.blocking.length})</p>
                      {conditionsValidationReport.blocking.length ? (
                        <Button
                          variant="secondary"
                          onClick={removeInvalidConditions}
                          style={{ borderColor: '#fca5a5', color: '#9f1239', fontWeight: 700 }}
                        >
                          Nettoyer les conditions invalides
                        </Button>
                      ) : null}
                    </div>
                    {conditionsValidationReport.blocking.slice(0, 5).map((issue, idx) => (
                      <p key={`blocking-${idx}`} style={{ margin: idx === 0 ? '6px 0 0' : '4px 0 0', color: '#9f1239', fontSize: 13 }}>{idx + 1}. {issue}</p>
                    ))}
                  </div>
                ) : null}
                {conditionsValidationReport.warnings.length ? (
                  <div style={{ marginBottom: 10, border: '1px solid #fde68a', borderRadius: 12, background: '#fffbeb', padding: '10px 12px' }}>
                    <p style={{ margin: 0, fontWeight: 700, color: '#92400e', fontSize: 13 }}>Alertes ({conditionsValidationReport.warnings.length})</p>
                    {conditionsValidationReport.warnings.slice(0, 5).map((issue, idx) => (
                      <p key={`warning-${idx}`} style={{ margin: idx === 0 ? '6px 0 0' : '4px 0 0', color: '#92400e', fontSize: 13 }}>{idx + 1}. {issue}</p>
                    ))}
                  </div>
                ) : null}
                <div className="grid" style={{ gap: 10 }}>
                      <details open style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Racine campagne</summary>
                    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                      <div className="toolbar">
                        <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                          {getConditionsForTarget({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null }).length} condition(s)
                        </p>
                        <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} disabled={!arrangedProducts.length} onClick={() => openConditionModal({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null, label: 'Racine campagne' })}>
                          Ajouter condition
                        </Button>
                      </div>
                      {getConditionsForTarget({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null }).map(({ condition, index }) => (
                        <div key={`campaign-condition-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                          <p style={{ margin: 0, fontSize: 14 }}>{condition.label}</p>
                          <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                        </div>
                      ))}

                      {selectedProductIds
                        .map((id) => managedProducts.find((product) => product.id === id))
                        .filter((product): product is CampaignManagedProduct => Boolean(product))
                        .filter((product) => {
                          const draft = getCampaignDraftForProduct(product.id);
                          return !draft.campaign_business_unit_id && !draft.campaign_group_brand_id;
                        })
                        .map((product) => {
                          const productConditions = getConditionsForTarget({ scope_type: 'product', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: product.id });
                          return (
                            <details key={`root-product-${product.id}`} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                              <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Produit: {product.designation}</summary>
                              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                <div className="toolbar">
                                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{productConditions.length} condition(s)</p>
                                    <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} onClick={() => openConditionModal({ scope_type: 'product', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: product.id, label: `Produit ${product.designation}` })}>Ajouter condition</Button>
                                </div>
                                {productConditions.map(({ condition, index }) => (
                                  <div key={`root-product-condition-${product.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                    <p style={{ margin: 0, fontSize: 14 }}>{condition.label}</p>
                                    <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                  </div>
                                ))}
                              </div>
                            </details>
                          );
                        })}
                    </div>
                  </details>

                  {businessUnits.map((bu) => {
                    const buConditions = getConditionsForTarget({ scope_type: 'business_unit', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: null });
                    const buProducts = selectedProductIds
                      .map((id) => managedProducts.find((product) => product.id === id))
                      .filter((product): product is CampaignManagedProduct => Boolean(product))
                      .filter((product) => {
                        const draft = getCampaignDraftForProduct(product.id);
                        return draft.campaign_business_unit_id === bu.id && !draft.campaign_group_brand_id;
                      });
                    const buGroups = groupBrands.filter((group) => group.campaign_business_unit_id === bu.id);

                    return (
                      <details key={bu.id} open style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>BU: {bu.name}</summary>
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          <div className="toolbar">
                            <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{buConditions.length} condition(s)</p>
                            <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} disabled={countProductsInBu(bu.id) === 0} onClick={() => openConditionModal({ scope_type: 'business_unit', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: null, label: `BU ${bu.name}` })}>Ajouter condition</Button>
                          </div>
                          {buConditions.map(({ condition, index }) => (
                            <div key={`bu-condition-${bu.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                              <p style={{ margin: 0, fontSize: 14 }}>{condition.label}</p>
                              <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                            </div>
                          ))}

                          {buProducts.map((product) => {
                            const productConditions = getConditionsForTarget({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: product.id });
                            return (
                              <details key={product.id} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Produit: {product.designation}</summary>
                                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                  <div className="toolbar">
                                    <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{productConditions.length} condition(s)</p>
                                    <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} onClick={() => openConditionModal({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: product.id, label: `Produit ${product.designation}` })}>Ajouter condition</Button>
                                  </div>
                                  {productConditions.map(({ condition, index }) => (
                                    <div key={`product-condition-${product.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                      <p style={{ margin: 0, fontSize: 14 }}>{condition.label}</p>
                                      <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            );
                          })}

                          {buGroups.map((group) => {
                            const groupConditions = getConditionsForTarget({ scope_type: 'group_brand', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: null });
                            const groupProducts = selectedProductIds
                              .map((id) => managedProducts.find((product) => product.id === id))
                              .filter((product): product is CampaignManagedProduct => Boolean(product))
                              .filter((product) => getCampaignDraftForProduct(product.id).campaign_group_brand_id === group.id);

                            return (
                              <details key={group.id} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>GROUP: {group.name}</summary>
                                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                  <div className="toolbar">
                                    <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{groupConditions.length} condition(s)</p>
                                    <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} disabled={countProductsInGroup(group.id) === 0} onClick={() => openConditionModal({ scope_type: 'group_brand', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: null, label: `GROUP ${group.name}` })}>Ajouter condition</Button>
                                  </div>
                                  {groupConditions.map(({ condition, index }) => (
                                    <div key={`group-condition-${group.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                      <p style={{ margin: 0, fontSize: 14 }}>{condition.label}</p>
                                      <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                    </div>
                                  ))}

                                  {groupProducts.map((product) => {
                                    const productConditions = getConditionsForTarget({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: product.id });
                                    return (
                                      <details key={product.id} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                        <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Produit: {product.designation}</summary>
                                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                          <div className="toolbar">
                                            <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{productConditions.length} condition(s)</p>
                                            <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} onClick={() => openConditionModal({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: product.id, label: `Produit ${product.designation}` })}>Ajouter condition</Button>
                                          </div>
                                          {productConditions.map(({ condition, index }) => (
                                            <div key={`product-group-condition-${product.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                              <p style={{ margin: 0, fontSize: 14 }}>{condition.label}</p>
                                              <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                            </div>
                                          ))}
                                        </div>
                                      </details>
                                    );
                                  })}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                    Enregistrez l&apos;ensemble des conditions pour cette campagne.
                  </p>
                  <Button variant="secondary" onClick={() => void saveConditionsStep()} disabled={isSavingConditions}>{isSavingConditions ? 'Enregistrement...' : 'Valider les conditions'}</Button>
                </div>
              </div>
            </div>
          )}

          {step === 'bonifications' && (
            <div className="grid" style={{ gap: 16 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <h2 style={{ margin: 0 }}>Bonifications</h2>
                <p style={{ margin: 0, color: '#71717a', fontSize: 14 }}>
                  Ajoutez une bonification depuis chaque item (BU, GROUP, Produit), puis validez l&apos;ensemble.
                </p>
              </div>
              <div style={{ border: '1px solid #86efac', borderRadius: 14, padding: 14, background: 'linear-gradient(180deg, #f0fdf4 0%, #ffffff 45%)' }}>
                <div style={{ marginBottom: 10, border: '1px solid #bbf7d0', borderRadius: 12, background: '#f7fee7', padding: '10px 12px' }}>
                  <p style={{ margin: 0, fontWeight: 700, color: '#166534', fontSize: 13 }}>Regles d&apos;integrite</p>
                  <p style={{ margin: '6px 0 0', color: '#365314', fontSize: 13 }}>1. Un item sans produit ne peut pas recevoir de bonification.</p>
                  <p style={{ margin: '4px 0 0', color: '#365314', fontSize: 13 }}>2. Une meme nature de bonification ne peut exister qu&apos;une fois par item.</p>
                </div>
                <div className="grid" style={{ gap: 10 }}>
                  <details open style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Racine campagne</summary>
                    <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                      <div className="toolbar">
                        <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{getBonificationsForTarget({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null }).length} bonification(s)</p>
                        <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} disabled={!arrangedProducts.length} onClick={() => openBonificationModal({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null, label: 'Racine campagne' })}>Ajouter bonification</Button>
                      </div>
                      {getBonificationsForTarget({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null }).map(({ bonification, index }) => (
                        <div key={`campaign-bonification-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                          <p style={{ margin: 0, fontSize: 14 }}>{bonification.label}</p>
                          <Button variant="ghost" onClick={() => setBonifications((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                        </div>
                      ))}
                    </div>
                  </details>
                  {businessUnits.map((bu) => {
                    const buBonifications = getBonificationsForTarget({ scope_type: 'business_unit', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: null });
                    const buProducts = selectedProductIds
                      .map((id) => managedProducts.find((product) => product.id === id))
                      .filter((product): product is CampaignManagedProduct => Boolean(product))
                      .filter((product) => {
                        const draft = getCampaignDraftForProduct(product.id);
                        return draft.campaign_business_unit_id === bu.id && !draft.campaign_group_brand_id;
                      });
                    const buGroups = groupBrands.filter((group) => group.campaign_business_unit_id === bu.id);
                    return (
                      <details key={`bonif-bu-${bu.id}`} open style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 10, background: '#ffffff' }}>
                        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>BU: {bu.name}</summary>
                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                          <div className="toolbar">
                            <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{buBonifications.length} bonification(s)</p>
                            <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} disabled={countProductsInBu(bu.id) === 0} onClick={() => openBonificationModal({ scope_type: 'business_unit', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: null, label: `BU ${bu.name}` })}>Ajouter bonification</Button>
                          </div>
                          {buBonifications.map(({ bonification, index }) => (
                            <div key={`bonif-bu-row-${bu.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                              <p style={{ margin: 0, fontSize: 14 }}>{bonification.label}</p>
                              <Button variant="ghost" onClick={() => setBonifications((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                            </div>
                          ))}
                          {buProducts.map((product) => {
                            const productBonifications = getBonificationsForTarget({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: product.id });
                            return (
                              <details key={`bonif-bu-product-${product.id}`} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Produit: {product.designation}</summary>
                                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                  <div className="toolbar">
                                    <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{productBonifications.length} bonification(s)</p>
                                    <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} onClick={() => openBonificationModal({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: null, product_id: product.id, label: `Produit ${product.designation}` })}>Ajouter bonification</Button>
                                  </div>
                                  {productBonifications.map(({ bonification, index }) => (
                                    <div key={`bonif-bu-product-row-${product.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                      <p style={{ margin: 0, fontSize: 14 }}>{bonification.label}</p>
                                      <Button variant="ghost" onClick={() => setBonifications((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            );
                          })}
                          {buGroups.map((group) => {
                            const groupBonifications = getBonificationsForTarget({ scope_type: 'group_brand', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: null });
                            const groupProducts = selectedProductIds
                              .map((id) => managedProducts.find((product) => product.id === id))
                              .filter((product): product is CampaignManagedProduct => Boolean(product))
                              .filter((product) => getCampaignDraftForProduct(product.id).campaign_group_brand_id === group.id);
                            return (
                              <details key={`bonif-group-${group.id}`} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>GROUP: {group.name}</summary>
                                <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                  <div className="toolbar">
                                    <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{groupBonifications.length} bonification(s)</p>
                                    <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} disabled={countProductsInGroup(group.id) === 0} onClick={() => openBonificationModal({ scope_type: 'group_brand', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: null, label: `GROUP ${group.name}` })}>Ajouter bonification</Button>
                                  </div>
                                  {groupBonifications.map(({ bonification, index }) => (
                                    <div key={`bonif-group-row-${group.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                      <p style={{ margin: 0, fontSize: 14 }}>{bonification.label}</p>
                                      <Button variant="ghost" onClick={() => setBonifications((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                    </div>
                                  ))}
                                  {groupProducts.map((product) => {
                                    const productBonifications = getBonificationsForTarget({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: product.id });
                                    return (
                                      <details key={`bonif-group-product-${product.id}`} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10 }}>
                                        <summary style={{ cursor: 'pointer', fontWeight: 500, color: '#374151' }}>Produit: {product.designation}</summary>
                                        <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                                          <div className="toolbar">
                                            <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{productBonifications.length} bonification(s)</p>
                                            <Button variant="default" style={{ background: '#16a34a', borderColor: '#15803d' }} onClick={() => openBonificationModal({ scope_type: 'product', campaign_business_unit_id: bu.id, campaign_group_brand_id: group.id, product_id: product.id, label: `Produit ${product.designation}` })}>Ajouter bonification</Button>
                                          </div>
                                          {productBonifications.map(({ bonification, index }) => (
                                            <div key={`bonif-group-product-row-${product.id}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                                              <p style={{ margin: 0, fontSize: 14 }}>{bonification.label}</p>
                                              <Button variant="ghost" onClick={() => setBonifications((current) => current.filter((_, i) => i !== index))}>Supprimer</Button>
                                            </div>
                                          ))}
                                        </div>
                                      </details>
                                    );
                                  })}
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </details>
                    );
                  })}
                </div>
                <div className="toolbar" style={{ marginTop: 12 }}>
                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Enregistrez l&apos;ensemble des bonifications pour cette campagne.</p>
                  <Button variant="secondary" onClick={() => void saveBonificationsStep()} disabled={isSavingBonifications}>{isSavingBonifications ? 'Enregistrement...' : 'Valider les bonifications'}</Button>
                </div>
              </div>
            </div>
          )}

          <div className="toolbar" style={{ marginTop: 20 }}>
            <Button variant="ghost" disabled={index === 0} onClick={() => setStep(STEP_ORDER[index - 1])}>Précédent</Button>
            <div style={{ display: 'flex', gap: 8 }}>
              {index < STEP_ORDER.length - 1 ? (
                <Button onClick={() => setStep(STEP_ORDER[index + 1])}>Étape suivante</Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Enregistrer en brouillon</Button>
                  <Button onClick={() => void validateCampaign()} disabled={isOpeningCampaign}>
                    {isOpeningCampaign ? 'Validation...' : 'Valider'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {conditionTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <Card style={{ width: 'min(620px, 92vw)' }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Ajouter condition · {conditionTarget.label}</h2>
              <Button variant="ghost" onClick={closeConditionModal}>Fermer</Button>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              {conditionModalError && (
                <div style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#9f1239', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>
                  {conditionModalError}
                </div>
              )}
              <div>
                <label>Nature de condition</label>
                <Select value={conditionDraft.condition_kind} onChange={(e) => handleConditionKindChange(e.target.value)}>
                  {currentConditionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </div>
              {currentConditionOption.requiresReferenceScope ? (
                <div>
                  <label>Référence du total (%)</label>
                  <Select value={conditionDraft.reference_scope_type ?? ''} onChange={(e) => setConditionDraft((c) => ({ ...c, reference_scope_type: (e.target.value as CampaignScopeType) || null }))}>
                    {currentConditionOption.allowedReferenceScopes.map((scope) => (
                      <option key={scope} value={scope}>{scope === 'campaign' ? 'Campagne' : scope === 'business_unit' ? 'BU' : 'GROUP'}</option>
                    ))}
                  </Select>
                </div>
              ) : null}
              <div className="grid grid-2" style={{ gap: 10 }}>
                <div><label>Opérateur</label><Input value={conditionDraft.operator} disabled /></div>
                <div><label>Valeur cible</label><Input type="number" min={0} max={isPercentConditionDraft ? 100 : undefined} step="0.001" value={conditionDraft.target_value} onChange={(e) => setConditionDraft((c) => ({ ...c, target_value: Number(e.target.value || 0) }))} /></div>
              </div>
              <div className="toolbar">
                <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{conditions.length} condition(s) au total</p>
                <Button variant="secondary" onClick={() => {
                  setConditionModalError(null);
                  if (!hasProductsForConditionTarget(conditionDraft)) {
                    return setConditionModalError('Impossible d\'ajouter une condition sur un item sans produit.');
                  }
                  if (conditionDraft.target_value <= 0) return setConditionModalError('La valeur cible doit être supérieure à 0.');
                  if (conditionDraft.unit === '%' && conditionDraft.target_value > 100) return setConditionModalError('Une valeur en pourcentage ne peut pas dépasser 100%.');
                  if (hasDuplicateConditionKindForTarget(conditionDraft)) {
                    return setConditionModalError('Cette nature de condition existe déjà pour cet item.');
                  }
                  const maxAmountError = validateMaxAmountConsistency(conditionDraft);
                  if (maxAmountError) return setConditionModalError(maxAmountError);
                  const hierarchyError = validateHierarchyConsistency(conditionDraft);
                  if (hierarchyError) return setConditionModalError(hierarchyError);
                  const row: CampaignCondition = { ...conditionDraft, phase: conditionsPhase, label: '' };
                  row.label = generateConditionLabel(row);
                  const report = validateConditionCollection([...conditions, row]);
                  if (report.blocking.length) return setConditionModalError(report.blocking[0]);
                  setConditions((current) => [...current, row]);
                  closeConditionModal();
                }}>
                  Ajouter la condition
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {bonificationTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <Card style={{ width: 'min(620px, 92vw)' }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Ajouter bonification · {bonificationTarget.label}</h2>
              <Button variant="ghost" onClick={closeBonificationModal}>Fermer</Button>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              {bonificationModalError && (
                <div style={{ border: '1px solid #fecaca', background: '#fff1f2', color: '#9f1239', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>
                  {bonificationModalError}
                </div>
              )}
              <div><label>Libelle</label><Input value={bonificationDraft.label} onChange={(e) => setBonificationDraft((b) => ({ ...b, label: e.target.value }))} /></div>
              {bonificationDraft.nature !== 'products' ? (
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <div><label>Valorisation</label><Select value={bonificationDraft.value_type} onChange={(e) => setBonificationDraft((b) => ({ ...b, value_type: e.target.value as BonificationValueType }))}><option value="percent">%</option><option value="amount">Montant</option></Select></div>
                  <div><label>Valeur</label><Input type="number" min={0} step="0.001" value={bonificationDraft.value} onChange={(e) => setBonificationDraft((b) => ({ ...b, value: Number(e.target.value || 0) }))} /></div>
                </div>
              ) : null}
              <div><label>Nature</label><Select value={bonificationDraft.nature} onChange={(e) => {
                const nextNature = e.target.value as BonificationNature;
                setBonificationDraft((b) => ({
                  ...b,
                  nature: nextNature,
                  cash_mode: nextNature === 'cash' ? (b.cash_mode ?? 'transfer') : null,
                  buy_qty_threshold: nextNature === 'products' ? (b.buy_qty_threshold ?? 6) : null,
                  free_qty: nextNature === 'products' ? (b.free_qty ?? 1) : null,
                  is_repeatable: nextNature === 'products' ? (b.is_repeatable ?? true) : null,
                }));
              }}><option value="purchase_voucher">Bons d'achat</option><option value="cash">Argent</option><option value="products">Produits en nature</option></Select></div>
              {bonificationDraft.nature === 'products' ? (
                <>
                  <div className="grid grid-2" style={{ gap: 10 }}>
                    <div><label>Acheter (X)</label><Input type="number" min={1} step={1} value={bonificationDraft.buy_qty_threshold ?? 6} onChange={(e) => setBonificationDraft((b) => ({ ...b, buy_qty_threshold: Number(e.target.value || 0) }))} /></div>
                    <div><label>Offert (Y)</label><Input type="number" min={1} step={1} value={bonificationDraft.free_qty ?? 1} onChange={(e) => setBonificationDraft((b) => ({ ...b, free_qty: Number(e.target.value || 0) }))} /></div>
                  </div>
                  <div>
                    <label>Application</label>
                    <Select value={bonificationDraft.is_repeatable ? 'repeatable' : 'once'} onChange={(e) => setBonificationDraft((b) => ({ ...b, is_repeatable: e.target.value === 'repeatable' }))}>
                      <option value="repeatable">Repeter la regle (ex: 12+2)</option>
                      <option value="once">Une seule fois</option>
                    </Select>
                  </div>
                  <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>
                    Apercu: {bonificationDraft.buy_qty_threshold ?? 0}+{bonificationDraft.free_qty ?? 0}
                  </p>
                </>
              ) : null}
              {bonificationDraft.nature === 'cash' ? (
                <div>
                  <label>Mode de paiement</label>
                  <Select value={bonificationDraft.cash_mode ?? 'transfer'} onChange={(e) => setBonificationDraft((b) => ({ ...b, cash_mode: e.target.value as BonificationCashMode }))}>
                    <option value="transfer">Virement</option>
                    <option value="check">Cheque</option>
                  </Select>
                </div>
              ) : null}
              <div className="toolbar">
                <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{bonifications.length} bonification(s) au total</p>
                <Button variant="secondary" onClick={() => {
                  setBonificationModalError(null);
                  if (!bonificationDraft.label.trim()) return setBonificationModalError('Le libelle de bonification est obligatoire.');
                  if (!hasProductsForConditionTarget(bonificationDraft)) return setBonificationModalError('Impossible d\'ajouter une bonification sur un item sans produit.');
                  if (bonificationDraft.nature !== 'products' && bonificationDraft.value <= 0) return setBonificationModalError('La valeur de la bonification doit etre superieure a 0.');
                  if (bonificationDraft.nature !== 'products' && bonificationDraft.value_type === 'percent' && bonificationDraft.value > 100) return setBonificationModalError('Une valeur en pourcentage ne peut pas depasser 100%.');
                  if (bonificationDraft.nature === 'cash' && !bonificationDraft.cash_mode) return setBonificationModalError('Selectionnez le mode de paiement pour la bonification en argent.');
                  if (bonificationDraft.nature === 'products') {
                    if (bonificationDraft.scope_type !== 'product') return setBonificationModalError('La gratuite produit est autorisee uniquement au niveau Produit.');
                    if (!Number.isInteger(bonificationDraft.buy_qty_threshold ?? 0) || (bonificationDraft.buy_qty_threshold ?? 0) <= 0) return setBonificationModalError('Le seuil acheter (X) doit etre un entier strictement positif.');
                    if (!Number.isInteger(bonificationDraft.free_qty ?? 0) || (bonificationDraft.free_qty ?? 0) <= 0) return setBonificationModalError('La quantite offerte (Y) doit etre un entier strictement positif.');
                  }
                  if (hasDuplicateBonificationNatureForTarget(bonificationDraft)) return setBonificationModalError('Cette nature de bonification existe deja pour cet item.');
                  const row: CampaignBonification = { ...bonificationDraft, label: '' };
                  row.label = generateBonificationLabel(row);
                  setBonifications((current) => [...current, row]);
                  closeBonificationModal();
                }}>
                  Ajouter la bonification
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {isCreateBuModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <Card style={{ width: 'min(460px, 92vw)' }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Créer une BU campagne</h2>
              <Button variant="ghost" onClick={() => setIsCreateBuModalOpen(false)}>Fermer</Button>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              <Input value={newBuName} onChange={(event) => setNewBuName(event.target.value)} placeholder="Nom de la BU" />
              <Button variant="secondary" onClick={() => void createBu()} disabled={isCreatingBu || !laboratoryId}>{isCreatingBu ? 'Création...' : 'Créer BU'}</Button>
            </div>
          </Card>
        </div>
      )}

      {isCreateGroupModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <Card style={{ width: 'min(520px, 92vw)' }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Créer un GROUP campagne</h2>
              <Button variant="ghost" onClick={() => setIsCreateGroupModalOpen(false)}>Fermer</Button>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              <Input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Nom du GROUP" />
              <Select value={newGroupBuId} onChange={(event) => setNewGroupBuId(event.target.value)}>
                <option value="">Affectation BU {businessUnits.length ? '(obligatoire)' : '(optionnelle)'}</option>
                {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
              </Select>
              <Button variant="secondary" onClick={() => void createGroup()} disabled={isCreatingGroup || !laboratoryId}>{isCreatingGroup ? 'Création...' : 'Créer GROUP'}</Button>
            </div>
          </Card>
        </div>
      )}

      {assignTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <Card style={{ width: 'min(760px, 94vw)', maxHeight: '86vh', overflow: 'auto' }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Ajouter des produits · {assignTarget.label}</h2>
              <Button variant="ghost" onClick={() => setAssignTarget(null)}>Fermer</Button>
            </div>
            <Input placeholder="Rechercher un produit sélectionné..." value={assignSearch} onChange={(event) => setAssignSearch(event.target.value)} />
            <div className="grid" style={{ gap: 8, marginTop: 10 }}>
              {assignableProducts.map((product) => {
                const checked = assignSelectedIds.includes(product.id);
                return (
                  <label key={product.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: checked ? '1px solid #18181b' : '1px solid #e4e4e7', borderRadius: 10, padding: '8px 10px', background: checked ? '#fafafa' : '#fff', cursor: 'pointer' }}>
                    <span>{product.designation}</span>
                    <Checkbox checked={checked} onCheckedChange={() => toggleAssignProduct(product.id)} />
                  </label>
                );
              })}
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>{assignSelectedIds.length} produit(s) prêt(s) à être affecté(s)</p>
              <Button variant="secondary" onClick={assignProductsToTarget} disabled={!assignSelectedIds.length}>Affecter</Button>
            </div>
          </Card>
        </div>
      )}

      {movingProductId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'grid', placeItems: 'center', zIndex: 50 }}>
          <Card style={{ width: 'min(520px, 92vw)' }}>
            <div className="toolbar">
              <h2 style={{ margin: 0 }}>Déplacer le produit</h2>
              <Button variant="ghost" onClick={() => setMovingProductId(null)}>Fermer</Button>
            </div>
            <div className="grid" style={{ gap: 10 }}>
              <div>
                <label>BU</label>
                <Select value={moveTargetBuId} onChange={(event) => { setMoveTargetBuId(event.target.value); setMoveTargetGroupId(''); }}>
                  <option value="">Racine campagne</option>
                  {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                </Select>
              </div>
              <div>
                <label>GROUP</label>
                <Select value={moveTargetGroupId} onChange={(event) => setMoveTargetGroupId(event.target.value)}>
                  <option value="">Aucun GROUP</option>
                  {groupBrands.filter((group) => group.campaign_business_unit_id === (moveTargetBuId || null)).map((group) => (
                    <option key={group.id} value={group.id}>{group.name}</option>
                  ))}
                </Select>
              </div>
              <Button variant="secondary" onClick={applyMoveProduct}>Appliquer le déplacement</Button>
            </div>
          </Card>
        </div>
      )}

      <div className="toast-stack">
        {toasts.map((toast) => (
          <Card key={toast.id} className="toast-success">{toast.message}</Card>
        ))}
      </div>
    </div>
  );
};







