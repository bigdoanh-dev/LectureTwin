import test from 'node:test';
import assert from 'node:assert/strict';
import { knowledgeMapLayout, knowledgeNodeSize, knowledgeRelationLabel, knowledgeSearchText } from '../src/knowledge-map-model.ts';
const node = (id, x, y) => ({ id, label: id, description: '', verified: true, evidence_ids: [], x, y });
const edge = (id, source, target, label = 'sử dụng') => ({ id, source, target, label, type: 'uses' });

test('Map retains actual relationships and source labels without adding graph data', () => {
  const input = [node('a', -100, 0), node('b', 150, 150), node('isolated', 400, 300)];
  const relations = [edge('ab', 'a', 'b'), edge('duplicate', 'a', 'b'), edge('invalid', 'a', 'missing'), edge('loop', 'b', 'b')];
  const map = knowledgeMapLayout(input, relations);
  assert.deepEqual(new Set(map.nodes.map(n => n.id)), new Set(['a', 'b', 'isolated']));
  assert.deepEqual(map.edges.map(e => e.id), ['ab']);
  assert.ok(map.nodes.find(n => n.id === 'b').x > map.nodes.find(n => n.id === 'a').x);
  assert.equal(input[0].x, -100);
  assert.equal(knowledgeRelationLabel(map.edges[0]), 'sử dụng');
  assert.equal(knowledgeSearchText('ĐỒ THỊ'), 'do thi');
});

test('Missing or colliding coordinates fall back to finite, distinct, readable node positions', () => {
  for (const input of [Array.from({ length: 30 }, (_, i) => node(String(i), 0, 0)), [node('a'), node('b', NaN, Infinity)]]) {
    const map = knowledgeMapLayout(input, []);
    assert.ok(Number.isFinite(map.width) && Number.isFinite(map.height));
    for (const [i, a] of map.nodes.entries()) {
      assert.ok(a.x >= 0 && a.y >= 0);
      for (const b of map.nodes.slice(i + 1)) assert.ok(Math.abs(a.x - b.x) >= knowledgeNodeSize.width || Math.abs(a.y - b.y) >= knowledgeNodeSize.height);
    }
  }
  const cyclic = knowledgeMapLayout([node('a'), node('b'), node('c')], [edge('ab', 'a', 'b'), edge('ba', 'b', 'a')]);
  assert.equal(cyclic.nodes.length, 3);
  assert.ok(cyclic.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.deepEqual(knowledgeMapLayout([], []).nodes, []);
});
