import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  PlayCircle,
  Sliders,
  Plus,
  History,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { ScenarioComparison } from '../types';
import { lessonWorkflow, workspaceSections } from '../presentation';

export const SimulationView: React.FC = () => {
  const { workspace, currentLectureId, refreshWorkspace, role, setCurrentView } = useApp();
  const totalMinutes = workspace?.lecture.total_minutes ?? workspace?.planned?.total_minutes ?? 0;
  const savedScenarios = workspace?.scenarios || [];
  const workflow = lessonWorkflow(workspace);
  const practiceName = workspace?.planned.segments.find(segment => segment.kind === 'practice')?.title || 'phần thực hành';
  const ready = workspace?.lecture.sample_attached
    ? Boolean((workflow.reviewed || workflow.published) && workspace.planned.segments.length)
    : workspaceSections(workspace).canImprove;
  const defaultRequest = `Thêm 10 phút cho ${practiceName} nhưng không tăng tổng thời lượng bài giảng`;

  const [requestText, setRequestText] = useState<string>(defaultRequest);
  const [addPractice, setAddPractice] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(false);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const activeScenario = savedScenarios.find(scenario => scenario.id === activeScenarioId);
  const activeScenarioMatchesCurrentPlan = !activeScenario || activeScenario.base_version === workspace?.lecture.version;

  const shouldReduceMotion = useReducedMotion();
  const simAbortRef = useRef<AbortController | null>(null);

  // Clear comparison, scenario ID, and messages on lecture change, and abort wait (Review line 26)
  useEffect(() => {
    setComparison(null);
    setActiveScenarioId(null);
    setMsg(null);
    setRequestText(defaultRequest);
    if (simAbortRef.current) {
      simAbortRef.current.abort();
      simAbortRef.current = null;
    }
    return () => {
      if (simAbortRef.current) {
        simAbortRef.current.abort();
        simAbortRef.current = null;
      }
    };
  }, [currentLectureId, workspace?.lecture.version]);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLectureId || !ready) return;
    if (simAbortRef.current) {
      simAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    simAbortRef.current = abortCtrl;

    setLoading(true);
    setMsg(null);
    try {
      const initialJob = await api.runScenario(currentLectureId, {
        title: requestText.trim() || 'Phương án thử bài giảng',
        request: requestText,
        add_practice_minutes: addPractice,
        total_limit: totalMinutes,
      });

      const scenarioJob = await api.waitForJob(initialJob, abortCtrl.signal);

      if (scenarioJob.status === 'completed' && scenarioJob.result?.comparison) {
        setComparison(scenarioJob.result.comparison);
        setActiveScenarioId(scenarioJob.result.scenario_id);
        setMsg('Đã tính phương án thử. Đây là kết quả xem trước; bài đang dùng chưa thay đổi.');
      } else {
        setMsg(scenarioJob.error || 'Mô phỏng kịch bản không thành công.');
      }
      await refreshWorkspace();
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setMsg(err.detail || err.message || 'Lỗi khi chạy mô phỏng kịch bản');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!activeScenarioId) return;
    setLoading(true);
    try {
      const res = await api.createScenarioVersion(activeScenarioId);
      await refreshWorkspace();
      const newVer = res?.version ?? ((workspace?.lecture.version ?? 1) + 1);
      setMsg(`Đã tạo bản nháp phiên bản ${newVer} từ phương án thử. Bản đã xuất bản không thay đổi.`);
    } catch (err: any) {
      setMsg(err.detail || 'Lỗi tạo phiên bản mới');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className="space-y-6 max-w-[1440px] mx-auto pb-12"
    >
      <div>
        <h1 className="text-[26px] sm:text-[30px] font-bold text-[#12213b] tracking-tight leading-tight">
          Thử thay đổi kế hoạch bài giảng
        </h1>
        <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
          Nhập số phút muốn thay đổi để xem lại phân bổ thời gian. Đây là phương án xem trước; chưa áp dụng vào bài đang dạy.
        </p>
      </div>

      {!ready && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Cần duyệt nội dung và có kế hoạch khớp với học liệu hiện tại trước khi tính phương án thử. <button type="button" onClick={() => setCurrentView('ai')} className="min-h-[44px] font-semibold text-blue-700 underline">Quay về bài giảng để kiểm tra</button></div>}

      {savedScenarios.length > 0 && (
        <section className="bg-white rounded-xl border border-[#e1e7ef] p-5 shadow-2xs space-y-3" aria-labelledby="saved-scenarios-title">
          <div>
            <h2 id="saved-scenarios-title" className="font-bold text-sm sm:text-base text-[#12213b] flex items-center gap-2">
              <History className="w-4 h-4 text-[#2959ea]" />
              <span>Phương án thử đã lưu ({savedScenarios.length})</span>
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-[#5f708b]">
              Đây là các kết quả tính thử. Chọn một phương án để xem lại; kế hoạch bài học chỉ đổi khi bạn chủ động tạo bản nháp.
            </p>
          </div>
          <div className="space-y-2">
            {savedScenarios.map(scenario => {
              const matchesCurrentPlan = scenario.base_version === workspace?.lecture.version;
              const isActive = scenario.id === activeScenarioId;
              return (
                <div key={scenario.id} className={`rounded-xl border p-3 sm:p-4 ${isActive ? 'border-[#2959ea] bg-blue-50/50' : 'border-[#e1e7ef] bg-[#f6f8fc]'}`}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <h3 className="font-semibold text-sm text-[#12213b]">{scenario.title}</h3>
                      <p className="text-xs text-[#5f708b]">{scenario.request}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#5f708b]">
                        <span>Thực hành: +{scenario.comparison.practice_delta} phút</span>
                        <span>Tổng thời lượng: {scenario.comparison.scenario_total} phút</span>
                        <span className="inline-flex items-center gap-1">
                          {matchesCurrentPlan ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
                          {matchesCurrentPlan ? 'Khớp kế hoạch hiện tại' : 'Dựa trên bản cũ; hãy tính lại trước khi lưu'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setComparison(scenario.comparison);
                        setActiveScenarioId(scenario.id);
                        setRequestText(scenario.request);
                        setAddPractice(scenario.comparison.practice_delta);
                      }}
                      className="min-h-[40px] shrink-0 px-3 py-2 rounded-lg border border-[#cbd8f4] bg-white text-[#2959ea] hover:bg-blue-50 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2959ea]"
                    >
                      {isActive ? 'Đang xem' : 'Xem kết quả thử'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {msg && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-[#12213b] flex items-center justify-between">
          <span>{msg}</span>
          <button onClick={() => setMsg(null)} className="text-[#2959ea] font-bold p-1">✕</button>
        </div>
      )}

      {/* Input Form */}
      <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-4">
        <h2 className="font-bold text-sm sm:text-base text-[#12213b] flex items-center gap-2">
          <Sliders className="w-4 h-4 text-[#2959ea]" />
          <span>Thử một thay đổi</span>
        </h2>

        <form onSubmit={handleRunSimulation} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#12213b] mb-1.5">
              Ghi chú cho phương án thử:
            </label>
            <input
              type="text"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              aria-describedby="scenario-note-help"
              className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
              required
            />
            <p id="scenario-note-help" className="mt-1.5 text-[11px] leading-snug text-[#5f708b]">
              Ghi chú giúp bạn nhận ra phương án. Phép tính bên dưới dựa trên số phút, không tự diễn giải nội dung ghi chú.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#12213b] mb-1">
                Số phút thực hành muốn thêm (5–25 phút):
              </label>
              <input
                type="number"
                min={5}
                max={25}
                value={addPractice}
                onChange={(e) => setAddPractice(Number(e.target.value))}
                aria-label="Số phút thực hành muốn thêm, từ 5 đến 25 phút"
                className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#12213b] mb-1">
                Tổng thời lượng đang đặt:
              </label>
              <input
                type="text"
                value={totalMinutes > 0 ? `${totalMinutes} phút` : 'Chưa có dữ liệu'}
                readOnly
                className="w-full bg-slate-100 border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#5f708b] cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-[#e1e7ef]">
            <button
              type="submit"
              disabled={loading || !ready || !activeScenarioMatchesCurrentPlan || totalMinutes <= 0}
              className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
            >
              <PlayCircle className="w-4 h-4" />
              <span>{loading ? 'Đang tính phương án thử...' : 'Tính phương án thử'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Comparison Results */}
      {comparison && (
        <div className="bg-white rounded-xl border border-[#e1e7ef] p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#e1e7ef]">
            <div>
              <span className="text-xs font-bold text-[#5f708b] uppercase tracking-wider block">
                KẾT QUẢ TÍNH THỬ
              </span>
              <h3 className="font-bold text-base text-[#12213b] mt-0.5">
                Phương án: {requestText} (+{comparison.practice_delta} phút)
              </h3>
            </div>

            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              comparison.feasible
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {comparison.feasible ? `✓ Trong giới hạn ${totalMinutes} phút` : '⚠ Vượt quá thời lượng cho phép'}
            </span>
          </div>

          {/* Assumptions */}
          <div className="bg-[#f6f8fc] rounded-xl p-3.5 text-xs space-y-1.5 border border-[#e1e7ef]">
              <span className="font-bold text-[#12213b] block">Cách tính và các giới hạn:</span>
            <ul className="list-disc pl-4 space-y-1 text-[#5f708b]">
              {comparison.assumptions.map((as, i) => (
                <li key={i}>{as}</li>
              ))}
            </ul>
          </div>

          {/* Segments side-by-side comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Current lesson plan */}
            <div className="border border-[#e1e7ef] rounded-xl p-3.5 space-y-2 bg-[#f6f8fc]">
              <span className="font-bold text-[#12213b] block">Kế hoạch hiện tại · {totalMinutes} phút</span>
              <div className="space-y-1.5">
                {comparison.baseline_segments.map(s => (
                  <div key={s.id} className="flex justify-between bg-white p-2 rounded-lg border border-[#e1e7ef]">
                    <span>{s.title}</span>
                    <strong className="text-[#12213b]">{s.minutes}p</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Trial version */}
            <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-[#2959ea] block">Phương án thử · {totalMinutes} phút</span>
              <div className="space-y-1.5">
                {comparison.scenario_segments.map(s => (
                  <div key={s.id} className="flex justify-between bg-white p-2 rounded-lg border border-blue-100">
                    <span className="font-medium text-[#12213b]">{s.title}</span>
                    <strong className="text-[#2959ea]">{s.minutes}p</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Create New Draft Version */}
          {role === 'teacher' && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-[#e1e7ef] gap-3">
              <span className="text-xs text-[#5f708b]">
                Tạo bản nháp mới từ phương án này? Bản đang dùng sẽ không đổi.
              </span>
              <button
                type="button"
                onClick={handleCreateVersion}
                disabled={loading}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo bản nháp phiên bản {(workspace?.lecture.version ?? 1) + 1}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
