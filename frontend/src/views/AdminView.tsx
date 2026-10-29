import React, { useState, useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Users,
  Clock,
  Plus,
  AlertCircle,
  RefreshCw,
  X,
  CheckCircle2,
  Info
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { User, Role, AdminMonitoringData } from '../types';

export const AdminView: React.FC = () => {
  const { bootstrap } = useApp();
  const [users, setUsers] = useState<User[]>([]);
  const [monitoring, setMonitoring] = useState<AdminMonitoringData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newUsername, setNewUsername] = useState<string>('');
  const [newFullName, setNewFullName] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('demo123');
  const [newRole, setNewRole] = useState<Role>('teacher');
  const [selectedCourseId, setSelectedCourseId] = useState<string>('');

  const shouldReduceMotion = useReducedMotion();
  const availableCourses = bootstrap?.courses || [];

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [uList, mon] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminMonitoring()
      ]);
      setUsers(uList);
      setMonitoring(mon);
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Không thể tải dữ liệu quản trị hệ thống');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (availableCourses.length > 0 && !selectedCourseId) {
      setSelectedCourseId(availableCourses[0].id);
    }
  }, [bootstrap]);

  const handleToggleUser = async (userId: string, currentStatus: boolean) => {
    setErrorMsg(null);
    setMsg(null);
    try {
      const updated = await api.patchAdminUser(userId, { is_active: !currentStatus });
      setUsers(prev => prev.map(u => u.id === userId ? updated : u));
      setMsg(`Đã ${updated.is_active ? 'kích hoạt' : 'khóa'} tài khoản ${updated.username}`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi cập nhật người dùng');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newFullName.trim() || !newPassword.trim()) return;
    setErrorMsg(null);
    setMsg(null);

    try {
      const created = await api.createAdminUser({
        username: newUsername.trim(),
        full_name: newFullName.trim(),
        password: newPassword.trim(),
        role: newRole,
        course_ids: selectedCourseId ? [selectedCourseId] : []
      });
      setUsers(prev => [...prev, created]);
      setShowCreateModal(false);
      setNewUsername('');
      setNewFullName('');
      setNewPassword('demo123');
      setMsg(`Đã tạo tài khoản ${created.username} (${created.role}) thành công.`);
      await loadData();
    } catch (err: any) {
      setErrorMsg(err.detail || err.message || 'Lỗi khi tạo tài khoản người dùng');
    }
  };

  const metrics = monitoring?.metrics || bootstrap?.system || {
    active_jobs: 0,
    completed_jobs: 0,
    failed_jobs: 0,
    model_calls: 0,
    tokens: null,
    tool_calls: 0,
    total_latency_ms: 0
  };

  const auditLogs = monitoring?.audit || [];

  const formatActionName = (action: string) => {
    const key = (action || '').toUpperCase().trim();
    switch (key) {
      case 'LOGIN':
        return 'Đăng nhập';
      case 'DEMO_LOGIN':
        return 'Đăng nhập thử nghiệm';
      case 'LOGOUT':
      case 'USER_LOGOUT':
        return 'Đăng xuất';
      case 'CREATE_USER':
      case 'USER_CREATE':
        return 'Tạo tài khoản';
      case 'UPDATE_USER':
      case 'USER_PATCH':
      case 'PATCH_USER':
        return 'Cập nhật tài khoản';
      case 'CREATE_LECTURE':
        return 'Tạo bài giảng mới';
      case 'ATTACH_SAMPLE':
        return 'Gắn học liệu mẫu';
      case 'UPLOAD_ASSET':
        return 'Tải lên tệp học liệu';
      case 'JOB_CONTROL':
        return 'Điều khiển tiến trình xử lý';
      case 'START_WORKFLOW':
      case 'RUN_PIPELINE':
      case 'EXECUTE_JOB':
        return 'Khởi chạy luồng phân tích';
      case 'REVIEW_FINDING':
        return 'Duyệt đề xuất học liệu';
      case 'BULK_REVIEW':
        return 'Duyệt toàn bộ đề xuất';
      case 'PUBLISH_LECTURE':
      case 'REVIEW_LECTURE':
        return 'Xuất bản bài giảng';
      case 'PUBLISH_ASSESSMENT':
        return 'Xuất bản bài kiểm tra';
      case 'SUBMIT_ASSESSMENT':
        return 'Nộp bài kiểm tra';
      case 'CREATE_SCENARIO_VERSION':
        return 'Lưu kịch bản bài học';
      case 'EDIT_CONCEPT':
        return 'Chỉnh sửa khái niệm';
      case 'QUIZ_GENERATE':
        return 'Tạo câu hỏi trắc nghiệm';
      case 'TUTOR_QUERY':
        return 'Trợ lý học tập phản hồi';
      default:
        return 'Hoạt động hệ thống';
    }
  };

  const formatRoleName = (r: string) => {
    const roleKey = (r || '').toLowerCase().trim();
    if (roleKey === 'admin') return 'Quản trị viên';
    if (roleKey === 'teacher') return 'Giảng viên';
    if (roleKey === 'student') return 'Học viên';
    return r;
  };

  const formatLogDetail = (detail: unknown, action: string) => {
    if (detail === null || detail === undefined || detail === '') return 'Thao tác đã được ghi nhận.';
    if (typeof detail !== 'object') {
      const value = String(detail);
      const idLabels: Record<string, string> = {
        CREATE_USER: 'Mã tài khoản',
        UPDATE_USER: 'Mã tài khoản',
        PUBLISH_ASSESSMENT: 'Mã bài kiểm tra',
        CREATE_SCENARIO_VERSION: 'Mã kịch bản',
        EDIT_CONCEPT: 'Mã khái niệm',
      };
      const label = idLabels[(action || '').toUpperCase().trim()];
      return label ? `${label}: ${value}` : value;
    }

    const fields = detail as Record<string, unknown>;
    const parts: string[] = [];
    const add = (key: string, label: string, format?: (value: unknown) => string) => {
      const value = fields[key];
      if (value !== null && value !== undefined && value !== '') {
        parts.push(`${label}: ${format ? format(value) : String(value)}`);
      }
    };
    const workflowNames: Record<string, string> = {
      analysis: 'Phân tích bài giảng',
      tutor: 'Hỗ trợ học tập',
      assessment: 'Tạo bài kiểm tra',
      planning: 'Lập kế hoạch bài học',
    };
    const actionNames: Record<string, string> = { pause: 'Tạm dừng', cancel: 'Hủy' };
    const decisionNames: Record<string, string> = { confirm: 'Đã xác minh', reject: 'Loại khỏi nội dung' };

    add('username', 'Tài khoản');
    add('role', 'Vai trò', value => formatRoleName(String(value)));
    add('is_active', 'Trạng thái', value => value ? 'Hoạt động' : 'Tạm khóa');
    add('lecture_id', 'Bài giảng');
    add('version', 'Phiên bản', value => `v${String(value)}`);
    add('target', 'Mục tiêu');
    add('method', 'Phương thức');
    add('course_id', 'Học phần');
    add('finding_id', 'Đề xuất');
    add('status', 'Trạng thái');
    add('count', 'Số lượng');
    add('asset_id', 'Mã tệp học liệu');
    add('kind', 'Loại tệp');
    add('job_id', 'Mã tiến trình');
    add('assessment_id', 'Mã bài kiểm tra');
    add('attempt_id', 'Mã lượt làm bài');
    add('workflow', 'Quy trình', value => workflowNames[String(value)] || 'Quy trình học tập');
    add('decision', 'Quyết định', value => decisionNames[String(value)] || 'Đã ghi nhận');
    add('action', 'Thao tác', value => actionNames[String(value)] || 'Đã cập nhật');
    add('note', 'Ghi chú');

    return parts.length ? parts.join(' · ') : 'Chi tiết hoạt động đã được ghi nhận.';
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
            Quản trị hệ thống & Giám sát hoạt động
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
            Quản lý tài khoản và vận hành kỹ thuật. Quản trị viên không can thiệp hoặc thay đổi nội dung chuyên môn của giảng viên.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold text-[#12213b] bg-white border border-[#e1e7ef] hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer self-start sm:self-auto min-h-[44px]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2959ea]' : 'text-[#5f708b]'}`} />
          <span>Làm mới dữ liệu</span>
        </button>
      </div>

      {/* Honest system capability disclaimer */}
      <div className="bg-[#f0f4f9] border border-[#e1e7ef] rounded-xl p-3.5 text-xs text-[#5f708b] flex items-center gap-2.5">
        <Info className="w-4 h-4 text-[#2959ea] shrink-0" />
        <span>
          Hệ thống hiện vận hành dựa trên bộ quy tắc và học liệu thực hành biên soạn sẵn; chưa kích hoạt kết nối mô hình bên ngoài (LLM) hoặc nhận dạng giọng nói tự động (ASR).
        </span>
      </div>

      {msg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-[#12213b] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-[#2959ea] shrink-0" />
            <span>{msg}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-[#2959ea] font-bold p-1">✕</button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs sm:text-sm text-rose-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-700 font-bold p-1">✕</button>
        </div>
      )}

      {/* Real Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs">
          <span className="text-[#5f708b] block text-[11px] font-medium">Lượt thực thi công cụ</span>
          <div className="text-2xl font-bold text-[#2959ea] mt-1">
            {metrics.tool_calls ?? 0}
          </div>
          <span className="text-[10px] text-[#5f708b]">Công cụ phân tích nội bộ</span>
        </div>

        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs">
          <span className="text-[#5f708b] block text-[11px] font-medium">Lượt gọi mô hình bên ngoài</span>
          <div className="text-2xl font-bold text-[#12213b] mt-1">
            {metrics.model_calls}
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold">Quy tắc nội bộ (0 kết nối ngoài)</span>
        </div>

        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs">
          <span className="text-[#5f708b] block text-xs font-medium">Số lượng token</span>
          <div className="text-lg font-bold text-[#12213b] mt-1">
            {metrics.tokens == null ? 'Không phát sinh' : metrics.tokens}
          </div>
          <span className="text-xs text-[#5f708b]">Chưa sử dụng API bên ngoài</span>
        </div>

        <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs">
          <span className="text-[#5f708b] block text-[11px] font-medium">Tác vụ hoàn tất / Lỗi</span>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            {metrics.completed_jobs} <span className="text-sm font-normal text-rose-500">/ {metrics.failed_jobs}</span>
          </div>
          <span className="text-[10px] text-[#5f708b]">Tổng thời gian: {Math.round(metrics.total_latency_ms ?? 0)} ms</span>
        </div>
      </div>

      {/* User Accounts Management */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-[#2959ea]" />
            <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
              Quản lý tài khoản & Phân quyền ({users.length})
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-1 px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold bg-[#2959ea] text-white hover:bg-blue-700 cursor-pointer shadow-2xs min-h-[44px]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Thêm tài khoản</span>
          </button>
        </div>

        {users.length === 0 && !loading ? (
          <div className="text-center py-6 text-[#5f708b] text-xs">
            Chưa có tài khoản nào trong hệ thống.
          </div>
        ) : (
          <div className="divide-y divide-[#e1e7ef] text-xs">
            {users.map((u) => (
              <div key={u.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-bold text-[#12213b]">{u.full_name}</span>
                    <span className="font-mono text-[#5f708b] text-[11px]">(@{u.username})</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      u.role === 'admin' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                      u.role === 'teacher' ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}>
                      {u.role === 'admin' ? 'Quản trị' : u.role === 'teacher' ? 'Giảng viên' : 'Học viên'}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#5f708b] mt-0.5">
                    Học phần phụ trách: {u.course_ids && u.course_ids.length > 0 ? u.course_ids.join(', ') : 'Chưa phân công'}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`text-[11px] font-semibold ${u.is_active ? 'text-emerald-700' : 'text-[#5f708b]'}`}>
                    {u.is_active ? 'Hoạt động' : 'Tạm khóa'}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleUser(u.id, u.is_active)}
                    className="min-h-[40px] px-3 py-1.5 rounded-xl border border-[#e1e7ef] text-[#12213b] hover:bg-slate-50 text-xs font-semibold cursor-pointer"
                  >
                    {u.is_active ? 'Khóa' : 'Kích hoạt'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Real Audit Logs */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-[#2959ea]" />
          <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
            Nhật ký hoạt động hệ thống ({auditLogs.length})
          </h2>
        </div>

        {auditLogs.length === 0 ? (
          <div className="text-center py-6 text-[#5f708b] text-xs">
            Chưa ghi nhận sự kiện hoạt động nào.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto space-y-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="p-3 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[10px] text-[#5f708b]">{log.id}</span>
                    <span className="font-bold text-[#12213b]">{formatActionName(log.action)}</span>
                    <span className="text-[10px] bg-slate-200/80 text-[#12213b] px-1.5 py-0.5 rounded font-medium">
                      {log.actor_id} ({formatRoleName(log.actor_role)})
                    </span>
                  </div>
                  <p className="text-[#5f708b] text-[11px] leading-relaxed">
                    {formatLogDetail(log.detail, log.action)}
                  </p>
                </div>

                <div className="text-[10px] font-mono text-[#5f708b] shrink-0">
                  {new Date(log.created_at).toLocaleString('vi-VN')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Add User */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-[#12213b]/60 backdrop-blur-xs" onClick={() => setShowCreateModal(false)} />
          <div className="relative bg-white rounded-2xl max-w-sm w-full p-5 border border-[#e1e7ef] shadow-xl space-y-3 z-10 text-xs">
            <div className="flex items-center justify-between border-b border-[#e1e7ef] pb-2">
              <h3 className="font-bold text-sm text-[#12213b]">Thêm người dùng mới</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-[#12213b]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block font-bold text-[#12213b] mb-1">Tên đăng nhập:</label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#12213b] mb-1">Mật khẩu:</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#12213b] mb-1">Họ và tên hiển thị:</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-[#12213b] mb-1">Vai trò:</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as Role)}
                  className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                >
                  <option value="teacher">Giảng viên</option>
                  <option value="student">Học viên</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>

              {availableCourses.length > 0 && (
                <div>
                  <label className="block font-bold text-[#12213b] mb-1">Gán học phần:</label>
                  <select
                    value={selectedCourseId}
                    onChange={e => setSelectedCourseId(e.target.value)}
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-2.5 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea]"
                  >
                    {availableCourses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2 border-t border-[#e1e7ef]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 text-[#5f708b] hover:bg-slate-100 rounded-xl"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#2959ea] hover:bg-blue-700 text-white rounded-xl font-semibold shadow-xs min-h-[44px]"
                >
                  Tạo tài khoản
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
};
