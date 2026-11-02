import test from 'node:test';
import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const { api } = await import('../src/api.ts');
const response = value => new Response(JSON.stringify(value), {
  status: 200, headers: { 'Content-Type': 'application/json' },
});

test('password login establishes a session and logout removes it', async () => {
  api.setToken(null);
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, authorization: options.headers.Authorization, body: options.body });
    return url.endsWith('/auth/login')
      ? response({ access_token: 'teacher-token', user: { role: 'teacher' } })
      : response({ message: 'Đã đăng xuất' });
  };
  const result = await api.login('teacher', 'demo123');
  assert.equal(result.user.role, 'teacher');
  assert.equal(api.getToken(), 'teacher-token');
  assert.deepEqual(JSON.parse(calls[0].body), { username: 'teacher', password: 'demo123' });
  await api.logout();
  assert.equal(calls[1].authorization, 'Bearer teacher-token');
  assert.equal(api.getToken(), null);
  assert.equal(storage.has('lecture_twin_token'), false);
});

test('overlapping account logins are serialized in request order', async () => {
  api.setToken(null);
  const calls = [];
  let releaseFirst;
  const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
  globalThis.fetch = async (_url, options) => {
    const username = JSON.parse(options.body).username;
    calls.push(username);
    if (username === 'teacher') await firstResponse;
    return response({ access_token: username + '-token', user: { role: username } });
  };
  const first = api.login('teacher', 'demo123');
  const second = api.login('student', 'demo123');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['teacher']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(calls, ['teacher', 'student']);
  assert.equal(api.getToken(), 'student-token');
});

test('a failed network logout retains the session instead of pretending it was revoked', async () => {
  api.setToken('live-token');
  globalThis.fetch = async () => { throw new Error('Network unavailable'); };
  await assert.rejects(api.logout(), /Network unavailable/);
  assert.equal(api.getToken(), 'live-token');
  api.setToken(null);
});

test('key-point generation posts to the lecture endpoint and returns its workspace', async () => {
  api.setToken('teacher-token');
  let request;
  const generated = { lecture: { id: 'lecture-7', version: 4 }, key_points: { source_version: 4, status: 'draft', points: [], limitations: [] } };
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return response(generated);
  };
  assert.deepEqual(await api.generateKeyPoints('lecture-7'), generated);
  assert.equal(request.url, '/api/lectures/lecture-7/key-points');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), {});
  api.setToken(null);
});

test('teaching-proposal review posts the selected decision, note and observed state', async () => {
  api.setToken('teacher-token');
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return response({ lecture: { id: 'lecture 8', version: 3 } });
  };
  await api.decideTeachingProposal('lecture 8', 'proposal-1', 'confirm', 'Đã đối chiếu với nguồn.', 'state-1');
  assert.equal(request.url, '/api/lectures/lecture%208/teaching-proposals/proposal-1/decision');
  assert.equal(request.options.method, 'POST');
  assert.deepEqual(JSON.parse(request.options.body), { decision: 'confirm', note: 'Đã đối chiếu với nguồn.', state_id: 'state-1' });
  api.setToken(null);
});
