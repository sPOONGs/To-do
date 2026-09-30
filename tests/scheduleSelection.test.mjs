import assert from 'node:assert/strict';
import test from 'node:test';
import { expandScheduleDates, isDateInSelection, selectScheduleDate } from '../scheduleSelection.ts';

test('single and multi selections keep exact local calendar dates', () => {
  assert.deepEqual(selectScheduleDate('single', ['2026-9-1'], '2026-9-4'), ['2026-9-4']);
  const selected = selectScheduleDate('multi', ['2026-9-19', '2026-9-4'], '2026-9-15');
  assert.deepEqual(selected, ['2026-9-4', '2026-9-15', '2026-9-19']);
  assert.deepEqual(selectScheduleDate('multi', selected, '2026-9-15'), ['2026-9-4', '2026-9-19']);
});

test('range selection expands inclusively across month and leap-day boundaries', () => {
  const endpoints = selectScheduleDate('range', ['2028-2-28'], '2028-3-1');
  assert.deepEqual(expandScheduleDates('range', endpoints), ['2028-2-28', '2028-2-29', '2028-3-1']);
  assert.equal(isDateInSelection('range', endpoints, '2028-2-29'), true);
  assert.equal(isDateInSelection('range', endpoints, '2028-3-2'), false);
});

test('unfinished and excessive ranges are rejected without partial creation', () => {
  assert.deepEqual(expandScheduleDates('range', ['2026-9-15']), []);
  assert.deepEqual(expandScheduleDates('range', ['2026-1-1', '2027-12-31']), []);
});

test('one leap year is allowed while multi-date selection stops at its safe limit', () => {
  assert.equal(expandScheduleDates('range', ['2028-1-1', '2028-12-31']).length, 366);
  const cursor = new Date(2026, 0, 1);
  const sixty = Array.from({ length: 60 }, () => {
    const key = `${cursor.getFullYear()}-${cursor.getMonth() + 1}-${cursor.getDate()}`;
    cursor.setDate(cursor.getDate() + 1);
    return key;
  });
  assert.equal(selectScheduleDate('multi', sixty, '2026-3-20').length, sixty.length);
});
