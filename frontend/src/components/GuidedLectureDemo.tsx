import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check, ArrowRight, BookOpen, Sparkles, ShieldCheck, RefreshCw, Play, ExternalLink, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { latestAnalysis, lessonWorkflow, formatTimestamp, guidedNextAction } from '../presentation';

export function GuidedLectureDemo({ onReview, onPublish }: { onReview: () => void; onPublish: () => Promise<void> }) {
  const { workspace, bootstrap, currentLectureId, selectLecture, refreshWorkspace, refreshBootstrap, activeJob, setActiveJob, seekVideoTo } = useApp();
  const job = activeJob?.workflow === 'analysis' && activeJob.lecture_id === currentLectureId && activeJob.input?.version === workspace?.lecture.version ? activeJob : latestAnalysis(workspace);
  const workflow = lessonWorkflow(workspace);
  const guided = Boolean(workspace?.lecture.guided_demo);
  const [step, setStep] = useState<1 | 2 | 3>(guided && job ? job.status === 'needs_review' || job.status === 'completed' ? 3 : 2 : 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const reduce = useReducedMotion();
  useEffect(() => () => abortRef.current?.abort(), []);
  const action = guidedNextAction(job);
  const read = job?.agents.find(agent => agent.agent === 'perception');
  const knowledge = job?.agents.find(agent => agent.agent === 'knowledge');
  const verification = job?.agents.find(agent => agent.agent === 'verification');
  const notes = workspace?.transcript || [];
  const source = workspace?.assets.find(asset => asset.source_type === 'youtube_reference');
  const running = busy || job?.status === 'queued' || job?.status === 'running';
  const canViewReview = Boolean(workflow.canReview || workflow.reviewed || workflow.published);
  const preferredConcepts = ['bfs', 'dfs'].map(id => workspace?.concepts.find(concept => concept.id === id)).filter(Boolean);
  const examples = preferredConcepts.length ? preferredConcepts : (workspace?.concepts || []).slice(0, 2);
  const sourceFor = (conceptId: string) => {
    const candidates = workspace?.evidence.filter(evidence => evidence.concept_id === conceptId && evidence.valid) || [];
    const term = conceptId === 'bfs' ? 'hàng đợi' : conceptId === 'dfs' ? 'ngăn xếp' : '';
    return (term && candidates.find(evidence => evidence.text.toLowerCase().includes(term))) || candidates[0];
  };

  const prepare = async () => {
    setBusy(true); setError('');
    try {
      const copy = await api.prepareGuidedDemo(currentLectureId);
      await refreshBootstrap();
      await selectLecture(copy.lecture.id);
    } catch (e: any) { setError(e.detail || e.message || 'Chưa tạo được bài thực hành.'); }
    finally { setBusy(false); }
  };
  const runNext = async () => {
    if (!guided) { await prepare(); return; }
    if (job?.status === 'needs_review') { setStep(3); return; }
    const controller = new AbortController();
    abortRef.current?.abort(); abortRef.current = controller;
    setBusy(true); setError(''); setStep(2);
    try {
      const initial = job && (job.status === 'paused' || job.status === 'failed')
        ? await api.controlJob(job.id, job.status === 'failed' ? 'retry' : 'resume')
        : await api.startAnalysis(currentLectureId, true);
      if (controller.signal.aborted) return;
      setActiveJob(initial);
      const finished = await api.waitForJob(initial, controller.signal);
      if (controller.signal.aborted) return;
      setActiveJob(finished);
      await Promise.all([refreshWorkspace(), refreshBootstrap()]);
      if (finished.status === 'needs_review') setStep(3);
      if (finished.status === 'failed') setError(finished.error || 'Bước xử lý gặp lỗi. Bạn có thể thử lại.');
    } catch (e: any) { if (e.name !== 'AbortError') setError(e.detail || e.message || 'Bước xử lý chưa hoàn tất.'); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  const openSource = (seconds: number) => {
    seekVideoTo(seconds);
    document.getElementById('lecture-source-panel')?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' });
  };
  const publish = async () => {
    setBusy(true);
    try { await onPublish(); } finally { setBusy(false); }
  };
  const nav = [
    { id: 1 as const, title: 'Học liệu', hint: workflow.hasSources ? 'Xem dữ liệu đầu vào' : 'Chưa có học liệu', icon: BookOpen, done: workflow.hasSources },
    { id: 2 as const, title: 'AI xử lý', hint: job?.status === 'needs_review' || job?.status === 'completed' ? 'Xem đề xuất và nguồn' : job?.status === 'paused' ? 'Chờ bạn chạy bước tiếp' : running ? 'Đang thực hiện' : 'Chạy từng bước', icon: Sparkles, done: workflow.analyzed },
    { id: 3 as const, title: 'Bạn duyệt', hint: workflow.reviewed || workflow.published ? 'Xem quyết định đã lưu' : canViewReview ? 'Kiểm tra và quyết định' : 'Chờ kết quả xử lý', icon: ShieldCheck, done: workflow.reviewed || workflow.published },
  ];
  return <section aria-label="Demo ba bước bài giảng" className="overflow-hidden rounded-2xl border border-[#dbe4f3] bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1">
        <label className="sr-only" htmlFor="guided-lecture-picker">Bài giảng đang xem</label>
        <select id="guided-lecture-picker" value={currentLectureId} disabled={running} onChange={e => void selectLecture(e.target.value)} className="min-h-[44px] max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-[#12213b]">
          {bootstrap?.lectures.map(lecture => <option key={lecture.id} value={lecture.id}>{lecture.title}</option>)}
        </select>
      </div>
      <button type="button" disabled={running || !workflow.hasSources} onClick={prepare} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#2959ea] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"><Play className="h-4 w-4" />{guided ? 'Tạo demo mới từ đầu' : 'Bắt đầu demo từng bước'}</button>
    </div>
    <nav aria-label="Ba bước demo" className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3 sm:p-4">
      {nav.map(item => <button key={item.id} type="button" aria-current={step === item.id ? 'step' : undefined} disabled={item.id === 3 && !canViewReview} onClick={() => setStep(item.id)} className={`flex min-h-[72px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed ${step === item.id ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50 disabled:opacity-50'}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.done ? 'bg-blue-600 text-white' : step === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{item.done ? <Check className="h-4 w-4" /> : <item.icon className="h-4 w-4" />}</span>
        <span><span className="block text-sm font-bold text-[#12213b]">{item.id}. {item.title}</span><span className="mt-0.5 block text-xs text-[#5f708b]">{item.hint}</span></span>
      </button>)}
    </nav>
    <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {guided && <p className="mb-3 text-xs font-medium text-blue-700">Bài thực hành riêng · Mỗi lần bấm chỉ thực hiện bước tiếp theo · Bài gốc được giữ nguyên</p>}
      <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
        {step === 1 && <div className="space-y-4">
          <div><h2 className="text-lg font-bold text-[#12213b]">1. Hệ thống sẽ đọc những gì?</h2><p className="mt-1 text-sm leading-relaxed text-[#5f708b]">Xem nguồn và ghi chú trước khi cho hệ thống xử lý. Với bài mẫu, nội dung được đọc từ ghi chú đã biên soạn theo phụ đề, chưa tự nghe video.</p></div>
          <div className="rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold text-[#12213b]">{source?.name || workspace?.assets[0]?.name || 'Chưa có nguồn học liệu'}</p><p className="mt-1 text-xs text-slate-500">{notes.length} ghi chú theo mốc · {workspace?.slides.length || 0} trang trình chiếu · {workspace?.lecture.objectives.length || 0} mục tiêu học tập</p>{source?.url && <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-blue-700">Mở video gốc trên YouTube<ExternalLink className="h-3 w-3" /></a>}</div>
          <div className="grid gap-3 md:grid-cols-2">{notes.slice(0, 2).map(note => <div key={note.id} className="rounded-xl border border-slate-200 p-3"><button type="button" onClick={() => openSource(note.start)} className="min-h-[44px] text-xs font-semibold text-blue-700">Xem đoạn {formatTimestamp(note.start)} – {formatTimestamp(note.end)}</button><p className="text-sm leading-relaxed text-slate-600">{note.text}</p></div>)}</div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-500">Chưa có đề xuất nào được chấp nhận chỉ bằng việc thêm học liệu.</p><button type="button" disabled={running || !workflow.hasSources} onClick={() => guided ? void runNext() : void prepare()} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#2959ea] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowRight className="h-4 w-4" />}{guided ? job ? 'Xem bước xử lý tiếp theo' : 'Cho hệ thống đọc học liệu' : 'Tạo bài thực hành và bắt đầu demo'}</button></div>
        </div>}
        {step === 2 && <div className="space-y-4">
          <div><h2 className="text-lg font-bold text-[#12213b]">2. Từ ghi chú đến đề xuất có dẫn nguồn</h2><p className="mt-1 text-sm leading-relaxed text-[#5f708b]">{guided ? 'Hệ thống dừng sau mỗi công việc để bạn xem kết quả, rồi bấm chạy bước tiếp theo.' : 'Bạn có thể xem kết quả hiện có hoặc tạo demo riêng để tự chạy từng bước từ đầu.'} Công cụ hiện dùng luật và từ khóa, chưa gọi mô hình AI bên ngoài.</p></div>
          <ol className="grid gap-3 lg:grid-cols-3">{[{id:'perception',label:'Đọc nguồn',run:read,detail:read?.status==='completed'?`Đã đọc ${read.output?.result?.transcript_segments ?? 0} ghi chú.`:'Chờ đọc thông tin và ghi chú học liệu.'},{id:'knowledge',label:'Tìm ý chính',run:knowledge,detail:knowledge?.status==='completed'?`Tìm được ${knowledge.output?.result?.concept_count ?? 0} ý chính, gắn ${knowledge.output?.result?.evidence_count ?? 0} liên kết nguồn.`:'Chưa tạo ý chính từ nguồn.'},{id:'verification',label:'Đối chiếu nguồn',run:verification,detail:verification?.output?.result?.findings?`${verification.output.result.supported} mục có nguồn; ${verification.output.result.findings.length-verification.output.result.supported} mục cần bổ sung hoặc loại bỏ.`:'Chưa kiểm tra các dẫn chứng.'}].map((item,index)=><li key={item.id} className={`rounded-xl border p-4 ${item.run?.status==='completed'||item.run?.status==='needs_review'?'border-emerald-200 bg-emerald-50/50':'border-slate-200 bg-slate-50'}`}><p className="flex items-center gap-2 text-sm font-bold text-[#12213b]">{item.run?.status==='completed'||item.run?.status==='needs_review'?<Check className="h-4 w-4 text-emerald-600" />:item.run?.status==='running'?<RefreshCw className="h-4 w-4 motion-safe:animate-spin" />:<span>{index+1}.</span>}{item.label}</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{item.detail}</p></li>)}</ol>
          {!!workspace?.concepts.length && <div className="space-y-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Ví dụ kết quả từ nguồn</p>{examples.map(concept=>{if (!concept) return null; const evidence=sourceFor(concept.id);return <div key={concept.id} className="rounded-xl border border-slate-200 p-3"><p className="text-sm font-bold text-[#12213b]">{concept.label} <span className="font-normal text-slate-500">— {concept.description}</span></p>{evidence&&<><p className="mt-1 text-sm text-slate-600">“{evidence.text}”</p>{evidence.start!=null&&<button type="button" onClick={()=>openSource(evidence.start!)} className="min-h-[44px] text-xs font-semibold text-blue-700">Đối chiếu đoạn nguồn {formatTimestamp(evidence.start)}</button>}</>}</div>})}</div>}
          <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm text-slate-600">{job?.status==='paused'&&job.pause_reason==='guided_demo'?'Đã xong bước này. Bấm để thực hiện công việc tiếp theo.':job?.status==='needs_review'?'Đã tạo đề xuất. Cần giảng viên kiểm tra trước khi giao cho học viên.':job?.status==='completed'?'Lượt phân tích đã hoàn tất.':running?'Đang thực hiện công việc được yêu cầu.':'Sẵn sàng chạy trên học liệu của bài thực hành.'}</p>{job?.status!=='completed'&&<button type="button" disabled={running} onClick={runNext} className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#2959ea] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{running?<RefreshCw className="h-4 w-4 motion-safe:animate-spin" />:<ArrowRight className="h-4 w-4" />}{running?'Đang thực hiện…':guided?action.label:'Tạo demo từng bước từ đầu'}</button>}</div>
        </div>}
        {step === 3 && <div className="space-y-4">
          <div><h2 className="text-lg font-bold text-[#12213b]">3. Bạn quyết định nội dung được sử dụng</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Kiểm tra dẫn chứng cho từng đề xuất. Mục thiếu nguồn sẽ được loại khỏi bài dành cho học viên khi bạn xác nhận quyết định duyệt.</p></div>
          <ul className="grid gap-2 sm:grid-cols-2">{workspace?.findings.map(finding=>{const evidence=sourceFor(finding.concept_id);return <li key={finding.id} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${finding.has_evidence?'border-slate-200':'border-amber-200 bg-amber-50'}`}>{finding.has_evidence?<ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />:<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div><p className="font-semibold text-[#12213b]">{finding.title}</p><p className="mt-1 text-xs text-slate-500">{finding.status==='confirmed'?'Đã được bạn chấp nhận':finding.status==='rejected'?'Đã loại khỏi bài học':finding.has_evidence?'Có nguồn · Chờ bạn xác nhận':'Chưa đủ nguồn · Cần loại hoặc bổ sung'}</p>{evidence?.start!=null&&<button type="button" onClick={()=>openSource(evidence.start!)} className="min-h-[44px] text-xs font-semibold text-blue-700">Xem dẫn chứng {formatTimestamp(evidence.start)}</button>}</div></li>})}</ul>
          {workflow.canReview&&<button type="button" onClick={onReview} className="min-h-[44px] rounded-lg bg-[#2959ea] px-4 py-2 text-sm font-semibold text-white">Kiểm tra và ghi quyết định duyệt</button>}
          {workflow.canPublish&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Đã lưu quyết định duyệt. Bạn có thể xuất bản để học viên sử dụng.</p><button type="button" onClick={publish} disabled={busy} className="min-h-[44px] rounded-lg bg-[#2959ea] px-4 py-2 text-sm font-semibold text-white">Xuất bản bài thực hành</button></div>}
          {workflow.published&&<p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Đã xuất bản. Học viên có thể truy cập bài này bằng tài khoản học viên.</p>}
        </div>}
      </motion.div>
    </div>
  </section>;
}
