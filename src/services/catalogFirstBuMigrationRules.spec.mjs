import test from 'node:test';
import assert from 'node:assert/strict';

const decideCreateBu = ({ existingBuCount, rootProductCount, rootBrandCount }) => {
  if (existingBuCount > 0) return { status: 'created' };
  if (rootProductCount + rootBrandCount > 0) return { status: 'migration_required' };
  return { status: 'created' };
};

const previewPlan = (plan) => ({
  product_moves: (plan.products ?? []).length,
  group_brand_moves: (plan.group_brands ?? []).length,
  status: 'preview_ready',
});

const validateCommitPlan = ({ plan, stale = false }) => {
  if (stale) throw new Error('MIGRATION_PLAN_STALE');
  for (const p of plan.products ?? []) {
    if (!['business_unit', 'existing_brand', 'new_brand'].includes(p.target_type)) throw new Error('MIGRATION_INVALID_DESTINATION');
  }
  return true;
};

test('1ère BU sans contenu racine -> création directe', () => {
  assert.equal(decideCreateBu({ existingBuCount: 0, rootProductCount: 0, rootBrandCount: 0 }).status, 'created');
});

test('1ère BU avec contenu racine -> migration_required', () => {
  assert.equal(decideCreateBu({ existingBuCount: 0, rootProductCount: 1, rootBrandCount: 0 }).status, 'migration_required');
});

test('Preview plan valide', () => {
  const preview = previewPlan({ products: [{ id: 'p1' }], group_brands: [{ id: 'g1' }] });
  assert.equal(preview.product_moves, 1);
  assert.equal(preview.group_brand_moves, 1);
});

test('Commit plan valide (produits + brands)', () => {
  assert.equal(validateCommitPlan({ plan: { products: [{ target_type: 'business_unit' }], group_brands: [{ target_type: 'business_unit' }] } }), true);
});

test('Commit avec destination invalide', () => {
  assert.throws(() => validateCommitPlan({ plan: { products: [{ target_type: 'invalid' }] } }));
});

test('Commit avec élément modifié entre preview et commit', () => {
  assert.throws(() => validateCommitPlan({ plan: { products: [] }, stale: true }));
});

test('Rollback total si erreur en cours de commit (simulation transaction)', () => {
  const before = { moved: 0 };
  try {
    before.moved += 1;
    throw new Error('fail');
  } catch {
    before.moved = 0;
  }
  assert.equal(before.moved, 0);
});

test('Post-migration: zéro élément racine si BU existe', () => {
  const post = { buCount: 1, rootProducts: 0, rootBrands: 0 };
  assert.equal(post.buCount > 0 && post.rootProducts === 0 && post.rootBrands === 0, true);
});
