import { test } from 'node:test';
import assert from 'node:assert/strict';
import { achievedMilestones, evaluateMilestones, type MilestoneInput } from '../milestoneService.ts';

const none: MilestoneInput = {
  totalWorkoutsLogged: 0,
  currentStreak: 0,
  hasRecentPersonalRecord: false,
  weeklyStepsTotal: 0,
};

test('evaluateMilestones returns all four, unachieved by default', () => {
  const milestones = evaluateMilestones(none);
  assert.equal(milestones.length, 4);
  assert.ok(milestones.every((m) => !m.achieved));
});

test('each milestone flips on at its own threshold', () => {
  assert.equal(
    evaluateMilestones({ ...none, totalWorkoutsLogged: 10 }).find((m) => m.id === 'first-10-workouts')
      ?.achieved,
    true,
  );
  assert.equal(
    evaluateMilestones({ ...none, totalWorkoutsLogged: 9 }).find((m) => m.id === 'first-10-workouts')
      ?.achieved,
    false,
  );
  assert.equal(
    evaluateMilestones({ ...none, currentStreak: 30 }).find((m) => m.id === 'thirty-day-streak')
      ?.achieved,
    true,
  );
  assert.equal(
    evaluateMilestones({ ...none, hasRecentPersonalRecord: true }).find(
      (m) => m.id === 'new-personal-record',
    )?.achieved,
    true,
  );
  assert.equal(
    evaluateMilestones({ ...none, weeklyStepsTotal: 100_000 }).find(
      (m) => m.id === 'hundred-k-steps-week',
    )?.achieved,
    true,
  );
  assert.equal(
    evaluateMilestones({ ...none, weeklyStepsTotal: 99_999 }).find(
      (m) => m.id === 'hundred-k-steps-week',
    )?.achieved,
    false,
  );
});

test('achievedMilestones only returns the reached ones', () => {
  const achieved = achievedMilestones({ ...none, totalWorkoutsLogged: 12, currentStreak: 5 });
  assert.deepEqual(
    achieved.map((m) => m.id),
    ['first-10-workouts'],
  );
});

test('achievedMilestones is empty when nothing has been reached', () => {
  assert.deepEqual(achievedMilestones(none), []);
});
