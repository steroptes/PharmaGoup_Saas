export interface CatalogParentSelection {
  businessUnitId?: string | null;
  groupBrandId?: string | null;
}

export const validateSingleLogicalParent = ({ businessUnitId, groupBrandId }: CatalogParentSelection) => {
  const parentCount = Number(Boolean(businessUnitId)) + Number(Boolean(groupBrandId));
  if (parentCount > 1) {
    throw new Error('Un produit ne peut appartenir qu’à un seul parent logique.');
  }
};

export const validateRootAssignments = (hasBusinessUnits: boolean, parent: CatalogParentSelection) => {
  validateSingleLogicalParent(parent);
  if (hasBusinessUnits && !parent.businessUnitId && !parent.groupBrandId) {
    throw new Error('Impossible de rattacher un produit à la racine si le laboratoire possède des BU.');
  }
};

export const validateGroupBrandPlacement = (hasBusinessUnits: boolean, businessUnitId?: string | null) => {
  if (hasBusinessUnits && !businessUnitId) {
    throw new Error('Un group/brand doit être rattaché à une BU si le laboratoire contient des BU.');
  }
};
