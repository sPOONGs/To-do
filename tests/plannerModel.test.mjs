import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarKeywordSchedules, dateKey, dateLabel, parseDateKey, scheduleDateTime, scheduleDisplayTitle, readSchedules, readCategories, bindLegacyCategories } from '../plannerModel.ts';

const schedule = (fields = {}) => ({ id: 'appointment-1', date: '2026-9-1', time: '09:00', title: '책 읽기', category: '미지정', color: '#8FA6BB', ...fields });
const defaults = Array.from({ length: 4 }, (_, index) => ({ id: `category-${index}`, name: `이름 ${index}`, color: '#AAA4D6' }));
const invalid = date => Number.isNaN(date.getTime());

test('date keys accept both legacy and padded dates and preserve local calendar days', () => {
  const legacy = parseDateKey('2026-9-1');
  const padded = parseDateKey('2026-09-01');
  assert.equal(legacy.getTime(), padded.getTime());
  assert.equal(legacy.getHours(), 0);
  assert.equal(dateKey(padded), '2026-9-1');
  assert.equal(dateLabel(padded), '9월 1일');
  assert.equal(dateKey(parseDateKey('0099-1-2')), '0099-1-2');
});

test('leap dates are valid only in leap years and impossible dates never roll over', () => {
  for (const key of ['2024-2-29', '2000-02-29', '2026-4-30']) assert.equal(invalid(parseDateKey(key)), false, key);
  for (const key of ['2026-2-29', '1900-02-29', '2026-02-30', '2026-4-31', '2026-13-1', '2026-0-1', '2026-1-0', '2026-1-32', '0000-1-1', '2026/9/1', '2026-09-01T00:00:00Z', 'NaN-NaN-NaN', '']) assert.equal(invalid(parseDateKey(key)), true, key);
  assert.throws(() => dateKey(new Date(NaN)), RangeError);
  assert.throws(() => dateLabel(new Date(NaN)), RangeError);
});

test('schedule loading normalizes date and time without changing user content', () => {
  const original = schedule({ date: '2026-09-01', time: '9:5', title: '  남겨 둔 제목  ', keyword: '달빛', category: '직접 정한 이름', color: '#aaBbcC', mode: 'range', groupId: 'moon-range-1', completed: true, createdAt: 1700000000000 });
  const [loaded] = readSchedules(JSON.stringify([original]));
  assert.deepEqual(loaded, { ...original, date: '2026-9-1', time: '09:05' });
  assert.deepEqual(readSchedules(null), []);
  assert.deepEqual(readSchedules('[]'), []);
});

test('prototype date batches recover duration and multi-date modes without touching old singles', () => {
  const range = [1, 2, 3].map((day, index) => schedule({ id: `schedule-1700000000000-moon12-${index}`, date: `2026-9-${day}` }));
  const multi = [5, 12].map((day, index) => schedule({ id: `schedule-1700000000001-star34-${index}`, date: `2026-9-${day}` }));
  const single = schedule({ id: 'older-single' });
  const loaded = readSchedules(JSON.stringify([...range, ...multi, single]));
  assert.deepEqual(loaded.slice(0, 3).map(value => value.mode), ['range', 'range', 'range']);
  assert.equal(new Set(loaded.slice(0, 3).map(value => value.groupId)).size, 1);
  assert.deepEqual(loaded.slice(3, 5).map(value => value.mode), ['multi', 'multi']);
  assert.equal(loaded[5].mode, undefined);
});

test('schedule times stay local, including midnight and the last minute of the day', () => {
  for (const [time, hour, minute] of [['0:0', 0, 0], ['9:5', 9, 5], ['23:59', 23, 59]]) {
    const date = scheduleDateTime(schedule({ time }));
    assert.equal(dateKey(date), '2026-9-1');
    assert.equal(date.getHours(), hour);
    assert.equal(date.getMinutes(), minute);
    assert.equal(date.getSeconds(), 0);
  }
  for (const time of ['24:00', '12:60', '-1:00', '09:00:00', '오전 9시', '', '9']) {
    assert.equal(invalid(scheduleDateTime(schedule({ time }))), true, time);
    assert.throws(() => readSchedules(JSON.stringify([schedule({ time })])), undefined, time);
  }
  assert.equal(invalid(scheduleDateTime(schedule({ date: '2026-2-30' }))), true);
});

