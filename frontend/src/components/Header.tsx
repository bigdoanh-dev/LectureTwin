import React from 'react';
import {
  BookOpen,
  AlertCircle,
  X,
  RefreshCw,
  User as UserIcon,
  ChevronDown,
  PlayCircle,
  MessageSquare,
  FileText,
  type LucideIcon
} from 'lucide-react';
import { Role, Course, LectureSummary, ViewType } from '../types';

interface HeaderProps {
  currentRole: Role;
  onSwitchRole: (role: Role) => void;
  courses: Course[];
  selectedLecture?: LectureSummary | null;
  error?: string | null;
  onClearError?: () => void;
  loading?: boolean;
  currentView: ViewType;
  onSelectView: (view: ViewType) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentRole,
  onSwitchRole,
  courses,
  selectedLecture,
  error,
  onClearError,
  loading = false,
  currentView,
  onSelectView
}) => {
  const getRoleLabel = (r: Role) => {
    if (r === 'admin') return 'Quản trị viên';
    if (r === 'student') return 'Học viên';
    return 'Giảng viên';
  };

  const getRoleInitials = (r: Role) => {
    if (r === 'admin') return 'AD';
    if (r === 'student') return 'HV';
    return 'GV';
  };

  // Dynamic 3-link primary navigation per role
  const getNavItems = (): Array<{ id: ViewType; label: string; icon?: LucideIcon }> => {
    if (currentRole === 'teacher') {
      return [
        { id: 'lectures' as ViewType, label: 'Bài giảng' },
        { id: 'ai' as ViewType, label: 'AI hỗ trợ' },
        { id: 'assessment' as ViewType, label: 'Lớp học' },
      ];
    }
    if (currentRole === 'student') {
      return [
        { id: 'student', label: 'Bài học', icon: PlayCircle },
        { id: 'tutor', label: 'Hỏi trợ lý', icon: MessageSquare },
        { id: 'assessment', label: 'Bài kiểm tra', icon: FileText },
      ];
    }
    return [
      { id: 'admin' as ViewType, label: 'Tài khoản' },
      { id: 'agents' as ViewType, label: 'Vận hành' },
    ];
  };

  const navItems = getNavItems();

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#e1e7ef] shadow-2xs w-full">
      <div className="max-w-[1440px] mx-auto px-2.5 sm:px-4 md:px-8 h-[64px] sm:h-[72px] flex items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand Logo & Wordmark (Tuned for 320px: logo ~26px, wordmark 18px, compact gap) */}
        <div className="flex items-center gap-3 sm:gap-6 md:gap-10 shrink-0 min-w-0">
          <button
            type="button"
            onClick={() => onSelectView(currentRole === 'teacher' ? 'ai' : currentRole === 'student' ? 'student' : 'admin')}
            className="flex items-center gap-1.5 sm:gap-2.5 group text-left cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] rounded-xl p-0.5 sm:p-1 min-h-[44px]"
            aria-label="Về trang chính LectureTwin"
          >
            <BookOpen className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-[#2959ea] shrink-0" strokeWidth={2.2} />
            <span className="text-[17px] sm:text-[20px] md:text-[24px] font-bold tracking-tight text-[#12213b] truncate">
              LectureTwin
            </span>
          </button>

          {/* Primary Top Nav Links (Desktop md+) */}
          <nav aria-label="Điều hướng chính" className="hidden md:flex items-center space-x-2 h-[72px]">
            {navItems.map((item) => {
              const isActive = currentView === item.id ||
                (item.id === 'ai' && ['agents', 'graph', 'twin', 'simulation'].includes(currentView));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectView(item.id)}
                  className={`relative h-[72px] px-4 font-semibold text-[15px] transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
                    isActive
                      ? 'text-[#2959ea]'
                      : 'text-[#5f708b] hover:text-[#12213b]'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.icon && <item.icon aria-hidden="true" className="w-5 h-5 shrink-0" strokeWidth={1.8} />}
                  <span>{item.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 inset-x-2 h-[3px] bg-[#2959ea] rounded-t-full" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Center / Right: Loading indicator & Role Switcher */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {loading && (
            <div className="hidden sm:flex items-center space-x-1 text-xs text-[#5f708b] font-medium bg-[#f6f8fc] px-2 py-1 rounded-lg border border-[#e1e7ef]" role="status">
              <RefreshCw className="w-3.5 h-3.5 text-[#2959ea] animate-spin" />
              <span className="hidden lg:inline">Đang tải...</span>
            </div>
          )}

          {/* Role Picker matching concept: fully visible on 320px with >=44px touch target */}
          <div className={`relative flex items-center bg-white border border-[#e1e7ef] rounded-xl px-2 sm:px-3 min-h-[44px] transition-colors shadow-2xs hover:border-slate-300 ${
            loading ? 'opacity-60 cursor-not-allowed' : ''
          }`}>
            <UserIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5f708b] mr-1.5 shrink-0" />
            <select
              id="role-switcher"
              value={currentRole}
              onChange={(e) => onSwitchRole(e.target.value as Role)}
              disabled={loading}
              className="bg-transparent font-semibold text-[#12213b] min-h-[44px] py-2 focus:outline-hidden cursor-pointer text-xs sm:text-sm disabled:cursor-not-allowed pr-5 appearance-none"
              aria-label="Chọn vai trò người dùng"
            >
              <option value="teacher">Giảng viên</option>
              <option value="student">Học viên</option>
              <option value="admin">Quản trị viên</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#5f708b] absolute right-1.5 sm:right-2.5 pointer-events-none shrink-0" />
          </div>

          {/* Avatar: HIDDEN BELOW MD per review specification */}
          <div
            className="hidden md:flex w-9 h-9 rounded-full bg-[#12213b] text-white font-bold text-xs items-center justify-center select-none shadow-xs shrink-0"
            title={`${getRoleLabel(currentRole)} (demo)`}
          >
            {getRoleInitials(currentRole)}
          </div>
        </div>
      </div>

      {/* Mobile Navigation Row (< md) */}
      <div className="md:hidden border-t border-[#e1e7ef] px-2.5 sm:px-4 flex items-center space-x-1 overflow-x-auto h-[48px] bg-white scrollbar-none">
        {navItems.map((item) => {
          const isActive = currentView === item.id ||
            (item.id === 'ai' && ['agents', 'graph', 'twin', 'simulation'].includes(currentView));
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`relative h-full px-3 font-semibold text-xs transition-colors shrink-0 flex items-center min-h-[44px] ${
                isActive
                  ? 'text-[#2959ea]'
                  : 'text-[#5f708b] hover:text-[#12213b]'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute bottom-0 inset-x-1.5 h-[2.5px] bg-[#2959ea] rounded-t-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          role="status"
          aria-live="polite"
          className="bg-red-50 border-t border-red-200 px-3 sm:px-8 py-2.5 flex items-start justify-between text-xs text-red-900 animate-in fade-in duration-150 gap-2 w-full"
        >
          <div className="flex items-start space-x-2 min-w-0 flex-1 py-0.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="font-medium leading-relaxed break-words whitespace-normal text-red-950 flex-1">
              {error}
            </p>
          </div>
          {onClearError && (
            <button
              type="button"
              onClick={onClearError}
              className="text-red-700 hover:text-red-950 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-red-100/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-red-500 shrink-0 transition-colors"
              aria-label="Đóng thông báo lỗi"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </header>
  );
};
