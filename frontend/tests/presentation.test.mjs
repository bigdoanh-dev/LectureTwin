import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLessonSummary, lessonWorkflow, formatEvidenceLabel, formatTimestamp } from '../src/presentation.ts';

function workspace() {
  return { lecture: { version: 2, status: 'draft', published_version: 1, analysis_current: false },
    assets: [], transcript: [], slides: [], jobs: [], findings: [], concepts: [], evidence: [] };
}
function ready() {
  const w = workspace();
  w.assets = [{kind:'video'}];
  w.lecture.analysis_current = true;
  w.concepts = [{id:'bfs',label:'BFS',description:'Nội dung giáo viên chỉnh sửa.',verified:true}];
  w.jobs = [{id:'actual-job',workflow:'analysis',input:{version:2},status:'completed'}];
  return w;
}
test('An empty or unprocessed lesson never claims completed AI work', () => {
  const state=lessonWorkflow(workspace());
  assert.equal(state.hasSources,false); assert.equal(state.analyzed,false);
  assert.equal(state.canReview,false); assert.equal(state.canPublish,false);
  assert.deepEqual(buildLessonSummary(workspace()),[]);
});
test('A previous successful run cannot publish changed objectives or another version', () => {
  const w=ready(); assert.equal(lessonWorkflow(w).canPublish,true);
  w.lecture.analysis_current=false;
  assert.equal(lessonWorkflow(w).canPublish,false); assert.equal(lessonWorkflow(w).analyzed,false);
  w.lecture.analysis_current=true; w.jobs[0].input.version=1;
  assert.equal(lessonWorkflow(w).canPublish,false);
});
test('Review exposes unsupported material while publication remains blocked', () => {
  const w=ready(); w.lecture.analysis_current=false; w.jobs[0].status='needs_review';
  w.findings=[{id:'supported',has_evidence:true,status:'pending'},{id:'unsupported',has_evidence:false,status:'pending'}];
  const state=lessonWorkflow(w);
  assert.equal(state.canReview,true); assert.equal(state.analyzed,true);
  assert.equal(state.canPublish,false); assert.equal(state.unsupportedCount,1); assert.equal(state.pendingCount,2);
});
test('Summary and citations retain teacher edits and never inject BFS into unknown uploads', () => {
  const w=ready(); w.concepts=[{id:'other',label:'Nội dung tải lên',description:'Chưa đủ nguồn',verified:false}];
  assert.deepEqual(buildLessonSummary(w).map(r=>[r.title,r.description,r.evidence]),[['Nội dung tải lên','Chưa đủ nguồn',null]]);
  w.evidence=[{id:'bad',concept_id:'other',valid:false,kind:'transcript',text:'Unsupported'}];
  assert.equal(buildLessonSummary(w)[0].evidence,null);
});
test('Prepared publications can be previewed without inventing an execution history', () => {
  const w=workspace(); w.lecture.status='published'; w.lecture.published_version=2;
  const state=lessonWorkflow(w);
  assert.equal(state.published,true); assert.equal(state.analyzed,true);
  assert.equal(state.job,null); assert.equal(state.canPublish,false);
});
test('Slide-only sources never fabricate a zero-second citation', () => {
  assert.equal(formatTimestamp(null),'Không có mốc thời gian');
  assert.equal(formatEvidenceLabel({start:null,end:null,slide_page:3}),'Slide 3');
  assert.equal(formatEvidenceLabel({start:22,end:36}),'00:22 – 00:36');
});

test('A processed video with no extractable text remains blocked without pretending it was never processed', () => {
  const w=ready(); w.concepts=[];
  const state=lessonWorkflow(w);
  assert.equal(state.hasSources,true); assert.equal(state.hasText,false);
  assert.equal(state.analyzed,true); assert.equal(state.reviewed,false); assert.equal(state.canPublish,false);
});

test('Visible processing stages report actual tool states instead of a decorative fixed sequence', async () => {
  const { analysisStages } = await import('../src/presentation.ts');
  const w=ready(); w.jobs[0].status='running';
  w.jobs[0].agents=[{agent:'perception',status:'running'}];
  assert.deepEqual(analysisStages(w).map(s=>s.status),['running','idle','idle','idle']);
  w.jobs[0].agents=[{agent:'perception',status:'completed'},{agent:'knowledge',status:'completed'},{agent:'verification',status:'needs_review'}];
  assert.deepEqual(analysisStages(w).map(s=>s.status),['completed','completed','needs_review','idle']);
});

test('A new lecture draft cannot display a quiz from an older published version as its own', async () => {
  const { currentAssessments } = await import('../src/presentation.ts');
  const w=ready();
  w.assessments=[
    {id:'old',version:1,created_at:'2026-10-28T04:00:00Z'},
    {id:'current-first',version:2,created_at:'2026-10-28T03:00:00Z'},
    {id:'current-latest',version:2,created_at:'2026-10-28T03:01:00Z'},
  ];
  assert.deepEqual(currentAssessments(w).map(a=>a.id),['current-latest','current-first']);
});
