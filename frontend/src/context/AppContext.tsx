import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, Role, BootstrapData, Workspace, Job, ViewType } from '../types';
import { api } from '../api';

interface AppContextValue {
  user: User | null;
  role: Role;
  bootstrap: BootstrapData | null;
  currentLectureId: string;
  workspace: Workspace | null;
  activeJob: Job | null;
  loading: boolean;
  error: string | null;
  preferredRole: Role | null;
  currentView: ViewType;
  videoSeekTarget: number | null;
  setCurrentView: (view: ViewType) => void;
  selectLecture: (id: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  loginDemo: (role: Role) => Promise<void>;
  logout: () => Promise<void>;
  switchRole: (role: Role) => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  seekVideoTo: (seconds: number) => void;
  clearVideoSeek: () => void;
  setActiveJob: (job: Job | null) => void;
  clearError: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);
// Share only an in-flight restore between StrictMode mounts.
let restoring: Promise<User | null> | null = null;
function restoreSession(): Promise<User | null> {
  if (!restoring) {
    restoring = api.getMe().catch((error) => {
      if (error.status !== 401) throw error;
      api.setToken(null);
      return null;
    }).finally(() => { restoring = null; });
  }
  return restoring;
}
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Không thể tải dữ liệu. Vui lòng thử lại.';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>('teacher');
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [currentLectureId, setCurrentLectureId] = useState('');
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activeJob, updateActiveJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preferredRole, setPreferredRole] = useState<Role | null>(null);
  const [currentView, updateCurrentView] = useState<ViewType>('ai');
  const [videoSeekTarget, setVideoSeekTarget] = useState<number | null>(null);
  const generation = useRef(0);
  const mounted = useRef(false);
  const lectureRef = useRef('');
  const preferredLectureRef = useRef('');
  const jobRef = useRef<Job | null>(null);
  const roleRef = useRef<Role>('teacher');
  const userIdRef = useRef('');
  const isCurrent = useCallback((value: number) => mounted.current && generation.current === value, []);
  const setActiveJob = useCallback((job: Job | null) => {
    if (job && job.lecture_id !== lectureRef.current) return;
    jobRef.current = job;
    updateActiveJob(job);
  }, []);
  const beginLoad = useCallback(() => {
    const value = ++generation.current;
    setLoading(true); setError(null); setWorkspace(null); setActiveJob(null); setVideoSeekTarget(null);
    return value;
  }, [setActiveJob]);
  const applyWorkspace = useCallback((ws: Workspace) => {
    setWorkspace(ws);
    setBootstrap(previous => previous ? {
      ...previous,
      lectures: previous.lectures.map(lecture => lecture.id === ws.lecture.id ? ws.lecture : lecture),
    } : previous);
    const selected = ws.jobs.find(job => job.id === jobRef.current?.id);
    setActiveJob(selected || ws.jobs[0] || null);
  }, [setActiveJob]);

  const loadSession = useCallback(async (session: User, value: number, preferredLectureId?: string) => {
    if (!isCurrent(value)) return;
    setUser(session); setRole(session.role); roleRef.current = session.role; userIdRef.current = session.id;
    updateCurrentView(session.role === 'student' ? 'student' : session.role === 'admin' ? 'admin' : 'ai');
    const bs = await api.getBootstrap();
    if (!isCurrent(value)) return;
    setBootstrap(bs);
    let remembered = '';
    try { remembered = localStorage.getItem(`lecture_twin_lecture_${session.id}`) || ''; } catch { /* Selection still works without browser storage. */ }
    const preferred = bs.lectures.find(l => l.id === (preferredLectureId || remembered)) || (session.role === 'teacher' ? bs.lectures.find(l => l.id === 'lec-bfs-dfs') : undefined);
    const id = (preferred || bs.lectures[0])?.id || '';
    lectureRef.current = id; setCurrentLectureId(id);
    if (id) {
      const ws = await api.getWorkspace(id);
      if (isCurrent(value)) {
        applyWorkspace(ws);
        try { localStorage.setItem(`lecture_twin_lecture_${userIdRef.current}`, id); } catch { /* Optional convenience. */ }
      }
    }
  }, [applyWorkspace, isCurrent]);

  useEffect(() => {
    mounted.current = true;
    const value = beginLoad();
    restoreSession().then(session => session ? loadSession(session, value) : undefined).catch(err => {
      if (isCurrent(value)) setError(errorText(err));
    }).finally(() => { if (isCurrent(value)) setLoading(false); });
    return () => { mounted.current = false; generation.current++; };
  }, [beginLoad, isCurrent, loadSession]);

  const login = useCallback(async (username: string, password: string) => {
    const value = beginLoad();
    setBootstrap(null); setUser(null); lectureRef.current = ''; setCurrentLectureId('');
    try {
      const session = await api.login(username.trim(), password);
      await loadSession(session.user, value, preferredLectureRef.current);
      if (isCurrent(value)) { preferredLectureRef.current = ''; setPreferredRole(null); }
    } catch (err) {
      if (isCurrent(value)) setError(errorText(err));
      throw err;
    }
    finally { if (isCurrent(value)) setLoading(false); }
  }, [beginLoad, isCurrent, loadSession]);

  const loginDemo = useCallback((nextRole: Role) => login(nextRole, 'demo123'), [login]);

  const endSession = useCallback(async (nextRole: Role | null) => {
    const value = generation.current;
    setLoading(true); setError(null);
    try {
      await api.logout();
      if (!isCurrent(value)) return;
      preferredLectureRef.current = nextRole ? lectureRef.current : '';
      beginLoad();
      setUser(null); setBootstrap(null); lectureRef.current = ''; setCurrentLectureId('');
      setPreferredRole(nextRole);
      setLoading(false);
    } catch (err) {
      if (isCurrent(value)) {
        setError(`Không thể đăng xuất. ${errorText(err)}`);
        setLoading(false);
      }
    }
  }, [beginLoad, isCurrent]);
  const logout = useCallback(() => endSession(null), [endSession]);
  const switchRole = useCallback((nextRole: Role) => endSession(nextRole), [endSession]);

  const selectLecture = useCallback(async (id: string) => {
    const value = beginLoad();
    lectureRef.current = id; setCurrentLectureId(id);
    try {
      const ws = await api.getWorkspace(id);
      if (isCurrent(value)) {
        applyWorkspace(ws);
        try { localStorage.setItem(`lecture_twin_lecture_${userIdRef.current}`, id); } catch { /* Optional convenience. */ }
      }
    } catch (err) { if (isCurrent(value)) setError(errorText(err)); }
    finally { if (isCurrent(value)) setLoading(false); }
  }, [beginLoad, isCurrent, applyWorkspace]);

  const refreshWorkspace = useCallback(async () => {
    const value = generation.current, id = lectureRef.current;
    if (!id) return;
    try {
      const ws = await api.getWorkspace(id);
      if (isCurrent(value) && lectureRef.current === id) applyWorkspace(ws);
    } catch (err) { if (isCurrent(value)) setError(errorText(err)); }
  }, [applyWorkspace, isCurrent]);

  const refreshBootstrap = useCallback(async () => {
    const value = generation.current;
    try {
      const bs = await api.getBootstrap();
      if (isCurrent(value)) setBootstrap(bs);
    } catch (err) { if (isCurrent(value)) setError(errorText(err)); }
  }, [isCurrent]);

  useEffect(() => {
    if (!activeJob || !['queued', 'running'].includes(activeJob.status)) return;
    const value = generation.current, id = activeJob.id;
    let cancelled = false;
    let timer: number | undefined;
    const valid = () => !cancelled && isCurrent(value) && jobRef.current?.id === id;
    const poll = async () => {
      try {
        const next = await api.getJob(id);
        if (!valid()) return;
        setActiveJob(next);
        if (['queued', 'running'].includes(next.status)) timer = window.setTimeout(poll, 800);
        else await Promise.all([refreshWorkspace(), refreshBootstrap()]);
      } catch (err) { if (valid()) setError(errorText(err)); }
    };
    timer = window.setTimeout(poll, 400);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [activeJob?.id, activeJob?.status, isCurrent, setActiveJob, refreshBootstrap, refreshWorkspace]);

  const setCurrentView = useCallback((view: ViewType) => {
    const allowed: ViewType[] = roleRef.current === 'student' ? ['student', 'tutor', 'assessment', 'graph', 'twin'] :
      roleRef.current === 'admin' ? ['admin', 'agents', 'graph', 'twin'] : ['ai', 'agents', 'lectures', 'graph', 'twin', 'simulation', 'assessment', 'questions'];
    if (allowed.includes(view)) updateCurrentView(view);
  }, []);
  const seekVideoTo = useCallback((seconds: number) => { if (Number.isFinite(seconds) && seconds >= 0) setVideoSeekTarget(seconds); }, []);
  const clearVideoSeek = useCallback(() => setVideoSeekTarget(null), []);

  return <AppContext.Provider value={{ user, role, bootstrap, currentLectureId, workspace, activeJob, loading, error, preferredRole,
    currentView, videoSeekTarget, setCurrentView, selectLecture, login, loginDemo, logout, switchRole, refreshWorkspace, refreshBootstrap,
    seekVideoTo, clearVideoSeek, setActiveJob, clearError: () => setError(null) }}>{children}</AppContext.Provider>;
};
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
