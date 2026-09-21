export type LaterItem = {
  id: string; title: string; memo: string; url: string; categoryId: string;
  createdAt: string; done: boolean; scheduled?: boolean; pinned?: boolean;
  statusVersion?: 2;
};
export const laterFilters = ['전체', '할 일', '링크', '일정', '완료'] as const;
export type LaterFilter = typeof laterFilters[number];

export function normalizeLaterUrl(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.') || url.username || url.password) throw new Error('invalid URL');
  return url.toString();
}

export function youtubeId(value: string) {
  try {
    const url = new URL(normalizeLaterUrl(value));
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    const id = host === 'youtu.be' ? url.pathname.split('/')[1]
      : ['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)
        ? url.searchParams.get('v') || (/^\/(shorts|embed|live)\//.test(url.pathname) ? url.pathname.split('/')[2] : '') : '';
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

export function linkKey(value: string) {
  if (!value.trim()) return '';
  const video = youtubeId(value);
  if (video) return `youtube:${video}`;
  try {
    const url = new URL(normalizeLaterUrl(value));
    url.hash = '';
    [...url.searchParams.keys()].filter(key => /^utm_/i.test(key)).forEach(key => url.searchParams.delete(key));
    url.searchParams.sort();
    return url.toString();
  } catch { return value.trim(); }
}

export function readLaterItems(raw: string | null): LaterItem[] {
  const data: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(data) || !data.every(item => item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.memo === 'string' && typeof item.url === 'string' && typeof item.categoryId === 'string' && typeof item.createdAt === 'string' && Number.isFinite(Date.parse(item.createdAt)) && typeof item.done === 'boolean' && (item.scheduled === undefined || typeof item.scheduled === 'boolean') && (item.pinned === undefined || typeof item.pinned === 'boolean'))) throw new Error('Invalid saved items');
  if (new Set(data.map(item => item.id)).size !== data.length) throw new Error('Duplicate IDs');
  // Old versions marked scheduled items as done without the user completing them.
  return data.map(item => ({ ...item, done: item.scheduled && item.statusVersion !== 2 ? false : item.done, statusVersion: 2 }));
}

export function filterLaterItems(items: LaterItem[], filter: LaterFilter, category: string | null, query: string) {
  return items.filter(item => (filter === '완료' ? item.done : !item.done)
    && (filter !== '할 일' || (!item.url && !item.scheduled))
    && (filter !== '링크' || (!!item.url && !item.scheduled))
    && (filter !== '일정' || item.scheduled)
    && (category === null || item.categoryId === category)
    && `${item.title} ${item.memo} ${item.url}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
}

export type LaterUndo = { item: LaterItem; index: number; kind: 'delete' | 'done'; message: string };
export function undoLaterChange(items: LaterItem[], undo: LaterUndo) {
  if (undo.kind === 'done') return items.map(item => item.id === undo.item.id ? { ...item, done: undo.item.done } : item);
  if (items.some(item => item.id === undo.item.id)) return items;
  const next = [...items];
  next.splice(Math.min(undo.index, next.length), 0, undo.item);
  return next;
}
