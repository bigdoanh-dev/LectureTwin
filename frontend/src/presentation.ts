import type { ConceptNode, Evidence, Job, Workspace } from './types';

/** These selectors describe real workspace data; they never generate new claims. */
export interface LessonSummaryRow {
  id: string;
  title: string;
  description: string;
  verified: boolean;
  evidence: Evidence | null;
  concept: ConceptNode;
}
export function buildLessonSummary(workspace: Workspace | null): LessonSummaryRow[] {
  if (!workspace) return [];
  const preferred = ['bfs', 'dfs', 'compare'].map(id => workspace.concepts.find(c => c.id === id)).filter((c): c is ConceptNode => !!c);
  const concepts = preferred.length ? preferred : workspace.concepts.slice(0, 3);
  return concepts.map(concept => ({
    id: concept.id,
    title: concept.label,
    description: concept.description,
    verified: concept.verified,
    concept,
    evidence: workspace.evidence.find(e => e.concept_id === concept.id && e.valid && e.kind === 'transcript') ||
      workspace.evidence.find(e => e.concept_id === concept.id && e.valid) || null,
  }));
}
export function latestAnalysis(workspace: Workspace | null): Job | null {
  return workspace?.jobs.find(job => job.workflow === 'analysis' && job.input?.version === workspace.lecture.version) || null;
}
export function lessonWorkflow(workspace: Workspace | null) {
  const job = latestAnalysis(workspace);
  const findings = workspace?.findings || [];
  const pending = findings.filter(f => f.status === 'pending');
  const unsupported = findings.filter(f => !f.has_evidence);
  const published = !!workspace && workspace.lecture.status === 'published' && workspace.lecture.published_version === workspace.lecture.version;
  const running = !!job && (job.status === 'queued' || job.status === 'running');
  const hasSources = !!workspace && (workspace.assets.length > 0 || workspace.transcript.length > 0 || workspace.slides.length > 0);
  const completedCurrent = !!workspace && workspace.lecture.analysis_current === true && job?.status === 'completed';
  const hasText = !!workspace && (workspace.transcript.some(item => !!item.text?.trim()) || workspace.slides.some(item => !!item.text?.trim()));
  const reviewed = completedCurrent && !!workspace &&
    pending.length === 0 && workspace.concepts.length > 0 && workspace.concepts.every(c => c.verified);
  const analyzed = job?.status === 'needs_review' || completedCurrent || published;
  return { job, hasSources, hasText, running, analyzed, reviewed, published,
    canReview: job?.status === 'needs_review' && pending.length > 0,
    canPublish: reviewed && !published,
    pendingCount: pending.length,
    unsupportedCount: unsupported.length,
    excludedCount: unsupported.filter(f => f.status === 'rejected').length,
  };
}
export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return 'Không có mốc thời gian';
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
}
export function formatEvidenceLabel(evidence: Evidence): string {
  if (evidence.start != null && evidence.end != null) return `${formatTimestamp(evidence.start)} – ${formatTimestamp(evidence.end)}`;
  return evidence.slide_page ? `Slide ${evidence.slide_page}` : 'Xem nguồn học liệu';
}

export function analysisStages(workspace: Workspace | null) {
  const job = latestAnalysis(workspace);
  return [
    { id: 'perception', label: 'Đọc học liệu' },
    { id: 'knowledge', label: 'Liên kết ý chính' },
    { id: 'verification', label: 'Đối chiếu nguồn' },
    { id: 'pedagogical', label: 'Chuẩn bị đề xuất' },
  ].map(stage => ({ ...stage, status: job?.agents?.find(run => run.agent === stage.id)?.status || 'idle' }));
}

export function currentAssessments(workspace: Workspace | null) {
  return (workspace?.assessments || [])
    .filter(assessment => assessment.version === workspace?.lecture.version)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}
