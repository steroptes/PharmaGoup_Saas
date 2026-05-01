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
  const [conditionsPhase, setConditionsPhase] = useState<CampaignConditionPhase>('both');
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
          setPhases(
            DEFAULT_PHASES.map((phase) => ({
              ...phase,
              ...byKey.get(phase.phase_key),
            })),
          );
        } else {
          setPhases(DEFAULT_PHASES);
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

  const saveDetails = async () => {
    if (!campaignId) return;
    if (!name.trim() || !laboratoryId || !startDate || !endDate) return setFeedback('Tous les champs de la section Détails sont obligatoires.');
    if (endDate < startDate) return setFeedback('La date de clôture doit être supérieure ou égale à la date d’ouverture.');
    const deliveryNotesPhase = phases.find((phase) => phase.phase_key === 'delivery_notes');
    if (!deliveryNotesPhase?.is_enabled) return setFeedback('La phase "Collecte des bons de livraisons" est obligatoire.');

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
      setFeedback(error instanceof Error ? error.message : 'Enregistrement de l’audience impossible.');
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
    if (!campaignId) return { busByName: new Map<string, string>(), groupsByKey: new Map<string, string>() };
    const locationMap = buildProductLocationMap();
    const busByName = new Map<string, string>(businessUnits.map((bu) => [bu.name.toLowerCase(), bu.id]));
    const groupsByKey = new Map<string, string>(
      groupBrands.map((group) => [`${(group.campaign_business_unit_id ?? 'root')}::${group.name.toLowerCase()}`, group.id]),
    );

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
    }

    await loadProductScopeData(laboratoryId);
    return { busByName, groupsByKey };
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

    setIsSavingProducts(true);
    setFeedback(null);
    try {
      let inheritLookup: { busByName: Map<string, string>; groupsByKey: Map<string, string> } | null = null;
      if (arrangementMode === 'inherit_laboratory') {
        inheritLookup = await ensureCampaignContainersFromLaboratory();
      }

      const locationMap = buildProductLocationMap();
      const arrangements: CampaignProductArrangementRow[] = selectedProductIds.map((productId) => {
        if (arrangementMode === 'inherit_laboratory') {
          const location = locationMap.get(productId);
          const buId = location?.buName ? (inheritLookup?.busByName.get(location.buName.toLowerCase()) ?? null) : null;
          const groupId = location?.groupName ? (inheritLookup?.groupsByKey.get(`${buId ?? 'root'}::${location.groupName.toLowerCase()}`) ?? null) : null;
          return {
            product_id: productId,
            campaign_business_unit_id: buId,
            campaign_group_brand_id: groupId,
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
    setIsSavingConditions(true);
    setFeedback(null);
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

  const currentConditionOptions = CONDITION_KIND_OPTIONS_BY_SCOPE[conditionDraft.scope_type];
  const currentConditionOption = currentConditionOptions.find((option) => option.value === conditionDraft.condition_kind) ?? currentConditionOptions[0];
  const isPercentConditionDraft = conditionDraft.unit === '%';
  const handleConditionScopeChange = (nextScope: CampaignScopeType) => {
    const firstOption = CONDITION_KIND_OPTIONS_BY_SCOPE[nextScope][0];
    setConditionDraft((current) => ({
      ...current,
      scope_type: nextScope,
      campaign_business_unit_id: null,
      campaign_group_brand_id: null,
      product_id: null,
      condition_kind: firstOption.value,
      operator: firstOption.operator,
      unit: firstOption.unit,
      reference_scope_type: firstOption.requiresReferenceScope ? (firstOption.allowedReferenceScopes[0] ?? null) : null,
    }));
  };

  const handleConditionKindChange = (nextKind: string) => {
    const nextOption = currentConditionOptions.find((option) => option.value === nextKind);
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

  const conditionGroups = [
    { key: 'campaign' as CampaignScopeType, label: 'Campagne' },
    { key: 'business_unit' as CampaignScopeType, label: 'BU' },
    { key: 'group_brand' as CampaignScopeType, label: 'GROUP' },
    { key: 'product' as CampaignScopeType, label: 'Produit' },
  ].map((group) => ({
    ...group,
    items: conditions
      .map((condition, index) => ({ condition, index }))
      .filter((entry) => entry.condition.scope_type === group.key),
  })).filter((group) => group.items.length > 0);

  const getConditionItemLabel = (row: CampaignCondition) => {
    if (row.scope_type === 'campaign') return 'Campagne';
    if (row.scope_type === 'business_unit') {
      const buName = row.campaign_business_unit_id
        ? (businessUnits.find((bu) => bu.id === row.campaign_business_unit_id)?.name ?? 'BU')
        : 'BU non définie';
      return `BU: ${buName}`;
    }
    if (row.scope_type === 'group_brand') {
      const groupName = row.campaign_group_brand_id
        ? (groupBrands.find((group) => group.id === row.campaign_group_brand_id)?.name ?? 'GROUP')
        : 'GROUP non défini';
      return `GROUP: ${groupName}`;
    }
    const productName = row.product_id
      ? (managedProducts.find((product) => product.id === row.product_id)?.designation ?? 'Produit')
      : 'Produit non défini';
    return `Produit: ${productName}`;
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
                    {isEditingDetails ? 'Terminer l’édition' : 'Modifier'}
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
              <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <p style={{ marginTop: 0, marginBottom: 12, fontWeight: 600 }}>Phases de la campagne</p>
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
                            disabled={phaseDefinition.required || !isEditingDetails}
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
                  {isLoadingDetails ? 'Chargement des informations initiales...' : isEditingDetails ? 'Modifiez puis enregistrez les informations.' : 'Cliquez sur Modifier pour activer l’édition.'}
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
                    {isSavingAudience ? 'Enregistrement...' : 'Enregistrer l’audience'}
                  </Button>
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
                  Sélectionnez d’abord les produits, puis définissez l’arrangement campagne.
                </p>
              </div>

              <div style={{ display: 'flex', gap: 8, border: '1px solid #e4e4e7', borderRadius: 12, padding: 8 }}>
                <Button variant={productsView === 'select' ? 'default' : 'secondary'} onClick={() => setProductsView('select')}>1. Sélection</Button>
                <Button variant={productsView === 'arrange' ? 'default' : 'secondary'} onClick={() => setProductsView('arrange')} disabled={!selectedProductIds.length}>2. Arrangement</Button>
              </div>

              {productsView === 'select' && (
                <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                  <div className="toolbar" style={{ marginBottom: 12 }}>
                    <p style={{ margin: 0, fontWeight: 600 }}>Sélection des produits</p>
                    <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>{selectedProductIds.length} sélectionné(s)</p>
                  </div>
                  <Input placeholder="Rechercher un produit..." value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
                  <div className="grid" style={{ gap: 10, marginTop: 12, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
                    {!laboratoryId && <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Sélectionnez d’abord un laboratoire dans Généralités.</p>}
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
                    <p style={{ marginTop: 0, marginBottom: 10, fontWeight: 600 }}>Mode d’arrangement</p>
                    <div className="grid" style={{ gap: 10 }}>
                      <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: arrangementMode === 'inherit_laboratory' ? '1px solid #18181b' : '1px solid #e4e4e7', borderRadius: 10, padding: '10px 12px', background: arrangementMode === 'inherit_laboratory' ? '#fafafa' : '#fff' }}>
                        <span style={{ color: '#111827', fontSize: 14 }}>Reprendre l’arrangement du laboratoire</span>
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
                  Ajoutez les conditions ligne par ligne, puis validez l&apos;ensemble.
                </p>
              </div>
              <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <div className="toolbar" style={{ marginBottom: 12 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Nouvelle condition</p>
                  <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>Saisie ligne par ligne</p>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label>Phase appliquée à toutes les conditions</label>
                  <Select value={conditionsPhase} onChange={(e) => setConditionsPhase(e.target.value as CampaignConditionPhase)}>
                    <option value="both">Intentions + BC</option>
                    <option value="purchase_intentions">Intentions</option>
                    <option value="purchase_orders">BC</option>
                  </Select>
                </div>
                <div style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: 10, background: '#fafafa' }}>
                  <div className="grid" style={{ gap: 10 }}>
                    <div className="grid grid-2" style={{ gap: 10 }}>
                      <div><label>Cible</label><Select value={conditionDraft.scope_type} onChange={(e) => handleConditionScopeChange(e.target.value as CampaignScopeType)}><option value="campaign">Campagne</option><option value="business_unit">BU</option><option value="group_brand">GROUP</option><option value="product">Produit</option></Select></div>
                      <div><label>Nature de condition</label><Select value={conditionDraft.condition_kind} onChange={(e) => handleConditionKindChange(e.target.value)}>{currentConditionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></div>
                    </div>
                    {conditionDraft.scope_type === 'business_unit' || conditionDraft.scope_type === 'group_brand' || conditionDraft.scope_type === 'product' ? (
                      <div><label>BU</label><Select value={conditionDraft.campaign_business_unit_id ?? ''} onChange={(e) => setConditionDraft((c) => ({ ...c, campaign_business_unit_id: e.target.value || null, campaign_group_brand_id: null, product_id: null }))}><option value="">Sélectionner</option>{businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}</Select></div>
                    ) : null}
                    {conditionDraft.scope_type === 'group_brand' || conditionDraft.scope_type === 'product' ? (
                      <div><label>GROUP</label><Select value={conditionDraft.campaign_group_brand_id ?? ''} onChange={(e) => setConditionDraft((c) => ({ ...c, campaign_group_brand_id: e.target.value || null, product_id: null }))}><option value="">Sélectionner</option>{groupBrands.filter((g) => g.campaign_business_unit_id === (conditionDraft.campaign_business_unit_id ?? null)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</Select></div>
                    ) : null}
                    {conditionDraft.scope_type === 'product' ? (
                      <div><label>Produit</label><Select value={conditionDraft.product_id ?? ''} onChange={(e) => setConditionDraft((c) => ({ ...c, product_id: e.target.value || null }))}><option value="">Sélectionner</option>{selectedProductIds.map((id) => managedProducts.find((p) => p.id === id)).filter((p): p is CampaignManagedProduct => Boolean(p)).map((p) => <option key={p.id} value={p.id}>{p.designation}</option>)}</Select></div>
                    ) : null}
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
                    <div>
                      <Button variant="secondary" onClick={() => {
                        if (conditionDraft.scope_type === 'business_unit' && !conditionDraft.campaign_business_unit_id) return setFeedback('Sélectionnez une BU cible.');
                        if (conditionDraft.scope_type === 'group_brand' && !conditionDraft.campaign_group_brand_id) return setFeedback('Sélectionnez un GROUP cible.');
                        if (conditionDraft.scope_type === 'product' && !conditionDraft.product_id) return setFeedback('Sélectionnez un produit cible.');
                        if (conditionDraft.target_value <= 0) return setFeedback('La valeur cible doit être supérieure à 0.');
                        if (conditionDraft.unit === '%' && conditionDraft.target_value > 100) return setFeedback('Une valeur en pourcentage ne peut pas dépasser 100%.');
                        const maxAmountError = validateMaxAmountConsistency(conditionDraft);
                        if (maxAmountError) return setFeedback(maxAmountError);
                        const row: CampaignCondition = { ...conditionDraft, phase: conditionsPhase, label: '' };
                        row.label = generateConditionLabel(row);
                        setConditions((current) => [...current, row]);
                        const nextDefault = CONDITION_KIND_OPTIONS_BY_SCOPE.campaign[0];
                        setConditionDraft({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null, phase: conditionsPhase, condition_kind: nextDefault.value, reference_scope_type: null, label: '', operator: nextDefault.operator, target_value: 0, unit: nextDefault.unit });
                      }}>Appliquer la condition</Button>
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <div className="toolbar" style={{ marginBottom: 8 }}>
                  <p style={{ margin: 0, fontWeight: 600 }}>Conditions saisies</p>
                  <p style={{ margin: 0, color: '#71717a', fontSize: 13 }}>{conditions.length} condition(s)</p>
                </div>
                <p style={{ marginTop: 0, marginBottom: 10, color: '#667085', fontSize: 13 }}>
                  Le libellé est généré automatiquement selon la cible, la nature, l&apos;opérateur et la valeur.
                </p>
                <div className="grid" style={{ gap: 10 }}>
                  {conditionGroups.map((group) => (
                    <details key={group.key} open style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: 10, background: '#fafafa' }}>
                      <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#374151' }}>
                        {group.label} ({group.items.length})
                      </summary>
                      <div className="grid" style={{ gap: 8 }}>
                        {Object.entries(
                          group.items.reduce<Record<string, Array<{ condition: CampaignCondition; index: number }>>>((acc, entry) => {
                            const key = getConditionItemLabel(entry.condition);
                            if (!acc[key]) acc[key] = [];
                            acc[key].push(entry);
                            return acc;
                          }, {}),
                        ).map(([itemLabel, entries]) => (
                          <details key={`${group.key}-${itemLabel}`} style={{ border: '1px dashed #d4d4d8', borderRadius: 10, padding: 10, background: '#fff', marginTop: 8 }}>
                            <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#52525b' }}>
                              {itemLabel} ({entries.length})
                            </summary>
                            <div className="grid" style={{ gap: 8 }}>
                              {entries.map(({ condition, index }) => (
                                <div key={`${condition.label}-${index}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 10, padding: '8px 10px', background: '#fff', marginTop: 8 }}>
                                  <p style={{ margin: 0, fontSize: 14 }}>{index + 1}. {condition.label}</p>
                                  <Button variant="ghost" onClick={() => setConditions((current) => current.filter((_, i) => i !== index))}>Retirer</Button>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
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
              <h2 style={{ margin: 0 }}>Bonifications</h2>
              <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <p style={{ marginTop: 0, marginBottom: 10, fontWeight: 600 }}>Nouvelle bonification</p>
                <div className="grid grid-2" style={{ gap: 10 }}>
                  <div><label>Libellé</label><Input value={bonificationDraft.label} onChange={(e) => setBonificationDraft((b) => ({ ...b, label: e.target.value }))} /></div>
                  <div><label>Portée</label><Select value={bonificationDraft.scope_type} onChange={(e) => setBonificationDraft((b) => ({ ...b, scope_type: e.target.value as CampaignScopeType, campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null }))}><option value="campaign">Campagne</option><option value="business_unit">BU</option><option value="group_brand">GROUP</option><option value="product">Produit</option></Select></div>
                  <div><label>Valorisation</label><Select value={bonificationDraft.value_type} onChange={(e) => setBonificationDraft((b) => ({ ...b, value_type: e.target.value as BonificationValueType }))}><option value="percent">%</option><option value="amount">Montant</option></Select></div>
                  <div><label>Valeur</label><Input type="number" min={0} step="0.001" value={bonificationDraft.value} onChange={(e) => setBonificationDraft((b) => ({ ...b, value: Number(e.target.value || 0) }))} /></div>
                  <div><label>Nature</label><Select value={bonificationDraft.nature} onChange={(e) => setBonificationDraft((b) => ({ ...b, nature: e.target.value as BonificationNature }))}><option value="purchase_voucher">Bons d'achat</option><option value="cash">Argent</option><option value="products">Produits</option></Select></div>
                </div>
                {bonificationDraft.scope_type === 'business_unit' || bonificationDraft.scope_type === 'group_brand' || bonificationDraft.scope_type === 'product' ? (
                  <div style={{ marginTop: 10 }}>
                    <label>BU</label>
                    <Select value={bonificationDraft.campaign_business_unit_id ?? ''} onChange={(e) => setBonificationDraft((b) => ({ ...b, campaign_business_unit_id: e.target.value || null, campaign_group_brand_id: null, product_id: null }))}>
                      <option value="">Sélectionner</option>
                      {businessUnits.map((bu) => <option key={bu.id} value={bu.id}>{bu.name}</option>)}
                    </Select>
                  </div>
                ) : null}
                {bonificationDraft.scope_type === 'group_brand' || bonificationDraft.scope_type === 'product' ? (
                  <div style={{ marginTop: 10 }}>
                    <label>GROUP</label>
                    <Select value={bonificationDraft.campaign_group_brand_id ?? ''} onChange={(e) => setBonificationDraft((b) => ({ ...b, campaign_group_brand_id: e.target.value || null, product_id: null }))}>
                      <option value="">Sélectionner</option>
                      {groupBrands.filter((g) => g.campaign_business_unit_id === (bonificationDraft.campaign_business_unit_id ?? null)).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </Select>
                  </div>
                ) : null}
                {bonificationDraft.scope_type === 'product' ? (
                  <div style={{ marginTop: 10 }}>
                    <label>Produit</label>
                    <Select value={bonificationDraft.product_id ?? ''} onChange={(e) => setBonificationDraft((b) => ({ ...b, product_id: e.target.value || null }))}>
                      <option value="">Sélectionner</option>
                      {selectedProductIds.map((id) => managedProducts.find((p) => p.id === id)).filter((p): p is CampaignManagedProduct => Boolean(p)).map((p) => <option key={p.id} value={p.id}>{p.designation}</option>)}
                    </Select>
                  </div>
                ) : null}
                <div style={{ marginTop: 12 }}>
                  <Button variant="secondary" onClick={() => {
                    if (!bonificationDraft.label.trim()) return setFeedback('Le libellé de bonification est obligatoire.');
                    setBonifications((current) => [...current, { ...bonificationDraft, label: bonificationDraft.label.trim() }]);
                    setBonificationDraft({ scope_type: 'campaign', campaign_business_unit_id: null, campaign_group_brand_id: null, product_id: null, label: '', value_type: 'percent', value: 0, nature: 'purchase_voucher' });
                  }}>Ajouter la bonification</Button>
                </div>
              </div>
              <div style={{ border: '1px solid #e4e4e7', borderRadius: 12, padding: 14 }}>
                <p style={{ marginTop: 0, marginBottom: 8, fontWeight: 600 }}>Bonifications définies ({bonifications.length})</p>
                <div className="grid" style={{ gap: 8 }}>
                  {bonifications.map((bonification, idx) => (
                    <div key={`${bonification.label}-${idx}`} className="toolbar" style={{ border: '1px solid #e4e4e7', borderRadius: 8, padding: '6px 8px' }}>
                      <p style={{ margin: 0, fontSize: 14 }}>{bonification.label} · {bonification.value_type === 'percent' ? `${bonification.value}%` : bonification.value} · {bonification.nature}</p>
                      <Button variant="ghost" onClick={() => setBonifications((current) => current.filter((_, i) => i !== idx))}>Retirer</Button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Button variant="secondary" onClick={() => void saveBonificationsStep()} disabled={isSavingBonifications}>{isSavingBonifications ? 'Enregistrement...' : 'Enregistrer les bonifications'}</Button>
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
                  <Button>Valider et ouvrir</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

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
