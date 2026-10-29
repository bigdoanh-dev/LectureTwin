import type { ConceptNode, Evidence, Job, Workspace } from './types';

/** These selectors describe real workspace data; they never generate new claims. */
export function uploadFileKind(name: string): 'video' | 'slides' | 'transcript' | null {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'mp4') return 'video';
  if (extension === 'pdf' || extension === 'pptx') return 'slides';
  if (extension === 'vtt' || extension === 'json') return 'transcript';
  return null;
}
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
export function analysisControl(job: Job | null) {
  if (job?.status === 'paused' && job.pause_reason === 'guided_demo') return { action: 'resume', label: guidedNextAction(job).label, message: 'Đã hoàn tất công việc vừa chọn. Demo đang chờ bạn xem kết quả và bấm chạy bước tiếp theo.' } as const;
  switch (job?.status) {
    case 'needs_review': return { action: 'review', label: 'Duyệt kết quả phân tích', message: 'Đã đọc học liệu và tạo đề xuất. Hệ thống đang chờ giảng viên kiểm tra nguồn, không bị treo. Duyệt kết quả để hoàn tất bước phân tích.' } as const;
    case 'paused': return { action: 'resume', label: 'Tiếp tục phân tích', message: 'Lượt phân tích đang tạm dừng. Bấm Tiếp tục phân tích để chạy tiếp từ các bước đã lưu.' } as const;
    case 'failed': return { action: 'retry', label: 'Thử lại phân tích', message: job.error || 'Lượt phân tích chưa hoàn tất. Bạn có thể thử lại từ bước gặp lỗi.' } as const;
    case 'queued': case 'running': return { action: 'wait', label: 'Đang phân tích', message: 'Hệ thống đang đọc học liệu và liên kết ý chính với nguồn. Kết quả sẽ cập nhật khi từng bước hoàn tất.' } as const;
    case 'completed': return { action: 'start', label: 'Phân tích lại', message: 'Đã hoàn tất phân tích. Để thử phân bổ lại thời lượng, mở Thử thay đổi bài học; kết quả mô phỏng được tính riêng.' } as const;
    default: return { action: 'start', label: 'Bắt đầu phân tích', message: 'Phân tích tạo đề xuất có dẫn nguồn từ học liệu. Thử thay đổi bài học là bước riêng để so sánh phân bổ thời lượng.' } as const;
  }
}
export function guidedNextAction(job: Job | null) {
  if (!job) return { label: 'Đọc học liệu' };
  if (job.status === 'needs_review') return { label: 'Sang bước bạn duyệt' };
  if (job.status === 'failed') return { label: 'Thử lại bước gặp lỗi' };
  if (job.status === 'paused' && job.checkpoint === 'perception') return { label: 'Tiếp theo: Tìm ý chính' };
  if (job.status === 'paused' && job.checkpoint === 'knowledge') return { label: 'Tiếp theo: Đối chiếu nguồn' };
  return { label: 'Tiếp tục xử lý' };
}
export function analysisProgress(job: Job | null) {
  const agents = job?.agents || [];
  const read = agents.find(a => a.agent === 'perception');
  const knowledge = agents.find(a => a.agent === 'knowledge');
  const verify = agents.find(a => a.agent === 'verification');
  const verifiedAutomatically = verify?.status === 'needs_review' && verify.tools.some(tool => tool.name === 'validate_evidence' && tool.status === 'completed');
  const reviewed = verify?.status === 'completed' && Boolean(verify.teacher_reviewed_at);
  return [
    { id: 'read', title: 'Đọc học liệu', status: read?.status || 'idle', detail: read?.status === 'completed' ? `Đã đọc ${read.output?.result?.transcript_segments ?? 0} ghi chú và ${read.output?.result?.slide_pages ?? 0} trang trình chiếu.` : 'Đọc thông tin nguồn và các ghi chú được cung cấp.' },
    { id: 'knowledge', title: 'Tìm ý chính', status: knowledge?.status || 'idle', detail: knowledge?.status === 'completed' ? `Tìm thấy ${knowledge.output?.result?.concept_count ?? 0} ý chính, gắn với ${knowledge.output?.result?.evidence_count ?? 0} liên kết nguồn.` : 'Tìm từ khóa và gắn ý chính với đoạn nguồn tương ứng.' },
    { id: 'verify', title: 'Đối chiếu nguồn', status: verifiedAutomatically ? 'completed' : verify?.status || 'idle', detail: verifiedAutomatically || verify?.status === 'completed' ? 'Đã kiểm tra mốc dẫn chứng và đánh dấu các mục cần bạn xem.' : 'Kiểm tra mốc dẫn chứng và phát hiện mục thiếu nguồn.' },
    { id: 'review', title: 'Bạn duyệt', status: reviewed ? 'completed' : job?.status === 'needs_review' ? 'needs_review' : 'idle', detail: reviewed ? 'Đã lưu quyết định của giảng viên.' : job?.status === 'needs_review' ? 'Đang chờ bạn kiểm tra đề xuất. Hệ thống dừng tại đây để bạn quyết định.' : 'Mở sau khi hệ thống đã tạo đề xuất có dẫn nguồn.' },
  ];
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
