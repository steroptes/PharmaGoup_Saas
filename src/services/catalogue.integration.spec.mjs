import test from 'node:test';
import assert from 'node:assert/strict';

const shape = (tree) => ({
  buCount: tree.business_units.length,
  rootProducts: tree.root_products.length,
  rootBrands: tree.root_group_brands.length,
});

test('mode sans BU expose produits/group_brands racine', () => {
  const tree = { laboratory_id: 'lab', business_units: [], root_group_brands: [{ id: 'g', name: 'GB', products: [] }], root_products: [{ id: 'p', designation: 'P', nature: 'para' }] };
  assert.deepEqual(shape(tree), { buCount: 0, rootProducts: 1, rootBrands: 1 });
});

test('mode avec BU expose noeuds BU et pas de racine obligatoire', () => {
  const tree = { laboratory_id: 'lab', business_units: [{ id: 'bu1', name: 'BU1', products: [{ id: 'p', designation: 'P', nature: 'medicament' }], group_brands: [] }], root_group_brands: [], root_products: [] };
  assert.deepEqual(shape(tree), { buCount: 1, rootProducts: 0, rootBrands: 0 });
});
