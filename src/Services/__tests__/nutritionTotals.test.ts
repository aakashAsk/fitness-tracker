import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumItemNutrition, type MealItem } from '../nutritionTotals.ts';

function itemWith(nutrition: MealItem['nutrition']): MealItem {
  return { name: 'x', quantity: '1', unit: 'piece', nutrition };
}

test('sumItemNutrition returns null when no item has an estimate', () => {
  const items = [itemWith(undefined), itemWith(undefined)];
  assert.equal(sumItemNutrition(items), null);
});

test('sumItemNutrition sums only items with an estimate, ignoring the rest', () => {
  const items = [
    itemWith({ calories: 100, protein: 10, carbs: 5, fat: 2, fiber: 1, sugar: 1, confidence: 0.9 }),
    itemWith(undefined),
    itemWith({ calories: 200, protein: 20, carbs: 10, fat: 4, fiber: 2, sugar: 2, confidence: 0.6 }),
  ];
  const totals = sumItemNutrition(items);
  assert.ok(totals);
  assert.equal(totals!.calories, 300);
  assert.equal(totals!.protein, 30);
  assert.equal(totals!.estimated, 2);
  assert.equal(totals!.total, 3);
  // Lowest confidence among the counted items wins.
  assert.equal(totals!.confidence, 0.6);
});

test('sumItemNutrition over mixed planned/completed logs only counts what the caller passes in', () => {
  // The hook is responsible for filtering to state === 'completed'
  // before calling this — sumItemNutrition itself just sums whatever
  // item list it is given.
  const completedOnly = [
    itemWith({ calories: 50, protein: 5, carbs: 5, fat: 1, fiber: 0, sugar: 0, confidence: 1 }),
  ];
  const totals = sumItemNutrition(completedOnly);
  assert.ok(totals);
  assert.equal(totals!.calories, 50);
});
