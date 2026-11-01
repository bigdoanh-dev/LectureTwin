import React, { useState, useEffect } from 'react';
import { UserPlus, RefreshCw, Shield, GraduationCap, Users, Info, AlertCircle } from 'lucide-react';
import { ModalDialog } from './ModalDialog';
import type { Course, Role } from '../types';

interface AdminCreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  courses: Course[];
  onCreate: (data: {
    username: string;
    full_name: string;
    role: Role;
    password?: string;
    course_ids: string[];
  }) => Promise<void>;
}

export const AdminCreateUserModal: React.FC<AdminCreateUserModalProps> = ({
  isOpen,
  onClose,
  courses,
  onCreate
}) => {
  const [username, setUsername] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [role, setRole] = useState<Role>('teacher');
  const [password, setPassword] = useState<string>('');
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([]);
  const [isPending, setIsPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form whenever modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setUsername('');
      setFullName('');
      setRole('teacher');
      setPassword('');
      setSelectedCourseIds([]);
      setError(null);
      setIsPending(false);
    } else {
      setPassword('');
    }
  }, [isOpen]);

  const toggleCourse = (courseId: string) => {
    if (isPending) return;
    setSelectedCourseIds(prev =>
      prev.includes(courseId) ? prev.filter(id => id !== courseId) : [...prev, courseId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    const trimmedUser = username.trim();
    const trimmedName = fullName.trim();
    const chosenPassword = password;

    if (!trimmedUser || !trimmedName || !chosenPassword.trim()) {
      setError('Vui lòng điền đầy đủ tất cả các trường bắt buộc.');
      return;
    }

    if (trimmedUser.length < 3 || trimmedUser.length > 40) {
      setError('Tên đăng nhập phải từ 3 đến 40 ký tự.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmedUser)) {
      setError('Tên đăng nhập chỉ được chứa chữ cái, chữ số, dấu gạch dưới (_) hoặc gạch nối (-).');
      return;
    }

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      setError('Họ và tên phải từ 2 đến 100 ký tự.');
      return;
    }

    if (chosenPassword.length < 6 || chosenPassword.length > 120) {
      setError('Mật khẩu phải từ 6 đến 120 ký tự.');
      return;
    }

    setIsPending(true);
    setError(null);

    try {
      await onCreate({
        username: trimmedUser,
        full_name: trimmedName,
        role,
        password: chosenPassword,
        course_ids: role === 'admin' ? [] : selectedCourseIds
      });
      // Clear password immediately on success
      setPassword('');
      onClose();
    } catch (err: any) {
      if (err.status === 409 || err.message?.includes('409') || err.detail?.includes('tồn tại') || err.detail?.includes('already exists')) {
        setError(`Tên đăng nhập "${trimmedUser}" đã tồn tại trên hệ thống. Vui lòng chọn tên đăng nhập khác.`);
      } else {
        setError(err.detail || err.message || 'Lỗi khi tạo tài khoản người dùng.');
      }
    } finally {
      setIsPending(false);
    }
  };

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={() => { if (!isPending) onClose(); }}
      title="Thêm tài khoản người dùng"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="text-base font-bold text-[#12213b]">Thêm tài khoản mới</h3>
          <p className="text-xs text-[#5f708b] mt-0.5">
            Cấp quyền và phân công khóa học theo đúng chức năng nhiệm vụ.
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Username */}
        <div>
          <label htmlFor="create-username" className="block text-xs font-bold text-[#12213b] mb-1">
            Tên đăng nhập <span className="text-rose-500">*</span>
          </label>
          <input
            id="create-username"
            type="text"
            required
            autoComplete="off"
            disabled={isPending}
            placeholder="vd: nguyen_van_a"
            value={username}
            onChange={e => setUsername(e.target.value)}
            className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2.5 text-sm text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors"
          />
          <p className="text-xs text-[#5f708b] mt-1">
            3–40 ký tự, gồm chữ cái, chữ số, gạch dưới (_) hoặc gạch nối (-).
          </p>
        </div>

        {/* Full Name */}
        <div>
          <label htmlFor="create-fullname" className="block text-xs font-bold text-[#12213b] mb-1">
            Họ và tên hiển thị <span className="text-rose-500">*</span>
          </label>
          <input
            id="create-fullname"
            type="text"
            required
            autoComplete="off"
            disabled={isPending}
            placeholder="vd: Nguyễn Văn A"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2.5 text-sm text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors"
          />
          <p className="text-xs text-[#5f708b] mt-1">2–100 ký tự.</p>
        </div>

        {/* Password */}
        <div>
          <label htmlFor="create-password" className="block text-xs font-bold text-[#12213b] mb-1">
            Mật khẩu khởi tạo <span className="text-rose-500">*</span>
          </label>
          <input
            id="create-password"
            type="password"
            required
            autoComplete="new-password"
            disabled={isPending}
            placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2.5 text-sm text-[#12213b] focus:ring-2 focus:ring-[#2959ea] focus:bg-white outline-hidden transition-colors font-mono"
          />
          <p className="text-xs text-[#5f708b] mt-1">
            6–120 ký tự. Mật khẩu được mã hóa an toàn và không lưu dạng văn bản rõ.
          </p>
        </div>

        {/* Role selection */}
        <div>
          <label className="block text-xs font-bold text-[#12213b] mb-1.5">
            Vai trò người dùng <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => setRole('teacher')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-colors min-h-[44px] flex flex-col justify-between ${
                role === 'teacher'
                  ? 'bg-blue-50/60 border-[#2959ea] text-[#2959ea] ring-1 ring-[#2959ea]'
                  : 'bg-white border-[#e1e7ef] text-[#5f708b] hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#12213b]">
                <Users className="w-4 h-4 text-[#2959ea]" />
                <span>Giảng viên</span>
              </div>
              <span className="text-xs text-[#5f708b] mt-1">Soạn & xuất bản</span>
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => setRole('student')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-colors min-h-[44px] flex flex-col justify-between ${
                role === 'student'
                  ? 'bg-emerald-50/60 border-emerald-600 text-emerald-700 ring-1 ring-emerald-600'
                  : 'bg-white border-[#e1e7ef] text-[#5f708b] hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#12213b]">
                <GraduationCap className="w-4 h-4 text-emerald-600" />
                <span>Học viên</span>
              </div>
              <span className="text-xs text-[#5f708b] mt-1">Học & luyện tập</span>
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => setRole('admin')}
              className={`p-3 rounded-xl border text-left cursor-pointer transition-colors min-h-[44px] flex flex-col justify-between ${
                role === 'admin'
                  ? 'bg-purple-50/60 border-purple-600 text-purple-700 ring-1 ring-purple-600'
                  : 'bg-white border-[#e1e7ef] text-[#5f708b] hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#12213b]">
                <Shield className="w-4 h-4 text-purple-600" />
                <span>Quản trị viên</span>
              </div>
              <span className="text-xs text-[#5f708b] mt-1">Vận hành kỹ thuật</span>
            </button>
          </div>

          {/* Role permissions card */}
          <div className="mt-2.5 p-3 rounded-xl bg-[#f6f8fc] border border-[#e1e7ef] text-xs text-[#5f708b] leading-relaxed">
            {role === 'admin' && (
              <p>
                <strong className="text-[#12213b]">Phạm vi Quản trị viên:</strong> Quản lý danh sách người dùng, cấp quyền truy cập và giám sát vận hành tác nhân. Quản trị viên không can thiệp nội dung học thuật và không cần gán khóa học cụ thể.
              </p>
            )}
            {role === 'teacher' && (
              <p>
                <strong className="text-[#12213b]">Phạm vi Giảng viên:</strong> Soạn thảo tài liệu, phân tích bài giảng với tác nhân AI, xem xét đề xuất bằng chứng và xuất bản bài giảng cho học viên.
              </p>
            )}
            {role === 'student' && (
              <p>
                <strong className="text-[#12213b]">Phạm vi Học viên:</strong> Tham gia học các bài giảng đã xuất bản, tự luyện tập câu hỏi trắc nghiệm, hỏi đáp với gia sư AI và xem kết quả học tập cá nhân.
              </p>
            )}
          </div>
        </div>

        {/* Course assignment checkboxes (only if role is teacher or student) */}
        {role !== 'admin' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-[#12213b]">
                Gán khóa học ban đầu ({selectedCourseIds.length} / {courses.length}):
              </label>
              {selectedCourseIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCourseIds([])}
                  className="text-xs text-[#2959ea] hover:underline cursor-pointer"
                >
                  Bỏ chọn tất cả
                </button>
              )}
            </div>

            {courses.length === 0 ? (
              <p className="text-xs text-[#5f708b] py-2 text-center">Chưa có khóa học nào trong hệ thống.</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {courses.map(course => {
                  const isChecked = selectedCourseIds.includes(course.id);
                  return (
                    <label
                      key={course.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
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
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-[#12213b] truncate">{course.title}</span>
                          <span className="font-mono text-xs bg-slate-100 px-1 py-0.2 rounded text-[#5f708b] shrink-0">
                            {course.code}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}

            {selectedCourseIds.length === 0 && (
              <div className="flex items-start gap-2 p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs text-amber-900 leading-normal">
                <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Tài khoản chưa được gán khóa học sẽ cần được phân công sau trước khi thấy nội dung bài giảng.
                </span>
              </div>
            )}
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
                <span>Đang tạo tài khoản...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Tạo tài khoản</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
};
