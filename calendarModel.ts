export function buildCalendar(month: Date): (Date | null)[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  return [...Array.from({ length: first.getDay() }, () => null), ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1))];
}

export const calendarWeekCount = (month: Date) => Math.ceil(buildCalendar(month).length / 7);

export type MonthGesture = { phase: 'idle' | 'dragging' | 'released'; targetPage: number | null };
export function settledMonthPage(offset: number, width: number): number | null {
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width <= 0) return null;
  const page = Math.round(offset / width);
  return page >= 0 && page <= 2 && Math.abs(offset - page * width) <= 2 ? page : null;
}

export function finishMonthGesture(state: MonthGesture, offset: number, width: number): { state: MonthGesture; delta: number } | null {
  const page = settledMonthPage(offset, width);
  if (state.phase !== 'released' || page === null || (state.targetPage !== null && page !== state.targetPage)) return null;
  return { state: { phase: 'idle', targetPage: null }, delta: page - 1 };
}

// iOS omits momentum-end entirely when a slow drag ends already at its target.
export function isStationaryPageRelease(offset: number, target: number | undefined, velocity: number | undefined, width: number) {
  return target !== undefined && velocity !== undefined && Number.isFinite(target) && Number.isFinite(velocity)
    && Math.abs(velocity) < .001 && Math.abs(target - offset) <= 1 && settledMonthPage(offset, width) !== null;
}
