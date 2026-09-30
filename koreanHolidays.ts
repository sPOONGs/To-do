import * as presets from '@hyunbinseo/holidays-kr/all';

type HolidayPreset = Record<string, readonly string[]>;

const presetsByYear = new Map<number, HolidayPreset>(
  Object.entries(presets)
    .filter(([name]) => /^y\d{4}$/.test(name))
    .map(([name, preset]) => [Number(name.slice(1)), preset as HolidayPreset]),
);

const paddedKey = (date: Date) => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const supportedHolidayYears = [...presetsByYear.keys()].sort((a, b) => a - b);

export function getKoreanHolidayNames(date: Date): readonly string[] {
  if (!Number.isFinite(date.getTime())) return [];
  return presetsByYear.get(date.getFullYear())?.[paddedKey(date)] ?? [];
}

export function compactHolidayName(names: readonly string[]): string {
  const name = names[0] ?? '';
  const compact = name
    .replace(/^대체공휴일\(.+\)$/, '대체공휴일')
    .replace(/^임시공휴일\(.+\)$/, '임시공휴일')
    .replace(/^제\d+대 ?국회의원선거$/, '국회의원선거')
    .replace(' 다음 날', ' 다음날')
    .replace('전국동시지방선거', '지방선거')
    .replace('기독탄신일', '성탄절')
    .replace('부처님 오신 날', '부처님오신날');
  return names.length > 1 ? `${compact}+${names.length - 1}` : compact;
}
