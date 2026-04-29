export const ensureNonEmptyIds = (ids: string[], code: string) => {
  if (!ids.length) throw new Error(code);
};

export const validateBulkProductDestination = (targetBusinessUnitId?: string | null, targetGroupBrandId?: string | null) => {
  const destinations = Number(Boolean(targetBusinessUnitId)) + Number(Boolean(targetGroupBrandId));
  if (destinations !== 1) throw new Error('CATALOG_BULK_PRODUCTS_INVALID_TARGET');
};

export const validateGroupBrandBulkDeleteMode = (
  mode: 'delete_with_products' | 'relocate_products',
  relocateToBusinessUnitId?: string | null,
  relocateToGroupBrandId?: string | null,
) => {
  if (mode === 'delete_with_products') return;
  const destinations = Number(Boolean(relocateToBusinessUnitId)) + Number(Boolean(relocateToGroupBrandId));
  if (destinations !== 1) throw new Error('CATALOG_BULK_BRANDS_INVALID_RELOCATION');
};
