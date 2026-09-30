export type WeeklyRoutine = {
  id: string;
  title: string;
  days: number[];
  start: number;
  end: number;
  color: string;
};

export type HomeSchedule = {
  id: string;
  date: string;
  time: string;
  title: string;
  keyword?: string;
  category: string;
  color: string;
  completed?: boolean;
};

export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0];
export const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
export const ROUTINE_COLORS = ['#DCE7F0', '#E5DEF2', '#E0EBDD', '#F5E5CE', '#F1DCDF', '#DEE9E8'];

export function readWeeklyRoutines(raw: string | null): WeeklyRoutine[] {
  if (raw === null) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error('Invalid weekly routine data');
  const ids = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid weekly routine');
    const routine = entry as Partial<WeeklyRoutine>;
    if (typeof routine.id !== 'string' || !routine.id || ids.has(routine.id)
      || typeof routine.title !== 'string' || !routine.title.trim()
      || !Array.isArray(routine.days) || !routine.days.length
      || !routine.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)
      || new Set(routine.days).size !== routine.days.length
      || typeof routine.start !== 'number' || typeof routine.end !== 'number'
      || !Number.isInteger(routine.start) || !Number.isInteger(routine.end)
      || routine.start < 0 || routine.end > 1440 || routine.end <= routine.start
      || typeof routine.color !== 'string' || !/^#[a-f\d]{6}$/i.test(routine.color)) {
      throw new Error('Invalid weekly routine');
    }
    ids.add(routine.id);
    return { id: routine.id, title: routine.title, days: routine.days, start: routine.start, end: routine.end, color: routine.color };
  });
}

export function routineConflict(routines: WeeklyRoutine[], candidate: WeeklyRoutine) {
  for (const routine of routines) {
    if (routine.id === candidate.id || candidate.start >= routine.end || candidate.end <= routine.start) continue;
    const day = candidate.days.find(value => routine.days.includes(value));
    if (day !== undefined) return { routine, day };
  }
  return null;
}

export const minuteLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

export function timetableRange(routines: WeeklyRoutine[], defaultStartHour = 9, defaultEndHour = 22) {
  if (!routines.length) return { startHour: defaultStartHour, endHour: defaultEndHour };
  const earliest = Math.floor(Math.min(...routines.map(routine => routine.start)) / 60);
  const latest = Math.ceil(Math.max(...routines.map(routine => routine.end)) / 60);
  return {
    startHour: Math.max(0, Math.min(defaultStartHour, earliest)),
    endHour: Math.min(24, Math.max(defaultEndHour, latest)),
  };
}

export function homeScheduleTime(schedule: HomeSchedule): Date | null {
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(schedule.date) || !/^\d{1,2}:\d{2}$/.test(schedule.time)) return null;
  const [year, month, day] = schedule.date.split('-').map(Number);
  const [hour, minute] = schedule.time.split(':').map(Number);
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59) return null;
  const date = new Date(year, month - 1, day, hour, minute);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function getHomeScheduleSummary(schedules: HomeSchedule[], now: Date) {
  const sorted = schedules.map(schedule => ({ schedule, date: homeScheduleTime(schedule) }))
    .filter((entry): entry is { schedule: HomeSchedule; date: Date } => entry.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const today = sorted.filter(({ date }) => date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()).map(({ schedule }) => schedule);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).getTime();
  const pending = sorted.filter(({ schedule, date }) => !schedule.completed && date.getTime() <= endOfToday).map(({ schedule }) => schedule);
  const completedToday = today.filter(schedule => schedule.completed);
  const upcoming = sorted.find(({ schedule, date }) => !schedule.completed && date.getTime() >= now.getTime()) ?? null;
  const daysUntil = upcoming
    ? Math.round((Date.UTC(upcoming.date.getFullYear(), upcoming.date.getMonth(), upcoming.date.getDate())
      - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000)
    : null;
  return { today, pending, completedToday, upcoming, daysUntil };
}
