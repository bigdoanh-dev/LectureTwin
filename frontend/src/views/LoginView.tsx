import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  User,
  Lock,
  Eye,
  EyeOff,
  GraduationCap,
  Settings,
  AlertCircle,
  Info,
  RefreshCw,
  Presentation
} from 'lucide-react';
import { Role } from '../types';
import { useApp } from '../context/AppContext';

export const LoginView: React.FC = () => {
  const { login, loginDemo, preferredRole, error, clearError, loading } = useApp();

  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // If redirected with a preferred role, prefill username and inform user
  useEffect(() => {
    if (preferredRole) {
      setUsername(preferredRole);
      setPassword('demo123');
    }
  }, [preferredRole]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setLocalError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
      return;
    }
    setLocalError(null);
    clearError();
    setIsSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Đăng nhập không thành công. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDemoLogin = async (targetRole: Role) => {
    setLocalError(null);
    clearError();
    setIsSubmitting(true);
    try {
      await loginDemo(targetRole);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Không thể đăng nhập tài khoản thử nghiệm.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = localError || error;

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-[#12213b] flex flex-col font-sans antialiased relative overflow-hidden">
      {/* Subtle background decorative shapes matching concept atmosphere */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-100/60 blur-3xl" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 rounded-full bg-indigo-100/50 blur-3xl" />
        <div className="absolute -bottom-32 left-1/4 w-[500px] h-[500px] rounded-full bg-slate-100 blur-3xl" />
      </div>

      {/* Top Simple Brand Bar */}
      <header className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-[#e1e7ef] shadow-2xs flex items-center justify-center text-[#2959ea]">
            <BookOpen className="w-5 h-5" strokeWidth={2.2} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold tracking-tight text-[#12213b]">
              LectureTwin
            </span>
            <span className="text-slate-300 font-light hidden sm:inline">|</span>
            <span className="text-xs sm:text-sm text-[#5f708b] font-medium hidden sm:inline">
              Không gian học tập & giảng dạy
            </span>
          </div>
        </div>
      </header>

      {/* Main Login Center Area */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 py-6 sm:py-10">
        <div className="w-full max-w-[1040px] mx-auto flex items-center justify-center lg:justify-between gap-8 lg:gap-14">
          {/* Subtle Decorative Left Illustration (Desktop only lg+, restrained opacity, blends with concept) */}
          <div className="hidden lg:flex flex-1 flex-col items-center justify-center max-w-[460px] select-none pointer-events-none">
            <img
              src="/assets/login-illustration.png"
              alt="Minh họa học tập trực quan LectureTwin"
              className="w-full max-h-[420px] object-contain drop-shadow-sm opacity-95"
            />
            <div className="text-center mt-3 space-y-1">
              <h2 className="text-base font-bold text-[#12213b]">
                Không gian học tập & giảng dạy trực quan
              </h2>
              <p className="text-xs text-[#5f708b] max-w-sm">
                Kết hợp bài giảng tham khảo, học liệu thực hành và trợ lý AI hỗ trợ người dạy lẫn người học.
              </p>
            </div>
          </div>

          {/* Centered Login Card */}
          <div className="w-full max-w-[460px] bg-white rounded-3xl border border-[#e1e7ef] shadow-xl p-6 sm:p-9 space-y-6 shrink-0">
          {/* Card Header */}
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#12213b]">
              Đăng nhập
            </h1>
            <p className="text-sm text-[#5f708b]">
              Truy cập không gian giảng dạy và học tập của bạn.
            </p>
          </div>

          {/* Role switch guidance banner if user was sent via switchRole */}
          {preferredRole && (
            <div className="bg-blue-50 border border-blue-200 text-[#12213b] text-xs p-3 rounded-xl flex items-start gap-2 animate-in fade-in">
              <Info className="w-4 h-4 text-[#2959ea] shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                {preferredRole === 'student' && (
                  <span>Bạn đang chuyển sang tài khoản <strong>Học viên</strong>. Nhấn nút Học viên bên dưới hoặc đăng nhập tài khoản học tập.</span>
                )}
                {preferredRole === 'teacher' && (
                  <span>Vui lòng chọn hoặc đăng nhập tài khoản <strong>Giảng viên</strong> để quản trị bài học.</span>
                )}
                {preferredRole === 'admin' && (
                  <span>Vui lòng đăng nhập tài khoản <strong>Quản trị viên</strong> để theo dõi hệ thống.</span>
                )}
              </div>
            </div>
          )}

          {/* Actionable Error Display */}
          {displayedError && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 text-red-900 text-xs p-3.5 rounded-xl flex items-start justify-between gap-2"
            >
              <div className="flex items-start gap-2 min-w-0">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{displayedError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocalError(null);
                  clearError();
                }}
                className="text-red-700 hover:text-red-950 font-bold px-1"
                aria-label="Đóng thông báo lỗi"
              >
                ✕
              </button>
            </div>
          )}

          {/* Standard Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="username-input"
                className="block text-xs sm:text-sm font-semibold text-[#12213b]"
              >
                Tên đăng nhập
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#5f708b]">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="username-input"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập"
                  disabled={isSubmitting || loading}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-3.5 bg-white border border-[#e1e7ef] focus:border-[#2959ea] focus:ring-2 focus:ring-[#2959ea]/20 rounded-xl text-sm text-[#12213b] placeholder:text-slate-400 outline-hidden transition-all disabled:bg-slate-50 disabled:opacity-60"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label
                htmlFor="password-input"
                className="block text-xs sm:text-sm font-semibold text-[#12213b]"
              >
                Mật khẩu
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#5f708b]">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu"
                  disabled={isSubmitting || loading}
                  className="w-full min-h-[44px] py-2.5 pl-10 pr-11 bg-white border border-[#e1e7ef] focus:border-[#2959ea] focus:ring-2 focus:ring-[#2959ea]/20 rounded-xl text-sm text-[#12213b] placeholder:text-slate-400 outline-hidden transition-all disabled:bg-slate-50 disabled:opacity-60"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={0}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#5f708b] hover:text-[#12213b] min-w-[44px] justify-center cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] rounded-r-xl"
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || loading}
              className="w-full min-h-[46px] mt-2 bg-[#2959ea] hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm sm:text-base rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] focus-visible:ring-offset-2"
            >
              {isSubmitting || loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Đang xác thực...</span>
                </>
              ) : (
                <span>Đăng nhập</span>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-[#e1e7ef] w-full" />
            <span className="bg-white px-3 text-xs text-[#5f708b] font-medium absolute">
              Hoặc truy cập nhanh
            </span>
          </div>

          {/* Quick Demo Accounts Grid */}
          <div className="grid grid-cols-3 gap-2.5">
            {/* Teacher Card */}
            <button
              type="button"
              onClick={() => handleDemoLogin('teacher')}
              disabled={isSubmitting || loading}
              className={`min-h-[82px] p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
                preferredRole === 'teacher'
                  ? 'border-[#2959ea] bg-blue-50/70 text-[#2959ea] shadow-xs'
                  : 'border-[#e1e7ef] bg-white hover:border-[#2959ea]/50 hover:bg-slate-50 text-[#12213b]'
              }`}
            >
              <Presentation className="w-5 h-5 text-[#2959ea]" />
              <div className="text-xs font-semibold leading-tight">
                Giảng viên
              </div>
              <div className="text-[10px] text-[#5f708b] font-mono">
                teacher
              </div>
            </button>

            {/* Student Card */}
            <button
              type="button"
              onClick={() => handleDemoLogin('student')}
              disabled={isSubmitting || loading}
              className={`min-h-[82px] p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
                preferredRole === 'student'
                  ? 'border-[#2959ea] bg-blue-50/70 text-[#2959ea] shadow-xs ring-2 ring-[#2959ea]/30'
                  : 'border-[#e1e7ef] bg-white hover:border-[#2959ea]/50 hover:bg-slate-50 text-[#12213b]'
              }`}
            >
              <GraduationCap className="w-5 h-5 text-[#2959ea]" />
              <div className="text-xs font-semibold leading-tight">
                Học viên
              </div>
              <div className="text-[10px] text-[#5f708b] font-mono">
                student
              </div>
            </button>

            {/* Admin Card */}
            <button
              type="button"
              onClick={() => handleDemoLogin('admin')}
              disabled={isSubmitting || loading}
              className={`min-h-[82px] p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-center transition-all cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea] ${
                preferredRole === 'admin'
                  ? 'border-[#2959ea] bg-blue-50/70 text-[#2959ea] shadow-xs'
                  : 'border-[#e1e7ef] bg-white hover:border-[#2959ea]/50 hover:bg-slate-50 text-[#12213b]'
              }`}
            >
              <Settings className="w-5 h-5 text-[#2959ea]" />
              <div className="text-xs font-semibold leading-tight">
                Quản trị viên
              </div>
              <div className="text-[10px] text-[#5f708b] font-mono">
                admin
              </div>
            </button>
          </div>

          {/* Info footnote */}
          <div className="bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl p-3 flex items-center gap-2.5 text-xs text-[#5f708b]">
            <Info className="w-4 h-4 text-[#2959ea] shrink-0" />
            <span>Tài khoản thử nghiệm chỉ dành cho bản demo (mật khẩu mặc định: demo123).</span>
          </div>
        </div>
      </div>
      </main>
    </div>
  );
};
