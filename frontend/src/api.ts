import type {
  BootstrapData,
  Workspace,
  Job,
  LectureSummary,
  Role,
  QuizSubmissionResult,
  AdminMonitoringData,
  User
} from './types';

const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(message: string, detail?: string, status = 0) {

    super(detail || message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail || message;
  }
}

class ApiService {
  private token: string | null = null;
  private sessionQueue: Promise<unknown> = Promise.resolve();

  constructor() {
    try { this.token = localStorage.getItem('lecture_twin_token'); } catch { /* Cookie-only session remains usable. */ }
  }

  setToken(token: string | null) {
    this.token = token;
    try { if (token) {
      localStorage.setItem('lecture_twin_token', token);
    } else {
      localStorage.removeItem('lecture_twin_token');
    } } catch { /* Keep in-memory token when browser storage is unavailable. */ }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string> || {}),
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config: RequestInit = {
      ...options,
      headers,
      credentials: 'same-origin',
    };

    const res = await fetch(`${BASE_URL}${endpoint}`, config);

    if (!res.ok) {
      let detail = `Lỗi hệ thống (${res.status})`;
      try {
        const data = await res.json();
        if (data && data.detail) {
          detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
        }
      } catch {
        // ignore
      }
      throw new ApiError(`HTTP ${res.status}`, detail, res.status);
    }

    if (res.status === 204) {
      return {} as T;
    }

