import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureNonEmptyIds, validateBulkProductDestination, validateGroupBrandBulkDeleteMode } from './catalogBulkRules.mjs';

test('move produits vers BU valide', () => {
  assert.doesNotThrow(() => validateBulkProductDestination('bu-1', null));
});

test('move produits vers brand valide', () => {
  assert.doesNotThrow(() => validateBulkProductDestination(null, 'gb-1'));
});

test('move produits vers destination invalide', () => {
  assert.throws(() => validateBulkProductDestination(null, null));
  assert.throws(() => validateBulkProductDestination('bu-1', 'gb-1'));
});

test('delete produits en masse requiert au moins 1 id', () => {
  assert.throws(() => ensureNonEmptyIds([], 'CATALOG_BULK_PRODUCTS_EMPTY'));
  assert.doesNotThrow(() => ensureNonEmptyIds(['p1'], 'CATALOG_BULK_PRODUCTS_EMPTY'));
});

test('delete brand + produits', () => {
  assert.doesNotThrow(() => validateGroupBrandBulkDeleteMode('delete_with_products'));
});

test('delete brand + relocalisation produits', () => {
  assert.doesNotThrow(() => validateGroupBrandBulkDeleteMode('relocate_products', 'bu-1', null));
  assert.doesNotThrow(() => validateGroupBrandBulkDeleteMode('relocate_products', null, 'gb-2'));
});

test('relocalisation invalide reject', () => {
  assert.throws(() => validateGroupBrandBulkDeleteMode('relocate_products', null, null));
  assert.throws(() => validateGroupBrandBulkDeleteMode('relocate_products', 'bu-1', 'gb-1'));
});
