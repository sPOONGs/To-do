export type Schedule = { id: string; date: string; time: string; title: string; keyword?: string; category: string; categoryId?: string; color: string; mode?: 'single' | 'range' | 'multi'; groupId?: string; completed?: boolean; createdAt?: number };
export type Category = { id: string; name: string; color: string };

const invalidDate = () => new Date(Number.NaN);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isColor = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);

export function dateKey(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  return `${String(date.getFullYear()).padStart(4, '0')}-${date.getMonth() + 1}-${date.getDate()}`;
}

export function dateLabel(date: Date): string {
  if (!Number.isFinite(date.getTime())) throw new RangeError('Invalid date');
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// Calendar dates are local dates, not UTC ISO timestamps. Validate each part
// after construction because Date silently turns February 30 into March 2.
export function parseDateKey(key: string): Date {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(key);
  if (!match) return invalidDate();
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return invalidDate();
  const date = new Date(0);
  date.setHours(0, 0, 0, 0);
  // setFullYear avoids the special 1900 offset for years 0 through 99.
  date.setFullYear(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : invalidDate();
}

function normalizeTime(time: unknown): string | null {
  if (typeof time !== 'string') return null;
  const match = /^(\d{1,2}):(\d{1,2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function scheduleDateTime(schedule: Schedule): Date {
  const date = parseDateKey(schedule.date);
  const time = normalizeTime(schedule.time);
  if (!Number.isFinite(date.getTime()) || !time) return invalidDate();
  const [hour, minute] = time.split(':').map(Number);
  date.setHours(hour, minute, 0, 0);
  // A missing clock time during a daylight-saving transition must not turn
  // into a different appointment time unnoticed.
  return dateKey(date) === dateKey(parseDateKey(schedule.date)) && date.getHours() === hour && date.getMinutes() === minute ? date : invalidDate();
}

export function scheduleDisplayTitle(schedule: Pick<Schedule, 'keyword' | 'title'>): string {
  return schedule.keyword?.trim() || schedule.title.trim();
}

export function calendarKeywordSchedules(schedules: Schedule[], limit = 2): Schedule[] {
  return schedules
    .map((schedule, storedOrder) => ({ schedule, storedOrder }))
    .filter(({ schedule }) => schedule.keyword?.trim())
    .sort((a, b) => a.schedule.time.localeCompare(b.schedule.time)
      || (a.schedule.createdAt ?? 0) - (b.schedule.createdAt ?? 0)
      || a.storedOrder - b.storedOrder)
    .slice(0, Math.max(0, limit))
    .map(({ schedule }) => schedule);
}

export function readSchedules(raw: string | null): Schedule[] {
  const data: unknown = raw === null ? [] : JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('Invalid saved schedules');
  const ids = new Set<string>();
  const schedules = data.map(value => {
    if (!isRecord(value) || !nonempty(value.id) || !nonempty(value.title) || typeof value.date !== 'string' || typeof value.category !== 'string' || !isColor(value.color) || (value.keyword !== undefined && typeof value.keyword !== 'string') || (value.categoryId !== undefined && typeof value.categoryId !== 'string') || (value.mode !== undefined && value.mode !== 'single' && value.mode !== 'range' && value.mode !== 'multi') || (value.groupId !== undefined && typeof value.groupId !== 'string') || (value.completed !== undefined && typeof value.completed !== 'boolean') || (value.createdAt !== undefined && (typeof value.createdAt !== 'number' || !Number.isFinite(value.createdAt) || value.createdAt < 0))) throw new Error('Invalid saved schedule');
    const date = parseDateKey(value.date);
    const time = normalizeTime(value.time);
    if (!Number.isFinite(date.getTime()) || !time) throw new Error('Invalid saved schedule date or time');
    if (ids.has(value.id)) throw new Error('Duplicate schedule ID');
    ids.add(value.id);
    // Keep all existing content and only normalize comparable date/time keys.
    return { ...value, date: dateKey(date), time } as Schedule;
  });
  // The first duration/multi-date prototype stored one item per day with a
  // shared ID prefix, but did not persist its mode. Restore only those exact
  // batches so older, unrelated schedules keep their original meaning.
  const legacyBatches = new Map<string, Schedule[]>();
  schedules.forEach(schedule => {
    if (schedule.mode !== undefined || schedule.groupId !== undefined) return;
    const match = /^(schedule-\d+-[a-z0-9]+)-\d+$/.exec(schedule.id);
    if (!match) return;
    legacyBatches.set(match[1], [...(legacyBatches.get(match[1]) ?? []), schedule]);
  });
  const restored = new Map<string, Pick<Schedule, 'mode' | 'groupId'>>();
  legacyBatches.forEach((batch, batchId) => {
    if (batch.length < 2) return;
    const sorted = [...batch].sort((a, b) => parseDateKey(a.date).getTime() - parseDateKey(b.date).getTime());
    const contiguous = sorted.slice(1).every((schedule, index) => {
      const previous = parseDateKey(sorted[index].date);
      const current = parseDateKey(schedule.date);
      const previousDay = Date.UTC(previous.getFullYear(), previous.getMonth(), previous.getDate());
      const currentDay = Date.UTC(current.getFullYear(), current.getMonth(), current.getDate());
      return currentDay - previousDay === 86400000;
    });
    sorted.forEach(schedule => restored.set(schedule.id, { mode: contiguous ? 'range' : 'multi', groupId: `legacy-${batchId}` }));
  });
  return schedules.map(schedule => restored.has(schedule.id) ? { ...schedule, ...restored.get(schedule.id) } : schedule);
}

export function bindLegacyCategories(schedules: Schedule[], categories: Category[]): Schedule[] {
  return schedules.map(schedule => {
    if (schedule.categoryId !== undefined) return schedule;
    const matches = categories.filter(category => category.name === schedule.category && category.color.toLowerCase() === schedule.color.toLowerCase());
    // Ambiguous or removed categories keep their original display metadata.
    return { ...schedule, categoryId: matches.length === 1 ? matches[0].id : '' };
  });
}

export function readCategories(raw: string | null, defaults: Category[]): Category[] {
  const data: unknown = raw === null ? defaults : JSON.parse(raw);
  if (!Array.isArray(data) || data.length < 4 || data.length > 8) throw new Error('Invalid saved category count');
  const ids = new Set<string>();
  return data.map(value => {
    if (!isRecord(value) || !nonempty(value.id) || !nonempty(value.name) || !isColor(value.color)) throw new Error('Invalid saved category');
    if (ids.has(value.id)) throw new Error('Duplicate category ID');
    ids.add(value.id);
    return { ...value } as Category;
  });
}
