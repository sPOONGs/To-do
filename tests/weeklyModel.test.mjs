import test from 'node:test';
import assert from 'node:assert/strict';
import { readWeeklyRoutines, routineConflict, getHomeScheduleSummary, homeScheduleTime, timetableRange } from '../weeklyModel.ts';

const routine = (id, fields = {}) => ({ id, title: '산책', days: [1, 3], start: 540, end: 600, color: '#DCE7F0', ...fields });
const schedule = (id, date, time) => ({ id, date, time, title: '일정', category: '', color: '#DCE7F0' });

test('weekly routines round-trip without losing days and midnight end', () => {
  const values = [routine('1'), routine('2', { days: [0], start: 1380, end: 1440 })];
  assert.deepEqual(readWeeklyRoutines(JSON.stringify(values)), values);
  assert.deepEqual(readWeeklyRoutines(null), []);
});
test('damaged saved weekly data is rejected instead of silently overwritten', () => {
  for (const value of [{}, [routine('1'), routine('1')], [routine('1', { days: [7] })], [routine('1', { days: [1, 1] })], [routine('1', { end: 500 })]]) {
    assert.throws(() => readWeeklyRoutines(JSON.stringify(value)));
  }
});
test('routine conflict checks shared weekdays and ignores the edited item', () => {
  const values = [routine('1')];
  assert.equal(routineConflict(values, routine('2', { days: [3], start: 570 })).day, 3);
  assert.equal(routineConflict(values, routine('2', { days: [0] })), null);
  assert.equal(routineConflict(values, routine('1')), null);
});
test('back-to-back routines are allowed', () => {
  assert.equal(routineConflict([routine('1')], routine('2', { start: 600, end: 660 })), null);
});
test('timetable keeps 09 to 22 by default and expands only for routines outside it', () => {
  assert.deepEqual(timetableRange([]), { startHour: 9, endHour: 22 });
  assert.deepEqual(timetableRange([routine('1')]), { startHour: 9, endHour: 22 });
  assert.deepEqual(timetableRange([routine('early', { start: 510, end: 570 })]), { startHour: 8, endHour: 22 });
  assert.deepEqual(timetableRange([routine('late', { start: 1290, end: 1350 })]), { startHour: 9, endHour: 23 });
  assert.deepEqual(timetableRange([routine('wide', { start: 0, end: 1440 })]), { startHour: 0, endHour: 24 });
});
test('home shows today chronologically while skipping passed times for upcoming', () => {
  const values = [schedule('later', '2026-9-22', '15:00'), schedule('early', '2026-09-22', '09:00'), schedule('tomorrow', '2026-9-23', '08:00')];
  const result = getHomeScheduleSummary(values, new Date(2026, 8, 22, 12));
  assert.deepEqual(result.today.map(item => item.id), ['early', 'later']);
  assert.equal(result.upcoming.schedule.id, 'later');
  assert.equal(result.daysUntil, 0);
  assert.equal(getHomeScheduleSummary(values, new Date(2026, 8, 22, 16)).daysUntil, 1);
});
test('completed schedules remain in today but are skipped by upcoming', () => {
  const values = [schedule('overdue', '2026-9-21', '18:00'), schedule('finished', '2026-9-22', '13:00'), schedule('next', '2026-9-22', '14:00')];
  values[0].completed = true;
  values[1].completed = true;
  const result = getHomeScheduleSummary(values, new Date(2026, 8, 22, 12));
  assert.deepEqual(result.today.map(item => item.id), ['finished', 'next']);
  assert.equal(result.upcoming.schedule.id, 'next');
  assert.deepEqual(result.pending.map(item => item.id), ['next']);
  assert.deepEqual(result.completedToday.map(item => item.id), ['finished']);
});
test('unfinished past schedules remain in the pending list', () => {
  const values = [schedule('old', '2026-9-20', '09:00'), schedule('today', '2026-9-22', '18:00'), schedule('future', '2026-9-23', '09:00')];
  assert.deepEqual(getHomeScheduleSummary(values, new Date(2026, 8, 22, 12)).pending.map(item => item.id), ['old', 'today']);
});
test('invalid dates and clock values do not turn into imaginary upcoming schedules', () => {
  for (const [date, time] of [['2026-2-30', '09:00'], ['2026-13-1', '09:00'], ['2026-9-22', '25:00'], ['2026-9-22', '09:99']]) {
    assert.equal(homeScheduleTime(schedule('bad', date, time)), null);
  }
  assert.equal(getHomeScheduleSummary([], new Date()).upcoming, null);
});
