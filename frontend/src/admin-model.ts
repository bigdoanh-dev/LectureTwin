import type { AdminMonitoringData, AuditRecord, Course, Job, LectureSummary, Role, User } from './types';

export const adminRoleLabels: Record<Role, string> = { admin: 'Quản trị viên', teacher: 'Giảng viên', student: 'Học viên' };
export const adminWorkflowLabels: Record<Job['workflow'], string> = { analysis: 'Phân tích bài giảng', tutor: 'Hỗ trợ học tập', assessment: 'Tạo bài kiểm tra', planning: 'Lập kế hoạch bài học' };
export const adminJobStatusLabels: Record<Job['status'], string> = { queued: 'Đợi xử lý', running: 'Đang chạy', paused: 'Tạm dừng', needs_review: 'Chờ giảng viên duyệt', completed: 'Hoàn tất', failed: 'Gặp lỗi', cancelled: 'Đã hủy' };

function searchable(text: string) {
  return text.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/g, 'd').trim();
}

export function filterAdminUsers(users: User[], filters: { query?: string; role?: string; status?: string; courseId?: string } = {}) {
  const query = searchable(filters.query ?? '');
  return users.filter(user => (!filters.role || filters.role === 'all' || user.role === filters.role)
    && (!filters.status || filters.status === 'all' || (filters.status === 'active' ? user.is_active : !user.is_active))
    && (!filters.courseId || filters.courseId === 'all' || user.course_ids.includes(filters.courseId))
    && (!query || searchable(`${user.full_name} ${user.username} ${adminRoleLabels[user.role]}`).includes(query)));
}

export function adminAccountSummary(users: User[] | null, courses: Course[]) {
  if (users === null) return null;
  return {
    total: users.length,
    active: users.filter(user => user.is_active).length,
    disabled: users.filter(user => !user.is_active).length,
    unassigned: users.filter(user => user.role !== 'admin' && user.course_ids.length === 0).length,
    courses: courses.map(course => ({ ...course,
      teachers: users.filter(user => user.role === 'teacher' && user.course_ids.includes(course.id)).length,
      students: users.filter(user => user.role === 'student' && user.course_ids.includes(course.id)).length,
    })),
  };
}

export function adminOperationSummary(monitoring: AdminMonitoringData | null) {
  if (!monitoring) return null;
  const jobs = monitoring.jobs;
  return {
    processing: jobs.filter(job => ['queued', 'running'].includes(job.status)).length,
    needsReview: jobs.filter(job => job.status === 'needs_review').length,
    paused: jobs.filter(job => job.status === 'paused').length,
    completed: jobs.filter(job => job.status === 'completed').length,
    failed: jobs.filter(job => job.status === 'failed').length,
    cancelled: jobs.filter(job => job.status === 'cancelled').length,
    configuredAgents: monitoring.agents.length,
  };
}

export function filterAdminJobs(jobs: Job[], filters: { workflow?: string; status?: string; query?: string } = {}, lectures: LectureSummary[] = []) {
  const query = searchable(filters.query ?? '');
  return jobs.filter(job => (!filters.workflow || filters.workflow === 'all' || job.workflow === filters.workflow)
    && (!filters.status || filters.status === 'all' || job.status === filters.status)
    && (!query || searchable(`${job.id} ${lectures.find(lecture => lecture.id === job.lecture_id)?.title ?? job.lecture_id} ${adminWorkflowLabels[job.workflow]}`).includes(query)));
}

const auditActions: Record<string, string> = {
  LOGIN: 'Đăng nhập', DEMO_LOGIN: 'Đăng nhập thử nghiệm', LOGOUT: 'Đăng xuất',
  CREATE_USER: 'Tạo tài khoản', UPDATE_USER: 'Cập nhật tài khoản', CREATE_LECTURE: 'Tạo bài giảng',
  ATTACH_SAMPLE: 'Gắn học liệu mẫu', UPLOAD_ASSET: 'Tải học liệu lên', START_WORKFLOW: 'Bắt đầu xử lý',
  JOB_CONTROL: 'Điều khiển tiến trình', REVIEW_FINDING: 'Xác nhận nội dung', BULK_REVIEW: 'Duyệt nội dung bài giảng',
  PUBLISH_LECTURE: 'Xuất bản bài giảng', PUBLISH_ASSESSMENT: 'Giao bài kiểm tra', SUBMIT_ASSESSMENT: 'Nộp bài kiểm tra',
  REVIEW_CLO_MAPPING: 'Liên kết mục tiêu bài học', CREATE_SCENARIO_VERSION: 'Lưu phiên bản bài học', EDIT_CONCEPT: 'Chỉnh sửa kiến thức',
};

export function adminAuditPresentation(entry: AuditRecord, users: User[] = [], lectures: LectureSummary[] = [], courses: Course[] = []) {
  const actor = users.find(user => user.id === entry.actor_id);
  const lecture = lectures.find(item => item.id === entry.lecture_id);
  const title = auditActions[entry.action] ?? 'Hoạt động hệ thống';
  let detail = '';
  if (typeof entry.detail === 'string') {
    const targetUser = users.find(user => user.id === entry.detail);
    if (['CREATE_USER', 'UPDATE_USER'].includes(entry.action)) detail = targetUser ? `${targetUser.full_name} (@${targetUser.username})` : 'Thông tin tài khoản đã được cập nhật.';
    else if (['REVIEW_CLO_MAPPING', 'EDIT_CONCEPT', 'PUBLISH_ASSESSMENT', 'CREATE_SCENARIO_VERSION'].includes(entry.action)) detail = 'Thao tác đã được ghi nhận.';
    else detail = entry.detail;
  } else if (entry.detail && typeof entry.detail === 'object') {
    const fields = entry.detail as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof fields.workflow === 'string') parts.push(adminWorkflowLabels[fields.workflow as Job['workflow']] ?? 'Xử lý học liệu');
    if (typeof fields.version === 'number') parts.push(`Phiên bản ${fields.version}`);
    if (typeof fields.action === 'string') parts.push(({ pause: 'Tạm dừng', resume: 'Tiếp tục', retry: 'Thử lại', cancel: 'Hủy' } as Record<string, string>)[fields.action] ?? 'Cập nhật tiến trình');
    if (typeof fields.decision === 'string') parts.push(fields.decision === 'confirm' ? 'Xác nhận có nguồn' : 'Loại nội dung chưa đủ nguồn');
    if (typeof fields.kind === 'string') parts.push(({ video: 'Video', slides: 'Tài liệu trình chiếu', transcript: 'Bản ghi lời thoại' } as Record<string, string>)[fields.kind] ?? 'Học liệu');
    if (typeof fields.course_id === 'string') parts.push(courses.find(course => course.id === fields.course_id)?.title ?? 'Khóa học được cập nhật');
    // Never copy arbitrary payload keys, student answers or questions into the admin feed.
    detail = parts.join(' · ');
  }
  return { title, actor: actor?.full_name ?? adminRoleLabels[entry.actor_role] ?? 'Tài khoản hệ thống', username: actor?.username,
    role: adminRoleLabels[entry.actor_role] ?? 'Hệ thống', detail: [lecture?.title, detail].filter(Boolean).join(' · ') || 'Thao tác đã được ghi nhận.' };
}
