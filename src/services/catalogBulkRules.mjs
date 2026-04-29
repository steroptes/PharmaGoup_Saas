export const ensureNonEmptyIds = (ids, code) => {
  if (!ids.length) throw new Error(code);
};

export const validateBulkProductDestination = (targetBusinessUnitId, targetGroupBrandId) => {
  const destinations = Number(Boolean(targetBusinessUnitId)) + Number(Boolean(targetGroupBrandId));
  if (destinations !== 1) throw new Error('CATALOG_BULK_PRODUCTS_INVALID_TARGET');
};

export const validateGroupBrandBulkDeleteMode = (mode, relocateToBusinessUnitId, relocateToGroupBrandId) => {
  if (mode === 'delete_with_products') return;
  const destinations = Number(Boolean(relocateToBusinessUnitId)) + Number(Boolean(relocateToGroupBrandId));
  if (destinations !== 1) throw new Error('CATALOG_BULK_BRANDS_INVALID_RELOCATION');
};
