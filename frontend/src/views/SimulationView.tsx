import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  PlayCircle,
  Sliders,
  Plus
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { ScenarioComparison } from '../types';

export const SimulationView: React.FC = () => {
  const { workspace, currentLectureId, refreshWorkspace, role } = useApp();
  const totalMinutes = workspace?.lecture.total_minutes || 50;

  const [requestText, setRequestText] = useState<string>('Thêm 10 phút bài tập thực hành DFS nhưng không tăng tổng thời lượng bài giảng');
  const [addPractice, setAddPractice] = useState<number>(10);
  const [loading, setLoading] = useState<boolean>(false);
  const [comparison, setComparison] = useState<ScenarioComparison | null>(null);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const shouldReduceMotion = useReducedMotion();
  const simAbortRef = useRef<AbortController | null>(null);

  // Clear comparison, scenario ID, and messages on lecture change, and abort wait (Review line 26)
  useEffect(() => {
    setComparison(null);
    setActiveScenarioId(null);
    setMsg(null);
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
  }, [currentLectureId]);

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentLectureId) return;
    if (simAbortRef.current) {
      simAbortRef.current.abort();
    }
    const abortCtrl = new AbortController();
    simAbortRef.current = abortCtrl;

    setLoading(true);
    setMsg(null);
    try {
      const initialJob = await api.runScenario(currentLectureId, {
        title: 'Kịch bản tăng cường thực hành DFS',
        request: requestText,
        add_practice_minutes: addPractice,
        total_limit: totalMinutes,
      });

      const scenarioJob = await api.waitForJob(initialJob, abortCtrl.signal);

      if (scenarioJob.status === 'completed' && scenarioJob.result?.comparison) {
        setComparison(scenarioJob.result.comparison);
        setActiveScenarioId(scenarioJob.result.scenario_id);
        setMsg('Đã hoàn thành mô phỏng kịch bản và đối chiếu ràng buộc thời lượng.');
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
      setMsg(`Đã lưu kịch bản thành phiên bản bản thảo mới (Draft v${newVer}). Phiên bản đã xuất bản ban đầu vẫn giữ nguyên.`);
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
          Mô phỏng cải tiến bài giảng (What-If)
        </h1>
        <p className="text-sm sm:text-[15px] text-[#5f708b] font-medium mt-1">
          Kiểm tra các ràng buộc thời khóa biểu và phân bổ thời lượng thực tế — Không đưa ra các dự đoán điểm số cảm tính.
        </p>
      </div>

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
          <span>Thiết lập yêu cầu thay đổi kịch bản</span>
        </h2>

        <form onSubmit={handleRunSimulation} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#12213b] mb-1.5">
              Yêu cầu cải tiến của Giảng viên:
            </label>
            <input
              type="text"
              value={requestText}
              onChange={(e) => setRequestText(e.target.value)}
              className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#12213b] mb-1">
                Thời lượng thực hành bổ sung (phút):
              </label>
              <input
                type="number"
                min={5}
                max={25}
                value={addPractice}
                onChange={(e) => setAddPractice(Number(e.target.value))}
                className="w-full bg-[#f6f8fc] border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#12213b] focus:outline-hidden focus:ring-2 focus:ring-[#2959ea]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#12213b] mb-1">
                Giới hạn tổng thời lượng (phút):
              </label>
              <input
                type="number"
                value={totalMinutes}
                disabled
                className="w-full bg-slate-100 border border-[#e1e7ef] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#5f708b] cursor-not-allowed"
              />
            </div>
          </div>

          <div className="flex items-center justify-end pt-2 border-t border-[#e1e7ef]">
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 disabled:opacity-50 shadow-xs transition-colors flex items-center gap-2 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
            >
              <PlayCircle className="w-4 h-4" />
              <span>{loading ? 'Đang chạy mô phỏng...' : 'Chạy mô phỏng What-if'}</span>
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
                KẾT QUẢ ĐỐI CHIẾU MÔ PHỎNG
              </span>
              <h3 className="font-bold text-base text-[#12213b] mt-0.5">
                Kịch bản: Tăng cường thực hành DFS (+{comparison.practice_delta} phút)
              </h3>
            </div>

            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              comparison.feasible
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {comparison.feasible ? `✓ Đảm bảo ràng buộc thời gian (${totalMinutes}p)` : '⚠ Vượt quá tổng thời lượng'}
            </span>
          </div>

          {/* Assumptions */}
          <div className="bg-[#f6f8fc] rounded-xl p-3.5 text-xs space-y-1.5 border border-[#e1e7ef]">
            <span className="font-bold text-[#12213b] block">Các giả định điều chỉnh thời lượng:</span>
            <ul className="list-disc pl-4 space-y-1 text-[#5f708b]">
              {comparison.assumptions.map((as, i) => (
                <li key={i}>{as}</li>
              ))}
            </ul>
          </div>

          {/* Segments side-by-side comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Baseline */}
            <div className="border border-[#e1e7ef] rounded-xl p-3.5 space-y-2 bg-[#f6f8fc]">
              <span className="font-bold text-[#12213b] block">1. Kịch bản gốc (Baseline): {totalMinutes} phút</span>
              <div className="space-y-1.5">
                {comparison.baseline_segments.map(s => (
                  <div key={s.id} className="flex justify-between bg-white p-2 rounded-lg border border-[#e1e7ef]">
                    <span>{s.title}</span>
                    <strong className="text-[#12213b]">{s.minutes}p</strong>
                  </div>
                ))}
              </div>
            </div>

            {/* Simulated */}
            <div className="border border-blue-200 bg-blue-50/30 rounded-xl p-3.5 space-y-2">
              <span className="font-bold text-[#2959ea] block">2. Kịch bản sau mô phỏng: {totalMinutes} phút</span>
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
                Lưu kịch bản này thành bản thảo mới để tiếp tục tinh chỉnh?
              </span>
              <button
                type="button"
                onClick={handleCreateVersion}
                disabled={loading}
                className="min-h-[44px] px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white bg-[#2959ea] hover:bg-blue-700 shadow-2xs transition-colors flex items-center space-x-1.5 cursor-pointer focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#2959ea]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Lưu thành Phiên bản mới (Draft v{(workspace?.lecture.version ?? 1) + 1})</span>
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};
