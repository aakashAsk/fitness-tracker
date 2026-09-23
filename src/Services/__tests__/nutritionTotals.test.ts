import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumItemNutrition, toMealItem, type MealItem } from '../nutritionTotals.ts';

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

test('toMealItem keeps the nutrition estimate when reading a stored item back', () => {
  const nutrition = { calories: 250, protein: 12, carbs: 30, fat: 8, fiber: 4, sugar: 3, confidence: 0.8 };
  const item = toMealItem({ name: 'Oats', quantity: 80, unit: 'g', nutrition });
  assert.deepEqual(item.nutrition, nutrition);
  assert.equal(item.quantity, '80');
});

test('toMealItem omits nutrition entirely (no undefined key) when there is none', () => {
  const item = toMealItem({ name: 'Rice', quantity: '1', unit: 'cup' });
  assert.equal('nutrition' in item, false);
});

test('a logged meal read back from storage still sums into the day total', () => {
  const stored = [
    { name: 'Oats', quantity: '80', unit: 'g', nutrition: { calories: 300, protein: 10, carbs: 50, fat: 6, fiber: 8, sugar: 2, confidence: 0.9 } },
    { name: 'Milk', quantity: '200', unit: 'ml', nutrition: { calories: 100, protein: 7, carbs: 10, fat: 4, fiber: 0, sugar: 9, confidence: 0.9 } },
  ];
  const totals = sumItemNutrition(stored.map(toMealItem));
  assert.ok(totals);
  assert.equal(totals!.calories, 400);
  assert.equal(totals!.protein, 17);
  assert.equal(totals!.fiber, 8);
});
