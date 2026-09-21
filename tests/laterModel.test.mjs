import test from 'node:test';
import assert from 'node:assert/strict';
import { readLaterItems, filterLaterItems, undoLaterChange, linkKey, normalizeLaterUrl, youtubeId } from '../laterModel.ts';

const item = (id, fields = {}) => ({ id, title: `생각 ${id}`, memo: '메모', url: '', categoryId: 'personal', createdAt: '2026-09-21T00:00:00.000Z', done: false, ...fields });
test('legacy scheduled entries become scheduled, not completed, without losing notes', () => {
  const [entry] = readLaterItems(JSON.stringify([item('1', { scheduled: true, done: true })]));
  assert.equal(entry.done, false); assert.equal(entry.scheduled, true); assert.equal(entry.memo, '메모');
  assert.equal(entry.statusVersion, 2);
});
test('new explicitly completed scheduled entries stay completed after restart', () => {
  const [entry] = readLaterItems(JSON.stringify([item('1', { scheduled: true, done: true, statusVersion: 2 })]));
  assert.equal(entry.done, true);
});
test('invalid saved data and duplicate IDs are rejected', () => {
  assert.throws(() => readLaterItems('{'));
  assert.throws(() => readLaterItems(JSON.stringify([item('1'), item('1')])));
  assert.throws(() => readLaterItems(JSON.stringify([item('1', { pinned: 'yes' })])));
});
const entries = [item('task'), item('link', { url: 'https://example.com/' }), item('scheduled', { scheduled: true }), item('done', { done: true })];
test('all, task, link, scheduled and completed views remain distinct', () => {
  const ids = filter => filterLaterItems(entries, filter, null, '').map(value => value.id);
  assert.deepEqual(ids('전체'), ['task', 'link', 'scheduled']);
  assert.deepEqual(ids('할 일'), ['task']); assert.deepEqual(ids('링크'), ['link']);
  assert.deepEqual(ids('일정'), ['scheduled']); assert.deepEqual(ids('완료'), ['done']);
});
test('pin sorting is stable and does not mutate saved order', () => {
  const list = [item('a'), item('b', { pinned: true }), item('c', { pinned: true })];
  assert.deepEqual(filterLaterItems(list, '전체', null, '').map(value => value.id), ['b', 'c', 'a']);
  assert.deepEqual(list.map(value => value.id), ['a', 'b', 'c']);
});
test('category and search filters work together including unassigned', () => {
  const list = [...entries, item('empty', { categoryId: '', title: 'Read Book' })];
  assert.deepEqual(filterLaterItems(list, '전체', '', 'book').map(value => value.id), ['empty']);
  assert.equal(filterLaterItems(list, '전체', 'personal', 'BOOK').length, 0);
});
test('undo delete restores position and preserves newer unrelated changes', () => {
  const undo = { kind: 'delete', item: entries[1], index: 1 };
  const current = [item('task', { title: '수정됨' }), entries[2]];
  const result = undoLaterChange(current, undo);
  assert.deepEqual(result.map(value => value.id), ['task', 'link', 'scheduled']);
  assert.equal(result[0].title, '수정됨');
  assert.equal(undoLaterChange(result, undo).length, 3);
});
test('undo completion restores only completion, not later edits or pin state', () => {
  const result = undoLaterChange([item('1', { done: true, pinned: true, title: 'edited' })], { kind: 'done', item: item('1'), index: 0 });
  assert.equal(result[0].done, false); assert.equal(result[0].pinned, true); assert.equal(result[0].title, 'edited');
});
test('YouTube share variants are detected as the same video', () => {
  assert.equal(linkKey('https://youtu.be/abcdefghijk?si=abc'), linkKey('https://www.youtube.com/watch?v=abcdefghijk&t=35'));
  assert.equal(youtubeId('https://youtube.com/shorts/abcdefghijk'), 'abcdefghijk');
  assert.equal(youtubeId('https://youtube.com.evil.com/watch?v=abcdefghijk'), null);
});
test('tracking is ignored while meaningful query parameters remain distinct', () => {
  assert.equal(linkKey('https://example.com/?utm_source=x&a=1#part'), linkKey('https://example.com/?a=1'));
  assert.notEqual(linkKey('https://example.com/?a=1'), linkKey('https://example.com/?a=2'));
});
test('unsafe URL schemes and credentials are blocked', () => {
  for (const url of ['javascript:alert(1)', 'file:///tmp/x', 'https://user:pass@example.com']) assert.throws(() => normalizeLaterUrl(url));
  assert.equal(normalizeLaterUrl('example.com'), 'https://example.com/');
});
