import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, RefreshCw, RotateCcw, CirclePause, AlertCircle } from 'lucide-react';
import { analysisProgress } from '../presentation';
import type { Job } from '../types';

/** Animation reveals recorded results; it never advances the server job. */
export function AnalysisProgress({ job, pending = false }: { job: Job | null; pending?: boolean }) {
  const [replay, setReplay] = useState(0);
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (pending) sectionRef.current?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: 'center' });
  }, [pending, reduced]);
  if (!job && !pending) return null;
  const running = pending || job?.status === 'running' || job?.status === 'queued';
  const steps = analysisProgress(job);
  const completed = steps.filter(step => step.status === 'completed').length;
  return (
    <section ref={sectionRef} aria-label="Tiến trình phân tích từng bước" className="scroll-mt-28 rounded-xl border border-[#e1e7ef] bg-white p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-[#12213b]">{running ? 'Theo dõi phân tích từng bước' : 'Các bước hệ thống vừa thực hiện'}</h2>
          <p className="text-xs leading-relaxed text-[#5f708b]">{running ? 'Trạng thái cập nhật từ lượt xử lý đang chạy.' : 'Bài mẫu xử lý nhanh. Các bước dưới đây xuất hiện lần lượt để bạn xem lại kết quả đã lưu.'}</p>
        </div>
        {!running && <button type="button" onClick={() => setReplay(value => value + 1)} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-[#2959ea] hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500"><RotateCcw className="h-3.5 w-3.5" />Xem lại từng bước</button>}
      </div>
      <p role="status" aria-live="polite" className="text-xs font-semibold text-[#5f708b]">{running ? 'Đang xử lý học liệu' : job?.status === 'needs_review' ? `${completed} bước tự động đã xong · Chờ bạn duyệt` : job?.status === 'failed' ? 'Lượt xử lý gặp lỗi' : job?.status === 'paused' ? 'Lượt xử lý đang tạm dừng' : job?.status === 'cancelled' ? 'Lượt xử lý đã huỷ' : `${completed}/4 bước đã hoàn tất`}</p>
      <motion.ol key={`${job?.id || 'starting'}-${job?.status || 'pending'}-${replay}`} initial={reduced ? false : 'hidden'} animate="visible" variants={{ visible: { transition: { staggerChildren: reduced ? 0 : 0.55 } } }} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map((step, index) => {
          const done = step.status === 'completed';
          const active = step.status === 'running';
          const waiting = step.status === 'needs_review';
          const failed = step.status === 'failed';
          const statusLabel = done ? 'Đã hoàn tất' : active ? 'Đang thực hiện' : waiting ? 'Cần bạn xác nhận' : failed ? 'Gặp lỗi' : 'Chưa thực hiện';
          return <motion.li key={step.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0, transition: { duration: 0.3 } } }} className={`rounded-xl border p-3.5 space-y-2 ${waiting ? 'border-amber-200 bg-amber-50' : done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-600 text-white' : waiting ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-500'}`}>
                {done ? <Check className="h-4 w-4" /> : active ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : waiting ? <CirclePause className="h-4 w-4" /> : failed ? <AlertCircle className="h-4 w-4 text-red-600" /> : index + 1}
              </span>
              <h3 className="text-sm font-bold text-[#12213b]">{step.title}</h3>
            </div>
            <p className="text-[11px] font-semibold text-[#5f708b]">{statusLabel}</p>
            <p className="text-xs leading-relaxed text-[#5f708b]">{step.detail}</p>
          </motion.li>;
        })}
      </motion.ol>
    </section>
  );
}
