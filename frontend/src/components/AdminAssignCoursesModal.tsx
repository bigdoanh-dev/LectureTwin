import React, { useState, useEffect } from 'react';
import { BookOpen, RefreshCw, Info } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import { adminRoleLabels } from '../admin-model';
import type { Course, User } from '../types';

interface AdminAssignCoursesModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  courses: Course[];
  onSave: (userId: string, courseIds: string[]) => Promise<void>;
}

export const AdminAssignCoursesModal: React.FC<AdminAssignCoursesModalProps> = ({
  isOpen,
  onClose,
  user,
  courses,
  onSave
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(user?.course_ids || []);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setSelectedIds(user.course_ids || []);
      setError(null);
      setIsPending(false);
    }
  }, [user, isOpen]);

  if (!user) return null;

  const toggleCourse = (courseId: string) => {
    if (isPending) return;
    setSelectedIds(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    setIsPending(true);
    setError(null);
    try {
      await onSave(user.id, selectedIds);
      onClose();
    } catch (err: any) {
      setError(err.detail || err.message || 'Không thể cập nhật phân công khóa học.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={() => { if (!isPending) onClose(); }}
      title={`Phân công khóa học: ${user.full_name}`}
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* User Card */}
        <div className="flex items-center justify-between p-3.5 bg-[#f6f8fc] rounded-xl border border-[#e1e7ef]">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#12213b]">{user.full_name}</span>
              <span className="font-mono text-xs text-[#5f708b]">@{user.username}</span>
            </div>
            <p className="text-xs text-[#5f708b] mt-0.5">
              Vai trò hiện tại:{' '}
              <span className="font-semibold text-[#12213b]">
                {adminRoleLabels[user.role] || user.role}
              </span>{' '}
              <span className="text-xs text-[#5f708b]">(không thể thay đổi qua phân công)</span>
            </p>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            user.role === 'admin'
              ? 'bg-purple-50 text-purple-700 border border-purple-200'
              : user.role === 'teacher'
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}>
            {adminRoleLabels[user.role] || user.role}
          </span>
        </div>

        {/* Explain role access rule */}
        <div className="flex items-start gap-2.5 p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs text-[#12213b] leading-relaxed">
          <Info className="w-4 h-4 text-[#2959ea] shrink-0 mt-0.5" />
          <span>
            Quyền truy cập khóa học tuân theo vai trò của tài khoản, không làm thay đổi quyền sở hữu bài giảng hay thẩm quyền phê duyệt học thuật của giảng viên.
          </span>
        </div>

        {/* Course list checkboxes */}
        <div className="space-y-2">
          <label className="block text-xs font-bold text-[#12213b]">
            Chọn các khóa học được phân công ({selectedIds.length} / {courses.length}):
          </label>

          {courses.length === 0 ? (
            <p className="text-xs text-[#5f708b] py-3 text-center">Hệ thống chưa có khóa học nào.</p>
          ) : (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {courses.map(course => {
                const isChecked = selectedIds.includes(course.id);
                return (
                  <label
                    key={course.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                      isChecked
                        ? 'bg-blue-50/40 border-[#2959ea]/40 text-[#12213b]'
                        : 'bg-white border-[#e1e7ef] text-[#5f708b] hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isPending}
                      onChange={() => toggleCourse(course.id)}
                      className="mt-0.5 h-4 w-4 rounded border-[#e1e7ef] text-[#2959ea] focus:ring-[#2959ea]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#12213b]">{course.title}</span>
                        <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded text-[#5f708b]">
                          {course.code}
                        </span>
                      </div>
                      <p className="text-xs text-[#5f708b] mt-0.5">
                        Mã khóa học: {course.id}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
          <p className="text-xs text-[#5f708b]">
            * Cho phép để trống (0 khóa học) nếu chưa muốn tài khoản tiếp cận nội dung học phần nào.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 leading-normal">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#e1e7ef]">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold text-[#5f708b] hover:text-[#12213b] hover:bg-slate-100 rounded-xl min-h-[44px] transition-colors cursor-pointer disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 rounded-xl min-h-[44px] shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            {isPending ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <BookOpen className="w-3.5 h-3.5" />
                <span>Lưu phân công</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
