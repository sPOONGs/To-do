import test from 'node:test';
import assert from 'node:assert/strict';
import { compactHolidayName, getKoreanHolidayNames, supportedHolidayYears } from '../koreanHolidays.ts';

test('official preset includes Korean holidays and substitute holidays', () => {
  assert.deepEqual(getKoreanHolidayNames(new Date(2026, 0, 1)), ['1월 1일']);
  assert.deepEqual(getKoreanHolidayNames(new Date(2026, 2, 2)), ['대체공휴일(3ㆍ1절)']);
  assert.deepEqual(getKoreanHolidayNames(new Date(2026, 8, 25)), ['추석']);
  assert.deepEqual(getKoreanHolidayNames(new Date(2026, 8, 28)), []);
});

test('unsupported years stay empty rather than guessing holidays', () => {
  assert.equal(supportedHolidayYears[0], 2018);
  assert.equal(supportedHolidayYears.at(-1), 2027);
  assert.deepEqual(getKoreanHolidayNames(new Date(2035, 0, 1)), []);
});

test('long official names become compact calendar labels', () => {
  assert.equal(compactHolidayName(['대체공휴일(부처님 오신 날)']), '대체공휴일');
  assert.equal(compactHolidayName(['제22대국회의원선거']), '국회의원선거');
  assert.equal(compactHolidayName(['어린이날', '부처님 오신 날']), '어린이날+1');
});
