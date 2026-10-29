export type Role = 'admin' | 'teacher' | 'student';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  course_ids: string[];
}

export interface Course {
  id: string;
  title: string;
  code: string;
}

export interface LectureSummary {
  id: string;
  title: string;
  course_id: string;
  owner_id: string;
  status: 'draft' | 'published';
  version: number;
  published_version: number | null;
  updated_at: string;
  objectives: string[];
  total_minutes: number;
  sample_attached: boolean;
  guided_demo?: boolean;
  analysis_current?: boolean;
  concept_count: number;
  open_findings: number;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  tools: string[];
  input_schema?: any;
  output_schema?: any;
  mode: 'rule_based';
}

export interface SystemMetrics {
  active_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  model_calls: number;
  tokens: null | number;
  tool_calls?: number;
  total_latency_ms?: number;
}

export interface BootstrapData {
  upload_limit_mb?: number;
  user: User;
  mode: 'DEMO_FALLBACK';
  provider_note: string;
  courses: Course[];
  lectures: LectureSummary[];
  agents: AgentDefinition[];
  system: SystemMetrics;
}

export interface Evidence {
  id: string;
  concept_id: string;
  kind: 'transcript' | 'slide' | 'video';
  start: number | null;
  end: number | null;
  text: string;
  slide_page?: number;
  source_type: string;
  source_url?: string | null;
  youtube_video_id?: string | null;
  source_name?: string | null;
  verified: boolean;
  valid: boolean;
}

export interface Finding {
  id: string;
  concept_id: string;
  title: string;
  description: string;
  severity: 'info' | 'warning';
  has_evidence: boolean;
  source_ids: string[];
  status: 'pending' | 'confirmed' | 'rejected';
  note?: string;
}

export interface AgentToolInvocation {
  name: string;
  input: any;
  output: any;
  status: string;
  duration_ms?: number;
  error?: string;
}

export interface AgentRun {
  id: string;
  agent: 'orchestrator' | 'perception' | 'knowledge' | 'verification' | 'pedagogical' | 'planning' | 'tutor' | 'assessment';
  status: 'queued' | 'running' | 'completed' | 'needs_review' | 'failed' | 'cancelled';
  started_at?: string;
  finished_at?: string;
  duration_ms?: number;
  teacher_reviewed_at?: string;
  input?: any;
  output?: any;
  tools: AgentToolInvocation[];
  handoff_to: string | null;
  model_calls: number;
  tokens: null | number;
  error?: string;
}

export interface Job {
  id: string;
  lecture_id: string;
  workflow: 'analysis' | 'tutor' | 'assessment' | 'planning';
  status: 'queued' | 'running' | 'paused' | 'needs_review' | 'completed' | 'failed' | 'cancelled';
  owner_id: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  progress: number;
  input: any;
  output?: any;
  result?: any;
  error?: string;
  agents: AgentRun[];
  checkpoint?: 'perception' | 'knowledge';
  pause_reason?: string;
}

export interface PlannedSegment {
  concept_ids?: string[];
  id: string;
  title: string;
  concept_id: string;
  kind: 'theory' | 'practice' | 'intro' | 'summary';
  minutes: number;
}

export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  verified: boolean;
  evidence_ids: string[];
  x: number;
  y: number;
}

export interface ConceptEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
}

export interface AssessmentQuestion {
  id: string;
  text: string;
  concept_id: string;
  evidence_id?: string;
  options: Array<{ id: string; text: string }>;
  correct_option_id?: string;
  explanation?: string;
}

export interface Assessment {
  id: string;
  version: number;
  title: string;
  lecture_id: string;
  status: 'draft' | 'published';
  questions: AssessmentQuestion[];
  created_at: string;
}

export interface ScenarioComparison {
  baseline_total: number;
  scenario_total: number;
  practice_delta: number;
  feasible: boolean;
  violations: string[];
  assumptions: string[];
  baseline_segments: PlannedSegment[];
  scenario_segments: PlannedSegment[];
}

export interface Scenario {
  id: string;
  title: string;
  lecture_id: string;
  base_version: number;
  request: string;
  comparison: ScenarioComparison;
  created_at: string;
  status: 'draft';
  segments: PlannedSegment[];
}

export interface TwinSnapshot {
  id: string;
  event: string;
  version: number;
  created_at: string;
  summary: string;
}

export interface LectureTwinData {
  planned: {
    objectives: string[];
    segments: PlannedSegment[];
    total_minutes: number;
    origin?: string;
    source_version?: number;
  };
  observed: {
    concepts: number;
    verified: number;
    open_findings: number;
    source_mode: string;
  };
  evaluated: {
    attempt_count: number;
    average_score: number | null;
    concept_results: Array<{ concept_id: string; correct: number; total: number }>;
  };
  scenarios: {
    count: number;
  };
  snapshots: TwinSnapshot[];
}

export interface StudentProgress {
  position_seconds: number;
  completed: boolean;
  bookmarks: Array<{ id: string; seconds: number; label: string }>;
}

export interface Workspace {
  capabilities?: { can_generate_assessment: boolean };
  lecture: LectureSummary;
  planned: {
    objectives: string[];
    segments: PlannedSegment[];
    total_minutes: number;
    origin?: string;
    source_version?: number;
  };
  assets: Array<{
    id: string;
    kind: 'video' | 'slides' | 'transcript';
    name: string;
    status: string;
    source_type: string;
    url?: string;
    duration_seconds?: number;
    youtube_video_id?: string;
    notes?: string;
  }>;
  transcript: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    source_type: string;
  }>;
  slides: Array<{
    page: number;
    title: string;
    text: string;
    start: number;
    end: number;
  }>;
  concepts: ConceptNode[];
  edges: ConceptEdge[];
  evidence: Evidence[];
  findings: Finding[];
  jobs: Job[];
  twin: LectureTwinData;
  assessments: Assessment[];
  scenarios: Scenario[];
  progress: StudentProgress;
}

export interface QuizSubmissionResult {
  id: string;
  score: number;
  correct_count: number;
  total: number;
  feedback: Array<{
    question_id: string;
    correct: boolean;
    explanation: string;
    evidence_id?: string;
  }>;
  submitted_at: string;
}

export interface AuditRecord {
  id: string;
  actor_id: string;
  actor_role: Role;
  action: string;
  detail: string;
  lecture_id: string | null;
  created_at: string;
}

export interface AdminMonitoringData {
  jobs: Job[];
  audit: AuditRecord[];
  agents: AgentDefinition[];
  metrics: SystemMetrics;
  provider_note: string;
}

export type ViewType =
  | 'ai'          // Clear input -> proposal -> teacher review workspace
  | 'tutor'       // Focus the grounded tutor in the student workspace
  | 'agents'      // Trung tâm tác nhân (Primary)
  | 'lectures'    // Bài giảng
  | 'graph'       // Tri thức & bằng chứng
  | 'twin'        // Lecture Twin
  | 'simulation'  // Mô phỏng
  | 'assessment'  // Đánh giá
  | 'student'     // Học tập (Student mode)
  | 'admin';      // Quản trị (Admin mode)
