import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FeedbackUploadQueue } from '../src/lib/feedback-upload-queue';
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};
async function finished(queue: FeedbackUploadQueue) {
  const until = Date.now() + 2000;
  while (queue.getSnapshot().some((j) => j.status === 'queued' || j.status === 'uploading')) {
    assert.ok(Date.now() < until, 'Queue did not settle');
    await new Promise((r) => setTimeout(r, 5));
  }
}
test('Uploads survive subscriber/popup removal and stay bound to each student review', async () => {
  const entered = deferred(),
    release = deferred();
  let first = true;
  const owners: string[] = [];
  const bytes: Record<string, number> = {};
  const queue = new FeedbackUploadQueue({
    csrf: () => 'csrf',
    request: async (action, p: any) => {
      assert.equal(action, 'upload-init');
      owners.push(p.review_id);
      return {
        id: p.review_id,
        size: p.size,
        offset: 0,
        chunkSize: 3,
        complete: false,
        recorded: false,
      };
    },
    fetch: (async (url, options) => {
      const id = String(url).split('/').at(-1)!;
      if (first) {
        first = false;
        entered.resolve();
        await release.promise;
      }
      bytes[id] = (bytes[id] || 0) + (options?.body as Blob).size;
      return Response.json({
        id,
        size: 6,
        offset: bytes[id],
        chunkSize: 3,
        complete: bytes[id] === 6,
        recorded: bytes[id] === 6,
      });
    }) as typeof fetch,
  });
  const unsubscribe = queue.subscribe(() => {});
  queue.enqueue('review-a', 'Học viên A', [new File(['123456'], 'a.txt', { lastModified: 1 })]);
  await entered.promise;
  unsubscribe();
  queue.enqueue('review-b', 'Học viên B', [new File(['abcdef'], 'b.txt', { lastModified: 2 })]);
  assert.equal(queue.getSnapshot()[0].status, 'uploading');
  assert.equal(queue.getSnapshot()[1].status, 'queued');
  release.resolve();
  await finished(queue);
  assert.deepEqual(owners, ['review-a', 'review-b']);
  assert.deepEqual(bytes, { 'review-a': 6, 'review-b': 6 });
  assert.ok(queue.getSnapshot().every((j) => j.status === 'done'));
});
test('Retry queries the old upload offset and does not upload accepted bytes again', async () => {
  let bytes = 0,
    creates = 0,
    fail = true;
  const offsets: number[] = [];
  const queue = new FeedbackUploadQueue({
    csrf: () => 'csrf',
    request: async (action, p: any) => {
      if (action === 'upload-init') {
        creates++;
        return {
          id: 'upload-1',
          offset: 0,
          size: 6,
          chunkSize: 3,
          complete: false,
          recorded: false,
        };
      }
      assert.equal(action, 'upload-status');
      assert.equal(p.id, 'upload-1');
      return {
        id: 'upload-1',
        offset: bytes,
        size: 6,
        chunkSize: 3,
        complete: bytes === 6,
        recorded: bytes === 6,
      };
    },
    fetch: (async (_url, options) => {
      const offset = Number((options?.headers as Record<string, string>)['x-upload-offset']);
      offsets.push(offset);
      bytes += (options?.body as Blob).size;
      if (fail) {
        fail = false;
        throw new Error('Mất kết nối sau khi Drive nhận chunk');
      }
      return Response.json({
        id: 'upload-1',
        offset: bytes,
        size: 6,
        chunkSize: 3,
        complete: true,
        recorded: true,
      });
    }) as typeof fetch,
  });
  queue.enqueue('review-a', 'A', [new File(['123456'], 'a.txt')]);
  await finished(queue);
  assert.equal(queue.getSnapshot()[0].status, 'failed');
  queue.retry(queue.getSnapshot()[0].id);
  await finished(queue);
  assert.equal(queue.getSnapshot()[0].status, 'done');
  assert.equal(creates, 1);
  assert.deepEqual(offsets, [0, 3]);
  assert.equal(bytes, 6);
});
test('A transient chunk lock checks Drive offset before sending more bytes', async () => {
  let offset = 0;
  const sent: number[] = [];
  const queue = new FeedbackUploadQueue({
    csrf: () => 'csrf',
    request: async (action) => {
      if (action === 'upload-init')
        return { id: 'upload-locked', offset: 0, size: 6, chunkSize: 3, complete: false, recorded: false };
      assert.equal(action, 'upload-status');
      return { id: 'upload-locked', offset, size: 6, chunkSize: 3, complete: false, recorded: false };
    },
    fetch: (async (_url, options) => {
      const start = Number((options?.headers as Record<string, string>)['x-upload-offset']);
      sent.push(start);
      offset = start + (options?.body as Blob).size;
      if (start === 0)
        return Response.json({ error: 'Đang có thao tác khác.', code: 'LOCKED' }, { status: 409 });
      return Response.json({ id: 'upload-locked', offset, size: 6, chunkSize: 3, complete: true, recorded: true });
    }) as typeof fetch,
  });
  queue.enqueue('review-a', 'A', [new File(['123456'], 'a.txt')]);
  await finished(queue);
  assert.equal(queue.getSnapshot()[0].status, 'done');
  assert.deepEqual(sent, [0, 3]);
});
