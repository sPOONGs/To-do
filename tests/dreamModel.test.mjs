import test from 'node:test';
import assert from 'node:assert/strict';
import { readDreamData, saveDreamLog, dreamDateKey, dailyEncouragement, encouragementCount, starterRecommendations } from '../dreamModel.ts';

const dream = () => ({ version: 1, goal: '개발자가 되기', logs: [], preparations: [] });
test('first launch is empty while corrupt or unknown data is rejected without a silent reset', () => {
  assert.equal(readDreamData(null).goal, '');
  for (const value of ['', '{', JSON.stringify({ ...dream(), version: 2 }), JSON.stringify({ ...dream(), logs: [{ date: '2026-02-30', text: '기록', goal: '꿈' }] })]) assert.throws(() => readDreamData(value));
});
test('saving one day twice updates its text and preserves the original goal and other days', () => {
  const first = saveDreamLog(dream(), '2026-09-22', '코드 만들기');
  const changedGoal = { ...saveDreamLog(first, '2026-09-23', '공부'), goal: '작가가 되기' };
  const edited = saveDreamLog(changedGoal, '2026-09-22', '  작은 코드 완성  ');
  assert.equal(edited.logs.length, 2);
  assert.equal(edited.logs[1].text, '작은 코드 완성');
  assert.equal(edited.logs[1].goal, '개발자가 되기');
  assert.equal(changedGoal.logs[1].text, '코드 만들기');
});
test('duplicate dates and preparation IDs cannot overwrite the saved collection', () => {
  const log = { date: '2026-09-22', text: '첫날', goal: '꿈' };
  const prep = { id: '1', title: '준비', done: false, createdAt: '2026-09-22T01:00:00Z' };
  assert.throws(() => readDreamData(JSON.stringify({ ...dream(), logs: [log, log] })));
  assert.throws(() => readDreamData(JSON.stringify({ ...dream(), preparations: [prep, prep] })));
});
test('encouragement changes by local calendar day, not elapsed hours', () => {
  const morning = new Date(2026, 8, 22, 0, 5);
  const evening = new Date(2026, 8, 22, 23, 55);
  const tomorrow = new Date(2026, 8, 23, 0, 5);
  assert.equal(dreamDateKey(morning), '2026-09-22');
  assert.equal(dailyEncouragement(morning), dailyEncouragement(evening));
  assert.notEqual(dailyEncouragement(morning), dailyEncouragement(tomorrow));
});
test('home and dream use different encouragements on the same day', () => {
  const today = new Date(2026, 8, 22, 12);
  const visibleQuotes = [
    dailyEncouragement(today, 'dream'),
    dailyEncouragement(today, 'home-primary'),
    dailyEncouragement(today, 'home-secondary'),
  ];
  assert.equal(new Set(visibleQuotes).size, visibleQuotes.length);
  assert.equal(encouragementCount, 50);
});
test('local suggestions are honest starters and only appear on empty schedule days', () => {
  const context = { goal: '개발자가 되기', date: new Date(2026, 8, 22), hasTodaySchedule: false };
  const result = starterRecommendations(context);
  assert.equal(result.length, 1); assert.equal(result[0].source, 'starter');
  assert.deepEqual(starterRecommendations({ ...context, hasTodaySchedule: true }), []);
  assert.deepEqual(starterRecommendations({ ...context, goal: '' }), []);
});