    return res.json();
  }

  // --- Auth Endpoints ---
  async health(): Promise<{ status: string }> {
    return this.request<{ status: string }>('/health');
  }

  async login(username: string, password: string): Promise<{ access_token: string; user: User }> {
    const task = this.sessionQueue.catch(() => undefined).then(async () => {
      const result = await this.request<{ access_token: string; user: User }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ username, password }),
      });
      this.setToken(result.access_token);
      return result;
    });
    this.sessionQueue = task;
    return task;
  }

  async demoLogin(role: Role): Promise<{ access_token: string; user: User }> {
    const task = this.sessionQueue.catch(() => undefined).then(async () => {
      const result = await this.request<{ access_token: string; user: User }>('/auth/demo-login', {
        method: 'POST', body: JSON.stringify({ role }),
      });
      this.setToken(result.access_token);
      return result;
    });
    this.sessionQueue = task;
    return task;
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async logout(): Promise<void> {
    const task = this.sessionQueue.catch(() => undefined).then(async () => {
      try {
        await this.request('/auth/logout', { method: 'POST' });
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401) throw error;
      }
      this.setToken(null);
    });
    this.sessionQueue = task;
    return task;
  }

  // --- Bootstrap ---
  async getBootstrap(): Promise<BootstrapData> {
    return this.request<BootstrapData>('/bootstrap');
  }

  // --- Lecture Management ---
  async createLecture(data: {
    title: string;
    course_id: string;
    objectives: string[];
    total_minutes: number;
  }): Promise<LectureSummary> {
    return this.request<LectureSummary>('/lectures', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getWorkspace(lectureId: string): Promise<Workspace> {
    return this.request<Workspace>(`/lectures/${lectureId}`);
  }

  async attachSample(lectureId: string): Promise<Workspace> {
    return this.request<Workspace>(`/lectures/${lectureId}/sample`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async uploadAsset(lectureId: string, file: File, kind: 'video' | 'slides' | 'transcript'): Promise<any> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);
    return this.request<any>(`/lectures/${lectureId}/assets`, {
      method: 'POST',
      body: formData,
    });
  }

  // --- Execution & Multi-Agent Jobs ---
  async startAnalysis(lectureId: string): Promise<Job> {
    return this.request<Job>(`/lectures/${lectureId}/analyze`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async getJob(jobId: string, signal?: AbortSignal): Promise<Job> {
    return this.request<Job>(`/jobs/${jobId}`, { signal });
  }

  // Wait for actual backend state; abort when the calling screen changes.
  async waitForJob(initial: Job, signal?: AbortSignal): Promise<Job> {
    let job = initial;
    while (job.status === 'queued' || job.status === 'running') {
      await new Promise<void>((resolve, reject) => {
        if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
        const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
        const timer = window.setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 800);
        signal?.addEventListener('abort', onAbort, { once: true });
      });
      job = await this.getJob(job.id, signal);
    }
    return job;
  }

  async patchLecture(id: string, data: { title?: string; objectives?: string[] }): Promise<LectureSummary> {
    return this.request<LectureSummary>(`/lectures/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  }
  async patchConcept(lid: string, cid: string, data: { label: string; description: string }): Promise<Workspace> {
    return this.request<Workspace>(`/lectures/${lid}/concepts/${cid}`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  async controlJob(jobId: string, action: 'pause' | 'resume' | 'cancel' | 'retry'): Promise<Job> {
    return this.request<Job>(`/jobs/${jobId}/control`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  }

  async listLectureJobs(lectureId: string): Promise<Job[]> {
    return this.request<Job[]>(`/lectures/${lectureId}/jobs`);
  }

  // --- Review Gates & Findings ---
  async decideFinding(
    lectureId: string,
    findingId: string,
    decision: 'confirm' | 'reject',
    note?: string
  ): Promise<any> {
    return this.request<any>(`/lectures/${lectureId}/findings/${findingId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, note }),
    });
  }

  async bulkReview(lectureId: string, note: string): Promise<any> {
    return this.request<any>(`/lectures/${lectureId}/review`, {
      method: 'POST',
      body: JSON.stringify({ exclude_unsupported: true, note }),
    });
  }

  async publishLecture(lectureId: string): Promise<LectureSummary> {
    return this.request<LectureSummary>(`/lectures/${lectureId}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // --- Knowledge Graph Query ---
  async queryGraph(lectureId: string, query: string): Promise<{ nodes: any[]; edges: any[]; evidence: any[] }> {
    const q = encodeURIComponent(query);
    return this.request<{ nodes: any[]; edges: any[]; evidence: any[] }>(`/lectures/${lectureId}/graph?q=${q}`);
  }

  // --- Student Tutor ---
  async askTutor(lectureId: string, question: string): Promise<Job> {
    return this.request<Job>(`/lectures/${lectureId}/tutor`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  }

  // --- Assessment & Analytics ---
  async generateAssessment(lectureId: string): Promise<Job> {
    return this.request<Job>(`/lectures/${lectureId}/assessments/generate`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async patchAssessment(assessmentId: string, data: { title?: string; questions?: any[] }): Promise<any> {
    return this.request<any>(`/assessments/${assessmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async publishAssessment(assessmentId: string): Promise<any> {
    return this.request<any>(`/assessments/${assessmentId}/publish`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async submitQuiz(assessmentId: string, answers: Record<string, string>): Promise<QuizSubmissionResult> {
    return this.request<QuizSubmissionResult>(`/assessments/${assessmentId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });
  }

  async getLectureAnalytics(lectureId: string): Promise<any> {
    return this.request<any>(`/lectures/${lectureId}/analytics`);
  }

  // --- Simulation & What-if ---
  async runScenario(lectureId: string, data: {
    title?: string;
    request: string;
    add_practice_minutes: number;
    total_limit?: number;
  }): Promise<Job> {
    return this.request<Job>(`/lectures/${lectureId}/scenarios`, {
      method: 'POST',
      body: JSON.stringify({ total_limit: 50, ...data }),
    });
  }

  async createScenarioVersion(scenarioId: string): Promise<LectureSummary> {
    return this.request<LectureSummary>(`/scenarios/${scenarioId}/create-version`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // --- Student Progress & Bookmarks ---
  async updateProgress(lectureId: string, data: { position_seconds: number; completed?: boolean }): Promise<any> {
    return this.request<any>(`/lectures/${lectureId}/progress`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async addBookmark(lectureId: string, data: { seconds: number; label: string }): Promise<any> {
    return this.request<any>(`/lectures/${lectureId}/bookmarks`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // --- Admin Governance ---
  async getAdminUsers(): Promise<User[]> {
    return this.request<User[]>('/admin/users');
  }

  async createAdminUser(data: {
    username: string;
    full_name: string;
    role: Role;
    password?: string;
    course_ids: string[];
  }): Promise<User> {
    return this.request<User>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async patchAdminUser(userId: string, data: { is_active?: boolean; course_ids?: string[] }): Promise<User> {
    return this.request<User>(`/admin/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getAdminMonitoring(): Promise<AdminMonitoringData> {
    return this.request<AdminMonitoringData>('/admin/monitoring');
  }
}

export const api = new ApiService();
