import test from 'node:test';
import assert from 'node:assert/strict';
import { studentLearningOverview, parseStudentTimestamp } from '../src/student-model.ts';

test('Note times reject partial numbers, invalid seconds and unsafe integers', () => {
  assert.equal(parseStudentTimestamp(' 03:45 '), 225);
  assert.equal(parseStudentTimestamp('00:00'), 0);
  assert.equal(parseStudentTimestamp('62'), 62);
  for (const input of ['', '03junk:12', '03:12junk', '03:60', '-1', '3.5', '1:2', '99999999999999999999:12']) assert.equal(parseStudentTimestamp(input), null);
});

function lesson() {
  return {
    lecture: {version: 2, objectives: ['Mục tiêu đã xuất bản']},
    planned: {objectives: ['Mục tiêu đã xuất bản'], segments: [{id: 'practice', concept_id: 'a', concept_ids: ['a', 'b']}]},
    concepts: [{id: 'a', label: 'A', verified: true}, {id: 'b', label: 'B', verified: true}, {id: 'draft', verified: false}],
    evidence: [
      {id: 'invalid', concept_id: 'a', valid: false, verified: true, kind: 'transcript', start: 0},
      {id: 'unreviewed', concept_id: 'a', valid: true, verified: false, kind: 'transcript', start: 1},
      {id: 'slide', concept_id: 'a', valid: true, verified: true, kind: 'slide', start: null},
      {id: 'video', concept_id: 'b', valid: true, verified: true, kind: 'transcript', start: 22},
      {id: 'draft-source', concept_id: 'draft', valid: true, verified: true, kind: 'transcript', start: 3},
    ],
    edges: [{id: 'approved', source: 'a', target: 'b'}, {id: 'unreviewed', source: 'a', target: 'draft'}],
    research: {objectives: [{id: 'clo-1', title: 'Mục tiêu đã xuất bản', status: 'suggested', version: 2, confirmed_concept_ids: ['a']}], concepts: []},
    assets: [{id: 'local', kind: 'video', source_type: 'prepared_demo_fixture'}, {id: 'youtube', kind: 'video', source_type: 'youtube_reference'}],
    twin: {evaluated: {concept_results: []}},
  };
}

test('Empty lessons do not acquire objectives, content, results or a player', () => {
  const model = studentLearningOverview(null);
  for (const field of ['objectives', 'knowledge', 'outline', 'evidence', 'edges', 'reviewConcepts']) assert.deepEqual(model[field], []);
  assert.equal(model.primaryVideo, null);
  assert.equal(model.canTrackVideo, false);
});

test('Suggested and outdated mappings cannot claim teacher confirmation', () => {
  const ws = lesson();
  assert.deepEqual(studentLearningOverview(ws).objectives[0].concepts, []);
  ws.research.objectives[0].status = 'confirmed';
  ws.research.objectives[0].version = 1;
  assert.equal(studentLearningOverview(ws).objectives[0].hasConfirmedMapping, false);
  ws.research.objectives[0].version = 2;
  ws.research.objectives[0].confirmed_concept_ids = ['a', 'draft'];
  assert.deepEqual(studentLearningOverview(ws).objectives[0].concepts.map(c => c.id), ['a']);
});

test('Knowledge excludes unsupported sources and relations; outline seeks video evidence across grouped topics', () => {
  const model = studentLearningOverview(lesson());
  assert.deepEqual(model.knowledge.map(c => c.id), ['a', 'b']);
  assert.deepEqual(model.evidence.map(e => e.id), ['slide', 'video']);
  assert.deepEqual(model.edges.map(e => e.id), ['approved']);
  assert.equal(model.outline[0].evidence.id, 'video');
});

test('Preferred sources cannot import another concept and preserve teacher evidence ordering', () => {
  const ws = lesson();
  ws.research.concepts = [{concept_id: 'a', evidence_ids: ['video', 'invalid', 'slide']}];
  assert.deepEqual(studentLearningOverview(ws).knowledge[0].sources.map(s => s.id), ['slide']);
});

test('YouTube and local media stay distinct; remediation comes only from actual incorrect answers', () => {
  const ws = lesson();
  ws.twin.evaluated.concept_results = [{concept_id: 'a', correct: 0, total: 1}, {concept_id: 'b', correct: 1, total: 1}];
  let model = studentLearningOverview(ws);
  assert.equal(model.primaryVideo.id, 'youtube');
  assert.equal(model.canTrackVideo, false);
  assert.deepEqual(model.reviewConcepts.map(row => row.concept.id), ['a']);
  ws.assets.pop();
  model = studentLearningOverview(ws);
  assert.equal(model.canTrackVideo, true);
});
