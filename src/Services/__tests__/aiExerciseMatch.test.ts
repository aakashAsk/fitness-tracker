import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    distinctiveTokens,
    normalizeEquipment,
    pickBestMatch,
    resolveExercises,
    scoreCandidate,
    tokenize,
    type MatchCandidate,
    type MatchTarget,
    type SearchFilters,
} from '../aiExerciseMatch.ts';

const candidate = (
    id: string,
    name: string,
    equipment: string | null,
    primaryMuscles: string[],
): MatchCandidate => ({ id, name, equipment, primaryMuscles });

const inclineBench: MatchTarget = {
    name: 'Incline Barbell Bench Press',
    muscle: 'chest',
    equipment: 'Barbell',
};

test('tokenize lower-cases, splits on punctuation and singularises', () => {
    assert.deepEqual(tokenize('Barbell Incline Bench Press - Medium Grip'), [
        'barbell',
        'incline',
        'bench',
        'press',
        'medium',
        'grip',
    ]);
    assert.deepEqual(tokenize('Dumbbell Curls'), ['dumbbell', 'curl']);
    assert.deepEqual(tokenize('Chest Presses'), ['chest', 'press']);
});

test('tokenize expands abbreviations and drops filler words', () => {
    assert.deepEqual(tokenize('DB Row with a Pause'), ['dumbbell', 'row', 'pause']);
});

test('equipment text is mapped onto the library names', () => {
    assert.equal(normalizeEquipment('Body weight'), 'body only');
    assert.equal(normalizeEquipment('Dumbbells'), 'dumbbell');
    assert.equal(normalizeEquipment('Barbell'), 'barbell');
    assert.equal(normalizeEquipment('Kettlebell'), 'kettlebells');
    assert.equal(normalizeEquipment('something odd'), null);
    assert.equal(normalizeEquipment(null), null);
});

test('a verbose library name still matches the proposed one', () => {
    const match = pickBestMatch(inclineBench, [
        candidate('1', 'Barbell Incline Bench Press - Medium Grip', 'barbell', ['chest']),
    ]);
    assert.equal(match?.id, '1');
});

test('an unrelated exercise is not a match', () => {
    assert.equal(
        pickBestMatch(inclineBench, [candidate('2', 'Standing Calf Raise', 'machine', ['calves'])]),
        null,
    );
});

test('equipment breaks a tie: barbell bench beats dumbbell bench for a barbell plan', () => {
    const target: MatchTarget = { name: 'Bench Press', muscle: 'chest', equipment: 'Barbell' };
    const match = pickBestMatch(target, [
        candidate('db', 'Dumbbell Bench Press', 'dumbbell', ['chest']),
        candidate('bb', 'Barbell Bench Press - Medium Grip', 'barbell', ['chest']),
    ]);
    assert.equal(match?.id, 'bb');
});

test('the wrong equipment named in the exercise is not accepted', () => {
    const target: MatchTarget = { name: 'Dumbbell Bench Press', muscle: 'chest', equipment: 'Dumbbell' };
    assert.equal(
        pickBestMatch(target, [candidate('bb', 'Barbell Bench Press', 'barbell', ['chest'])]),
        null,
    );
});

test('the best-scoring candidate wins', () => {
    const match = pickBestMatch(inclineBench, [
        candidate('a', 'Bench Press', 'barbell', ['chest']),
        candidate('b', 'Barbell Incline Bench Press - Medium Grip', 'barbell', ['chest']),
        candidate('c', 'Incline Dumbbell Press', 'dumbbell', ['chest']),
    ]);
    assert.equal(match?.id, 'b');
});

test('scores stay within 0 and 1', () => {
    const score = scoreCandidate(
        inclineBench,
        candidate('x', 'Incline Barbell Bench Press', 'barbell', ['chest']),
    );
    assert.ok(score > 0.9 && score <= 1);
    assert.equal(
        scoreCandidate(inclineBench, candidate('y', '', null, [])),
        0,
    );
});

test('distinctive search words leave out equipment and take the longest two', () => {
    assert.deepEqual(distinctiveTokens('Incline Barbell Bench Press'), ['incline', 'bench']);
    assert.deepEqual(distinctiveTokens('Dumbbell Curl'), ['curl']);
});

// ── resolveExercises ────────────────────────────────────────────────────

test('resolveExercises returns matches in input order, null where none fit', async () => {
    const library = [
        candidate('1', 'Barbell Incline Bench Press - Medium Grip', 'barbell', ['chest']),
        candidate('2', 'Standing Calf Raise', 'machine', ['calves']),
    ];
    const search = async (filters: SearchFilters) =>
        library.filter((exercise) =>
            filters.search ? exercise.name.toLowerCase().includes(filters.search.toLowerCase()) : true,
        );

    const result = await resolveExercises(
        [
            inclineBench,
            { name: 'Zercher Squat Jump', muscle: 'quadriceps', equipment: 'barbell' },
        ],
        search,
    );
    assert.equal(result[0]?.id, '1');
    assert.equal(result[1], null);
});

test('resolveExercises only filters by a muscle the library knows', async () => {
    const seen: SearchFilters[] = [];
    await resolveExercises(
        [
            { name: 'Curl Thing', muscle: 'biceps', equipment: 'dumbbell' },
            { name: 'Other Thing', muscle: 'pectorals', equipment: 'dumbbell' },
        ],
        async (filters) => {
            seen.push(filters);
            return [];
        },
    );
    const scoped = seen.filter((f) => f.muscle !== undefined).map((f) => f.muscle);
    assert.ok(scoped.includes('biceps'));
    assert.ok(!scoped.includes('pectorals'));
});

test('resolveExercises shares identical queries between targets', async () => {
    let calls = 0;
    const target: MatchTarget = { name: 'Squat', muscle: 'quadriceps', equipment: 'barbell' };
    await resolveExercises([target, { ...target }], async () => {
        calls += 1;
        return [];
    });
    // One full-name query and one word query, each made once for both.
    assert.equal(calls, 2);
});

test('resolveExercises rejects when a search fails, rather than reporting no matches', async () => {
    await assert.rejects(
        () =>
            resolveExercises([inclineBench], async () => {
                throw new Error('offline');
            }),
        /offline/,
    );
});

test('resolveExercises never runs more than six searches at once', async () => {
    let active = 0;
    let peak = 0;
    const targets: MatchTarget[] = Array.from({ length: 12 }, (_, index) => ({
        name: `Movement${index} Variant${index}`,
        muscle: 'chest',
        equipment: 'barbell',
    }));
    await resolveExercises(targets, async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return [];
    });
    assert.ok(peak <= 6, `peak was ${peak}`);
    assert.ok(peak > 1);
});
