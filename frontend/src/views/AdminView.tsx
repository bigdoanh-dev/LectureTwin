import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CheckCircle2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import type { User, AdminMonitoringData, Role } from '../types';
import { AdminAccountsSection } from '../components/AdminAccountsSection';
import { AdminOperationsSection } from '../components/AdminOperationsSection';
import { AdminCreateUserModal } from '../components/AdminCreateUserModal';
import { AdminAssignCoursesModal } from '../components/AdminAssignCoursesModal';
import { AdminConfirmModal } from '../components/AdminConfirmModal';

interface AdminViewProps {
  section?: 'accounts' | 'operations';
}

export const AdminView: React.FC<AdminViewProps> = ({ section = 'accounts' }) => {
  const { bootstrap, user: currentUser, setCurrentView } = useApp();
  const shouldReduceMotion = useReducedMotion();

  // Data states (nullable initially to distinguish loading from empty)
  const [users, setUsers] = useState<User[] | null>(null);
  const [monitoring, setMonitoring] = useState<AdminMonitoringData | null>(null);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [loadingMonitoring, setLoadingMonitoring] = useState<boolean>(true);
  const [userError, setUserError] = useState<string | null>(null);
  const [monitoringError, setMonitoringError] = useState<string | null>(null);
  const [usersFetched, setUsersFetched] = useState<Date | null>(null);
  const [monitoringFetched, setMonitoringFetched] = useState<Date | null>(null);
  const usersVersion = useRef(0);
  const monitoringVersion = useRef(0);
  const monitoringPending = useRef(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  // Notification feedback
  const [notification, setNotification] = useState<string | null>(null);

  // Modal dialog states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [assignUser, setAssignUser] = useState<User | null>(null);
  const [confirmUser, setConfirmUser] = useState<User | null>(null);
  const [confirmPending, setConfirmPending] = useState<boolean>(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);

  const courses = bootstrap?.courses || [];
  const lectures = bootstrap?.lectures || [];

  // Track component mount status to avoid state updates after unmount
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      usersVersion.current++;
      monitoringVersion.current++;
    };
  }, []);

  const refreshMonitoring = useCallback(async () => {
    const version = ++monitoringVersion.current;
    monitoringPending.current = true;
    setLoadingMonitoring(true);
    try {
      const data = await api.getAdminMonitoring();
      if (!isMountedRef.current || version !== monitoringVersion.current) return;
      setMonitoring(data);
      setMonitoringError(null);
      setMonitoringFetched(new Date());
    } catch (err: any) {
      if (isMountedRef.current && version === monitoringVersion.current) {
        setMonitoringError(err?.detail || err?.message || 'Không thể tải dữ liệu vận hành.');
      }
    } finally {
      if (version === monitoringVersion.current) {
        monitoringPending.current = false;
        if (isMountedRef.current) setLoadingMonitoring(false);
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    const version = ++usersVersion.current;
    setLoadingUsers(true);
    await Promise.allSettled([
      (async () => {
        try {
          const data = await api.getAdminUsers();
          if (!isMountedRef.current || version !== usersVersion.current) return;
          setUsers(data);
          setUserError(null);
          setUsersFetched(new Date());
        } catch (err: any) {
          if (isMountedRef.current && version === usersVersion.current) {
            setUserError(err?.detail || err?.message || 'Không thể tải danh sách tài khoản.');
          }
        } finally {
          if (isMountedRef.current && version === usersVersion.current) setLoadingUsers(false);
        }
      })(),
      refreshMonitoring()
    ]);
  }, [refreshMonitoring]);

  useEffect(() => { void loadData(); }, [loadData, currentUser?.id]);

  useEffect(() => {
    if (!monitoring?.jobs.some(j => j.status === 'queued' || j.status === 'running')) return;
    if (loadingMonitoring) return;
    const timer = setTimeout(() => {
      if (!monitoringPending.current) void refreshMonitoring();
    }, 4000);
    return () => clearTimeout(timer);
  }, [monitoring, loadingMonitoring, refreshMonitoring]);

  // Handle Create User
  const handleCreateUser = async (data: {
    username: string;
    full_name: string;
    role: Role;
    password?: string;
    course_ids: string[];
  }) => {
    const created = await api.createAdminUser(data);
    if (!isMountedRef.current) return;
    usersVersion.current++;
    setLoadingUsers(false);
    setUsers(prev => (prev ? [created, ...prev] : [created]));
    setNotification(`Đã tạo tài khoản "${created.full_name}" (@${created.username}) thành công.`);
    void refreshMonitoring();
  };

  // Handle Assign Courses
  const handleSaveCourseAssignment = async (userId: string, courseIds: string[]) => {
    setPendingUserId(userId);
    try {
      const updated = await api.patchAdminUser(userId, { course_ids: courseIds });
      if (!isMountedRef.current) return;
      usersVersion.current++;
      setLoadingUsers(false);
      setUsers(prev => (prev ? prev.map(u => (u.id === userId ? updated : u)) : [updated]));
      setNotification(`Đã cập nhật phân công khóa học cho @${updated.username}.`);
      void refreshMonitoring();
    } finally {
      if (isMountedRef.current) setPendingUserId(null);
    }
  };

  // Handle Status Toggle (Lock / Activate)
  const handleConfirmToggleStatus = async () => {
    if (!confirmUser) return;
    setConfirmPending(true);
    setConfirmError(null);
    setPendingUserId(confirmUser.id);

    try {
      const targetStatus = !confirmUser.is_active;
      const updated = await api.patchAdminUser(confirmUser.id, { is_active: targetStatus });
      if (!isMountedRef.current) return;
      usersVersion.current++;
      setLoadingUsers(false);
      setUsers(prev => (prev ? prev.map(u => (u.id === confirmUser.id ? updated : u)) : [updated]));
      setNotification(
        `Đã ${updated.is_active ? 'kích hoạt' : 'tạm khóa'} tài khoản @${updated.username}.`
      );
      setConfirmUser(null);
      void refreshMonitoring();
    } catch (err: any) {
      if (isMountedRef.current) {
        setConfirmError(err?.detail || err?.message || 'Lỗi khi cập nhật trạng thái tài khoản.');
      }
    } finally {
      if (isMountedRef.current) {
        setConfirmPending(false);
        setPendingUserId(null);
      }
    }
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      {/* Toast Notification */}
      {notification && (
        <div role="status" className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-[#12213b] flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#2959ea] shrink-0" />
            <span className="font-semibold">{notification}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-[#2959ea] hover:text-blue-800 p-1 cursor-pointer font-bold"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Section Content based on route prop */}
      {section === 'operations' ? (
        <AdminOperationsSection
          monitoring={monitoring}
          lectures={lectures}
          courses={courses}
          users={users || []}
          loading={loadingMonitoring}
          error={monitoringError}
          onRefresh={loadData}
          lastFetched={monitoringFetched}
        />
      ) : (
        <AdminAccountsSection
          users={users}
          courses={courses}
          currentUser={currentUser}
          loading={loadingUsers}
          error={userError}
          onRefresh={loadData}
          onOpenCreate={() => setShowCreateModal(true)}
          onToggleStatus={u => {
            setConfirmError(null);
            setConfirmUser(u);
          }}
          onAssignCourses={u => setAssignUser(u)}
          auditLogs={monitoring?.audit || []}
          auditError={monitoringError}
          auditLoading={loadingMonitoring && !monitoring}
          lectures={lectures}
          onNavigateToOperations={() => setCurrentView('agents')}
          lastFetched={usersFetched}
          pendingUserId={pendingUserId}
        />
      )}

      {/* Create User Modal */}
      <AdminCreateUserModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        courses={courses}
        onCreate={handleCreateUser}
      />

      {/* Assign Courses Modal */}
      {assignUser && <AdminAssignCoursesModal
        isOpen={Boolean(assignUser)}
        onClose={() => setAssignUser(null)}
        user={assignUser}
        courses={courses}
        onSave={handleSaveCourseAssignment}
      />}

      {/* Confirm Lock / Unlock Modal */}
      <AdminConfirmModal
        isOpen={Boolean(confirmUser)}
        onClose={() => {
          if (!confirmPending) setConfirmUser(null);
        }}
        user={confirmUser}
        onConfirm={handleConfirmToggleStatus}
        isPending={confirmPending}
        error={confirmError}
      />
    </motion.div>
  );
};
export default AdminView;
