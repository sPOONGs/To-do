import { dateKey, parseDateKey } from './plannerModel.ts';

export type ScheduleMode = 'single' | 'range' | 'multi';

const validKey = (key: string) => Number.isFinite(parseDateKey(key).getTime());
const sortedUnique = (keys: string[]) => [...new Set(keys.filter(validKey))].sort((a, b) => parseDateKey(a).getTime() - parseDateKey(b).getTime());

export function selectScheduleDate(mode: ScheduleMode, current: string[], selected: string, multiLimit = 60): string[] {
  if (!validKey(selected)) return current;
  if (mode === 'single') return [selected];
  if (mode === 'multi') {
    if (current.includes(selected)) return current.filter(key => key !== selected);
    return current.length >= multiLimit ? current : sortedUnique([...current, selected]);
  }
  if (current.length !== 1) return [selected];
  if (current[0] === selected) return [selected];
  return sortedUnique([current[0], selected]);
}

export function expandScheduleDates(mode: ScheduleMode, selected: string[], rangeLimit = 366): string[] {
  const normalized = sortedUnique(selected);
  if (mode === 'single') return normalized.slice(0, 1);
  if (mode === 'multi') return normalized;
  if (normalized.length !== 2) return [];
  const cursor = parseDateKey(normalized[0]);
  const end = parseDateKey(normalized[1]);
  const result: string[] = [];
  while (cursor.getTime() <= end.getTime()) {
    result.push(dateKey(cursor));
    if (result.length > rangeLimit) return [];
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export function isDateInSelection(mode: ScheduleMode, selected: string[], candidate: string): boolean {
  if (mode !== 'range' || selected.length !== 2) return selected.includes(candidate);
  const value = parseDateKey(candidate).getTime();
  const start = parseDateKey(selected[0]).getTime();
  const end = parseDateKey(selected[1]).getTime();
  return Number.isFinite(value) && value >= start && value <= end;
}