test('calendar keywords keep older schedules ahead at the same time', () => {
  const oldFirst = schedule({ id: 'old-first', keyword: '먼저', createdAt: 10 });
  const oldSecond = schedule({ id: 'old-second', keyword: '다음', createdAt: 20 });
  const newThird = schedule({ id: 'new-third', keyword: '새 일정', createdAt: 30 });
  const withoutKeyword = schedule({ id: 'plain-title', keyword: '' });
  assert.deepEqual(calendarKeywordSchedules([newThird, withoutKeyword, oldSecond, oldFirst]).map(value => value.id), ['old-first', 'old-second']);
  assert.equal(scheduleDisplayTitle(withoutKeyword), '책 읽기');
  assert.equal(scheduleDisplayTitle(oldFirst), '먼저');
});

test('invalid schedules reject the entire saved array instead of silently dropping records', () => {
  for (const fields of [{ id: '' }, { id: '  ' }, { title: ' ' }, { date: '2026-2-30' }, { keyword: 3 }, { category: null }, { color: '#abc' }, { color: '#12345678' }, { color: 'navy' }, { mode: 'repeat' }, { groupId: 3 }, { completed: 'yes' }, { createdAt: -1 }, { createdAt: 'now' }]) {
    assert.throws(() => readSchedules(JSON.stringify([schedule(), schedule({ id: 'second', ...fields })])));
  }
  for (const raw of ['', '{', '{}', 'null']) assert.throws(() => readSchedules(raw));
  assert.throws(() => readSchedules(JSON.stringify([schedule(), schedule()])));
});

test('category loading preserves order, names, colors, and duplicate colors', () => {
  const original = [...defaults].reverse().map((category, index) => ({ ...category, name: `나의 이름 ${index}`, color: '#aabbCC' }));
  assert.deepEqual(readCategories(JSON.stringify(original), defaults), original);
  const restoredDefaults = readCategories(null, defaults);
  assert.deepEqual(restoredDefaults, defaults);
  restoredDefaults[0].name = '변경';
  assert.equal(defaults[0].name, '이름 0');
  const eight = Array.from({ length: 8 }, (_, index) => ({ id: `${index}`, name: '동일한 이름', color: '#123456' }));
  assert.deepEqual(readCategories(JSON.stringify(eight), defaults), eight);
});

test('invalid category data never falls back to defaults or deletes part of the collection', () => {
  const read = categories => readCategories(JSON.stringify(categories), defaults);
  assert.throws(() => read([]));
  assert.throws(() => read(defaults.slice(0, 3)));
  assert.throws(() => read(Array.from({ length: 9 }, (_, index) => ({ ...defaults[0], id: `${index}` }))));
  assert.throws(() => read([defaults[0], defaults[0], defaults[2], defaults[3]]));
  for (const fields of [{ id: ' ' }, { name: '' }, { name: 1 }, { color: '#fff' }, { color: 'transparent' }]) assert.throws(() => read([{ ...defaults[0], ...fields }, ...defaults.slice(1)]));
  for (const raw of ['', '{', '{}', 'null']) assert.throws(() => readCategories(raw, defaults));
});

test('legacy category binding requires one exact name and case-insensitive color match', () => {
  const categories = [{ id: 'books', name: '독서', color: '#AaBbCc' }, { id: 'other', name: '독서', color: '#112233' }, { id: 'same-color', name: '공부', color: '#aabbcc' }];
  const original = schedule({ category: '독서', color: '#aAbBcC' });
  const [bound] = bindLegacyCategories([original], categories);
  assert.deepEqual(bound, { ...original, categoryId: 'books' });
  assert.equal(original.categoryId, undefined);
  for (const candidates of [[], [...categories, { id: 'duplicate', name: '독서', color: '#AABBCC' }]]) {
    assert.deepEqual(bindLegacyCategories([original], candidates), [{ ...original, categoryId: '' }]);
  }
});

test('explicit category IDs including unassigned survive binding and invalid IDs reject loading', () => {
  const original = [schedule({ categoryId: '' }), schedule({ id: 'second', categoryId: 'removed-category' })];
  assert.deepEqual(bindLegacyCategories(original, defaults), original);
  assert.deepEqual(readSchedules(JSON.stringify(original)), original);
  for (const categoryId of [null, 42, {}, []]) assert.throws(() => readSchedules(JSON.stringify([schedule({ categoryId })])));
});
