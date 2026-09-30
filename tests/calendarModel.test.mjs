import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCalendar, calendarWeekCount, finishMonthGesture, isStationaryPageRelease } from '../calendarModel.ts';

test('calendar dates and row heights agree across leap years and year boundaries', () => {
  for (let year = 2024; year <= 2028; year++) for (let month = 0; month < 12; month++) {
    const grid = buildCalendar(new Date(year, month, 1));
    const days = grid.filter(Boolean);
    assert.equal(days.length, new Date(year, month + 1, 0).getDate());
    assert.equal(grid.indexOf(days[0]), days[0].getDay());
    assert.equal(calendarWeekCount(new Date(year, month, 1)), Math.ceil(grid.length / 7));
    assert.equal(new Set(days.map(d => d.toDateString())).size, days.length);
  }
});
test('slow iOS release commits even without a momentum event', () => {
  assert.equal(isStationaryPageRelease(720, 720, 0, 360), true);
  assert.equal(isStationaryPageRelease(600, 720, .3, 360), false);
  assert.equal(isStationaryPageRelease(600, 600, 0, 360), false);
  assert.equal(isStationaryPageRelease(720, undefined, undefined, 360), false);
});
test('repeated swipes commit each gesture once; stale and recenter events do not move month', () => {
  let month = 8;
  for (let index = 0; index < 100; index++) {
    const delta = index % 2 ? -1 : 1;
    const offset = (1 + delta) * 360;
    assert.equal(finishMonthGesture({ phase: 'dragging', targetPage: null }, offset, 360), null);
    const result = finishMonthGesture({ phase: 'released', targetPage: 1 + delta }, offset, 360);
    month += result.delta;
    assert.equal(finishMonthGesture(result.state, offset, 360), null);
    assert.equal(finishMonthGesture(result.state, 360, 360), null);
  }
  assert.equal(month, 8);
  assert.equal(finishMonthGesture({ phase: 'released', targetPage: 2 }, 0, 360), null);
  assert.equal(finishMonthGesture({ phase: 'released', targetPage: null }, 500, 360), null);
});
