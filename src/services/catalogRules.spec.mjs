import test from 'node:test';
import assert from 'node:assert/strict';

const validateSingleLogicalParent = ({ businessUnitId, groupBrandId }) => {
  const parentCount = Number(Boolean(businessUnitId)) + Number(Boolean(groupBrandId));
  if (parentCount > 1) throw new Error('single-parent');
};

const validateRootAssignments = (hasBusinessUnits, parent) => {
  validateSingleLogicalParent(parent);
  if (hasBusinessUnits && !parent.businessUnitId && !parent.groupBrandId) {
    throw new Error('root-forbidden-with-bu');
  }
};

const validateGroupBrandPlacement = (hasBusinessUnits, businessUnitId) => {
  if (hasBusinessUnits && !businessUnitId) throw new Error('brand-must-have-bu');
};

test('accepts root product when no BU', () => {
  assert.doesNotThrow(() => validateRootAssignments(false, {}));
});

test('rejects root product when BU exists', () => {
  assert.throws(() => validateRootAssignments(true, {}));
});

test('rejects product with multiple logical parents', () => {
  assert.throws(() => validateSingleLogicalParent({ businessUnitId: 'a', groupBrandId: 'b' }));
});

test('rejects root group/brand when BU exists', () => {
  assert.throws(() => validateGroupBrandPlacement(true, null));
});
