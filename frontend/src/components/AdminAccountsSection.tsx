import React, { useState } from 'react';
import {
  Users,
  UserCheck,
  Lock,
  Unlock,
  Plus,
  RefreshCw,
  Search,
  BookOpen,
  Shield,
  GraduationCap,
  Clock,
  ArrowRight,
  AlertCircle,
  XCircle,
  HelpCircle
} from 'lucide-react';
import {
  adminRoleLabels,
  filterAdminUsers,
  adminAccountSummary,
  adminAuditPresentation
} from '../admin-model';
import type { User, Course, AuditRecord, LectureSummary } from '../types';

interface AdminAccountsSectionProps {
  users: User[] | null;
  courses: Course[];
  currentUser: User | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onToggleStatus: (user: User) => void;
  onAssignCourses: (user: User) => void;
  auditLogs: AuditRecord[];
  auditError: string | null;
  auditLoading: boolean;
  lectures: LectureSummary[];
  onNavigateToOperations: () => void;
  lastFetched: Date | null;
  pendingUserId?: string | null;
}

function formatShortTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  } catch {
    return isoString;
  }
}

export const AdminAccountsSection: React.FC<AdminAccountsSectionProps> = ({
  users,
  courses,
  currentUser,
  loading,
  error,
  onRefresh,
  onOpenCreate,
  onToggleStatus,
  onAssignCourses,
  auditLogs,
  auditError,
  auditLoading,
  lectures,
  onNavigateToOperations,
  lastFetched,
  pendingUserId
}) => {
  const [query, setQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [courseFilter, setCourseFilter] = useState<string>('all');

  const summary = adminAccountSummary(users, courses);
  const filteredUsers = filterAdminUsers(users || [], {
    query,
    role: roleFilter,
    status: statusFilter,
    courseId: courseFilter
  });

  const hasActiveFilters = query.trim() !== '' || roleFilter !== 'all' || statusFilter !== 'all' || courseFilter !== 'all';

  const resetFilters = () => {
    setQuery('');
    setRoleFilter('all');
    setStatusFilter('all');
    setCourseFilter('all');
  };

  const getCourseTitle = (courseId: string) => {
    const c = courses.find(item => item.id === courseId);
    return c ? c.title : 'Khóa học không còn trong danh sách';
  };

  const getRoleInitials = (role: string) => {
    if (role === 'admin') return 'AD';
    if (role === 'student') return 'HV';
    return 'GV';
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-[28px] font-bold text-[#12213b] tracking-tight leading-tight">
            Không gian quản trị
          </h1>
          <p className="text-sm text-[#5f708b] font-medium mt-1">
            Quản lý người dùng, quyền truy cập và hoạt động hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto flex-wrap">
          {lastFetched && (
            <span className="text-xs text-[#5f708b] hidden md:inline">
              Đã tải lúc: {formatShortTime(lastFetched.toISOString())}
            </span>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-[#12213b] bg-white border border-[#e1e7ef] hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer min-h-[44px] disabled:opacity-50"
            title="Tải lại danh sách tài khoản"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#2959ea]' : 'text-[#5f708b]'}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={onOpenCreate}
            disabled={loading || !users}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-[#2959ea] text-white hover:bg-blue-700 shadow-2xs transition-colors cursor-pointer min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>Thêm tài khoản</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex items-start justify-between gap-3 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Lỗi tải dữ liệu tài khoản</p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-900 rounded-lg text-xs font-semibold cursor-pointer shrink-0 min-h-[44px]"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Main Grid: Left 2/3 (Stats & Accounts) & Right 1/3 (Role Permissions & Course Directory) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 2/3 (Col 8) */}
        <div className="lg:col-span-8 min-w-0 space-y-6">
          {/* Top 3 Compact Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            {/* Total */}
            <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2959ea] flex items-center justify-center shrink-0 border border-blue-100">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#5f708b] block">Tổng tài khoản</span>
                <div className="text-2xl font-bold text-[#12213b] leading-tight mt-0.5">
                  {summary ? summary.total : '—'}
                </div>
              </div>
            </div>

            {/* Active */}
            <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                <UserCheck className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#5f708b] block">Đang hoạt động</span>
                <div className="text-2xl font-bold text-emerald-600 leading-tight mt-0.5">
                  {summary ? summary.active : '—'}
                </div>
              </div>
            </div>

            {/* Disabled */}
            <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 shadow-2xs flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                <Lock className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-[#5f708b] block">Tạm khóa</span>
                <div className="text-2xl font-bold text-amber-600 leading-tight mt-0.5">
                  {summary ? summary.disabled : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Accounts Table Card */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-4 sm:p-6 shadow-2xs space-y-4">
            {/* Header & Filter Controls */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-base text-[#12213b]">
                    Tài khoản & quyền truy cập
                  </h2>
                  <p className="text-xs text-[#5f708b] mt-0.5">
                    {users ? `Hiển thị ${filteredUsers.length} / ${users.length} tài khoản` : loading ? 'Đang tải tài khoản…' : 'Chưa tải được danh sách tài khoản'}
                  </p>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex items-center gap-1 text-xs text-[#2959ea] hover:underline cursor-pointer self-start sm:self-auto"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Đặt lại bộ lọc</span>
                  </button>
                )}
              </div>

              {/* Filters Row */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                {/* Search */}
                <div className="sm:col-span-5 relative">
                  <Search className="w-4 h-4 text-[#5f708b] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Tìm tên hoặc tài khoản..."
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl pl-9 pr-3 py-2 text-sm text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors"
                  />
                </div>

                {/* Role select */}
                <div className="sm:col-span-3">
                  <select
                    aria-label="Lọc vai trò tài khoản"
                    value={roleFilter}
                    onChange={e => setRoleFilter(e.target.value)}
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors cursor-pointer min-h-[44px]"
                  >
                    <option value="all">Tất cả vai trò</option>
                    <option value="teacher">Giảng viên</option>
                    <option value="student">Học viên</option>
                    <option value="admin">Quản trị viên</option>
                  </select>
                </div>

                {/* Status select */}
                <div className="sm:col-span-2">
                  <select
                    aria-label="Lọc trạng thái tài khoản"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-2.5 py-2 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors cursor-pointer min-h-[44px]"
                  >
                    <option value="all">Tất cả trạng thái</option>
                    <option value="active">Đang hoạt động</option>
                    <option value="disabled">Tạm khóa</option>
                  </select>
                </div>

                {/* Course select */}
                <div className="sm:col-span-2">
                  <select
                    aria-label="Lọc khóa học"
                    value={courseFilter}
                    onChange={e => setCourseFilter(e.target.value)}
                    className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-2.5 py-2 text-xs text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors cursor-pointer min-h-[44px]"
                  >
                    <option value="all">Tất cả khóa</option>
                    {courses.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* List / Table Content */}
            {loading && !users ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-[#5f708b] space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin text-[#2959ea]" />
                <span>Đang tải danh sách tài khoản...</span>
              </div>
            ) : !users ? (
              <p className="py-8 text-sm text-[#5f708b]">Danh sách chưa tải được. Chọn Thử lại để kết nối lại.</p>
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 text-center space-y-2 border border-dashed border-[#e1e7ef] rounded-xl p-6">
                <Users className="w-8 h-8 text-[#5f708b]/50 mx-auto" />
                <p className="text-xs font-semibold text-[#12213b]">
                  {hasActiveFilters
                    ? 'Không có tài khoản nào phù hợp với bộ lọc hiện tại.'
                    : 'Chưa có tài khoản nào trong hệ thống.'}
                </p>
                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-[#2959ea] font-semibold hover:underline cursor-pointer"
                  >
                    Xóa bộ lọc để xem toàn bộ danh sách
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenCreate}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-[#2959ea] text-white rounded-xl cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Thêm tài khoản đầu tiên</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table (Visible >= 768px) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full table-fixed text-left text-[13px]">
                    <colgroup><col className="w-[26%]" /><col className="w-[13%]" /><col className="w-[22%]" /><col className="w-[17%]" /><col className="w-[22%]" /></colgroup>
                    <thead>
                      <tr className="border-b border-[#e1e7ef] text-[#5f708b] font-semibold">
                        <th className="pb-3 pl-1">Người dùng</th>
                        <th className="pb-3 px-2">Vai trò</th>
                        <th className="pb-3 px-2">Khóa học được gán</th>
                        <th className="pb-3 px-2">Trạng thái</th>
                        <th className="pb-3 pr-1 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e1e7ef]/80">
                      {filteredUsers.map(user => {
                        const isSelf = user.id === currentUser?.id;
                        const isPending = pendingUserId === user.id;

                        return (
                          <tr key={user.id} className="hover:bg-slate-50/70 transition-colors">
                            {/* User details */}
                            <td className="py-3 pl-1 pr-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                  user.role === 'admin'
                                    ? 'bg-purple-100 text-purple-700'
                                    : user.role === 'teacher'
                                    ? 'bg-blue-100 text-[#2959ea]'
                                    : 'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {getRoleInitials(user.role)}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-bold text-[#12213b] truncate block max-w-full">
                                      {user.full_name}
                                    </span>
                                    {isSelf && (
                                      <span className="bg-blue-50 text-[#2959ea] border border-blue-200 text-xs font-bold px-1.5 py-0.2 rounded-md shrink-0">
                                        Tài khoản hiện tại
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-xs text-[#5f708b] block">
                                    @{user.username}
                                  </span>
                                </div>
                              </div>
                            </td>

                            {/* Role (Readonly) */}
                            <td className="py-3 px-2">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full whitespace-nowrap text-xs font-bold ${
                                user.role === 'admin'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : user.role === 'teacher'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}>
                                {adminRoleLabels[user.role] || user.role}
                              </span>
                            </td>

                            {/* Assigned courses */}
                            <td className="py-3 px-2 text-[#5f708b] max-w-[200px] overflow-hidden">
                              {user.role === 'admin' ? (
                                <span className="text-xs text-[#5f708b]">Toàn hệ thống</span>
                              ) : user.course_ids && user.course_ids.length > 0 ? (
                                <div className="truncate text-xs font-medium text-[#12213b]" title={user.course_ids.map(getCourseTitle).join(', ')}>
                                  {user.course_ids.map(getCourseTitle).join(', ')}
                                </div>
                              ) : (
                                <span className="text-amber-600 text-xs font-medium">Chưa gán</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
                                <span className={`w-2 h-2 rounded-full ${user.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                <span className={user.is_active ? 'text-emerald-700 whitespace-nowrap' : 'text-[#5f708b] whitespace-nowrap'}>
                                  {user.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                                </span>
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3 pr-1 pl-2 text-right">
                              <div className="inline-flex items-center gap-1.5 justify-end">
                                {/* Assign courses button (enabled for all roles) */}
                                <button
                                  type="button"
                                  onClick={() => onAssignCourses(user)}
                                  disabled={isPending || user.role === 'admin'}
                                  className="inline-flex items-center gap-1 whitespace-nowrap px-2 py-1.5 rounded-xl border border-blue-200 text-[#2959ea] hover:bg-blue-50 text-xs font-semibold cursor-pointer min-h-[44px] transition-colors disabled:opacity-50"
                                  title={user.role === 'admin' ? 'Quản trị viên có phạm vi toàn hệ thống' : 'Phân công khóa học'}
                                >
                                  <BookOpen className="w-3.5 h-3.5" />
                                  <span>Gán khóa học</span>
                                </button>

                                {/* Toggle status button */}
                                {isSelf ? (
                                  <button
                                    type="button"
                                    disabled
                                    className="inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-400 text-xs font-semibold min-h-[44px] cursor-not-allowed opacity-60"
                                    title="Không thể tự khóa tài khoản đang sử dụng"
                                  >
                                    <Lock className="w-3.5 h-3.5" />
                                    <span className="sr-only">Tạm khóa</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => onToggleStatus(user)}
                                    disabled={isPending}
                                    className={`inline-flex items-center gap-1 whitespace-nowrap px-2.5 py-1.5 rounded-xl border text-xs font-semibold min-h-[44px] cursor-pointer transition-colors disabled:opacity-50 ${
                                      user.is_active
                                        ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                        : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                    }`}
                                    title={user.is_active ? 'Tạm khóa tài khoản này' : 'Kích hoạt lại tài khoản'}
                                  >
                                    {isPending ? (
                                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    ) : user.is_active ? (
                                      <Lock className="w-3.5 h-3.5" />
                                    ) : (
                                      <Unlock className="w-3.5 h-3.5" />
                                    )}
                                    <span className="sr-only">{user.is_active ? 'Tạm khóa' : 'Kích hoạt'}</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards (Visible < 768px, stacked rows) */}
                <div className="md:hidden divide-y divide-[#e1e7ef] -mx-4 px-4">
                  {filteredUsers.map(user => {
                    const isSelf = user.id === currentUser?.id;
                    const isPending = pendingUserId === user.id;

                    return (
                      <div key={user.id} className="py-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                              user.role === 'admin'
                                ? 'bg-purple-100 text-purple-700'
                                : user.role === 'teacher'
                                ? 'bg-blue-100 text-[#2959ea]'
                                : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {getRoleInitials(user.role)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-xs text-[#12213b]">{user.full_name}</span>
                                {isSelf && (
                                  <span className="bg-blue-50 text-[#2959ea] border border-blue-200 text-xs font-bold px-1 py-0.2 rounded">
                                    Bạn
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-xs text-[#5f708b]">@{user.username}</span>
                            </div>
                          </div>

                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full whitespace-nowrap text-xs font-bold shrink-0 ${
                            user.role === 'admin'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : user.role === 'teacher'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {adminRoleLabels[user.role] || user.role}
                          </span>
                        </div>

                        <div className="text-xs text-[#5f708b] bg-[#f6f8fc] rounded-lg p-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium text-[#12213b]">Khóa học:</span>
                            <span className="text-right truncate ml-2">
                              {user.role === 'admin' ? 'Toàn hệ thống' : user.course_ids && user.course_ids.length > 0 ? user.course_ids.map(getCourseTitle).join(', ') : 'Chưa gán'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-[#12213b]">Trạng thái:</span>
                            <span className={user.is_active ? 'text-emerald-700 font-semibold' : 'text-[#5f708b] font-semibold'}>
                              {user.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => onAssignCourses(user)}
                            disabled={isPending || user.role === 'admin'}
                            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-blue-200 text-[#2959ea] hover:bg-blue-50 text-xs font-semibold min-h-[44px] cursor-pointer"
                          >
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>Gán khóa học</span>
                          </button>

                          {isSelf ? (
                            <button
                              type="button"
                              disabled
                              title="Không thể tự khóa tài khoản đang sử dụng"
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-slate-400 text-xs font-semibold min-h-[44px] cursor-not-allowed opacity-60"
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Không thể tự khóa</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onToggleStatus(user)}
                              disabled={isPending}
                              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold min-h-[44px] cursor-pointer ${
                                user.is_active
                                  ? 'border-rose-200 text-rose-700 hover:bg-rose-50'
                                  : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                              }`}
                            >
                              {user.is_active ? (
                                <>
                                  <Lock className="w-3.5 h-3.5" />
                                  <span>Tạm khóa</span>
                                </>
                              ) : (
                                <>
                                  <Unlock className="w-3.5 h-3.5" />
                                  <span>Kích hoạt</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right 1/3 (Col 4): Role Matrix & Course Directory */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card: Ai được làm gì? */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-[#2959ea]" />
              <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
                Ai được làm gì?
              </h2>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Admin */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-700 border border-purple-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#12213b]">Quản trị viên</h3>
                  <p className="text-[#5f708b] text-xs mt-0.5 leading-relaxed">
                    Quản lý tài khoản người dùng, phân quyền truy cập và giám sát vận hành hệ thống.
                  </p>
                </div>
              </div>

              {/* Teacher */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#2959ea] border border-blue-200 flex items-center justify-center shrink-0 mt-0.5">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#12213b]">Giảng viên</h3>
                  <p className="text-[#5f708b] text-xs mt-0.5 leading-relaxed">
                    Tạo, chỉnh sửa, xem xét đề xuất tác nhân và xuất bản bài giảng học thuật.
                  </p>
                </div>
              </div>

              {/* Student */}
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 mt-0.5">
                  <GraduationCap className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-[#12213b]">Học viên</h3>
                  <p className="text-[#5f708b] text-xs mt-0.5 leading-relaxed">
                    Học bài giảng đã xuất bản trong khóa học được gán và xem kết quả học tập của chính mình.
                  </p>
                </div>
              </div>
            </div>

            {/* Crucial separation notice */}
            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-[#12213b] leading-relaxed">
              <strong>Nguyên tắc phân quyền:</strong> Duyệt và xuất bản nội dung bài giảng thuộc thẩm quyền của giảng viên. Quản trị viên chỉ phụ trách hạ tầng và không can thiệp nội dung học thuật.
            </div>
          </div>

          {/* Card: Khóa học đang được gán */}
          <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#2959ea]" />
                <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
                  Khóa học đang được gán
                </h2>
              </div>
              {courseFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setCourseFilter('all')}
                  className="text-xs text-[#2959ea] hover:underline cursor-pointer"
                >
                  Xem tất cả
                </button>
              )}
            </div>

            <p className="text-xs text-[#5f708b]">
              Nhấp vào khóa học để lọc danh sách tài khoản được phân công:
            </p>

            {summary && summary.courses.length > 0 ? (
              <div className="divide-y divide-[#e1e7ef] text-xs">
                {summary.courses.map(course => {
                  const isSelected = courseFilter === course.id;
                  const totalAssigned = course.teachers + course.students;

                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setCourseFilter(isSelected ? 'all' : course.id)}
                      className={`w-full text-left py-2.5 px-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                        isSelected ? 'bg-blue-50/80 font-bold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#12213b] truncate">{course.title}</span>
                          <span className="font-mono text-xs bg-slate-100 px-1 py-0.2 rounded text-[#5f708b]">
                            {course.code}
                          </span>
                        </div>
                        <span className="text-xs text-[#5f708b] block mt-0.5">
                          {course.teachers} giảng viên · {course.students} học viên
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#2959ea] shrink-0 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        {totalAssigned}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-[#5f708b] py-2 text-center">Chưa có khóa học nào.</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Full-Width Card: Hoạt động gần đây */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#2959ea]" />
            <h2 className="font-bold text-sm sm:text-base text-[#12213b]">
              Hoạt động gần đây
            </h2>
          </div>

          <button
            type="button"
            onClick={onNavigateToOperations}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#2959ea] hover:text-blue-800 cursor-pointer min-h-[44px]"
          >
            <span>Xem nhật ký hoạt động</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {auditError && <p role="alert" className="text-sm text-rose-700">Chưa thể cập nhật nhật ký hoạt động. {auditError}</p>}
        {auditLoading ? <p className="text-sm text-[#5f708b]">Đang tải nhật ký hoạt động...</p> : auditError && auditLogs.length === 0 ? null : auditLogs.length === 0 ? (
          <div className="text-center py-6 text-[#5f708b] text-xs">
            Chưa ghi nhận sự kiện hoạt động nào trong hệ thống.
          </div>
        ) : (
          <div className="divide-y divide-[#e1e7ef] text-xs">
            {auditLogs.slice(0, 5).map(entry => {
              const pres = adminAuditPresentation(entry, users || [], lectures, courses);
              return (
                <div key={entry.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#12213b]">{pres.title}</span>
                      <span className="text-xs bg-slate-100 text-[#12213b] px-1.5 py-0.5 rounded font-medium">
                        {pres.actor} {pres.username ? `(@${pres.username})` : ''}
                      </span>
                      <span className="text-xs text-[#5f708b]">[{pres.role}]</span>
                    </div>
                    <p className="text-[#5f708b] text-xs leading-relaxed truncate">
                      {pres.detail}
                    </p>
                  </div>
                  <div className="text-xs font-mono text-[#5f708b] shrink-0 self-start sm:self-auto">
                    {formatShortTime(entry.created_at)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
