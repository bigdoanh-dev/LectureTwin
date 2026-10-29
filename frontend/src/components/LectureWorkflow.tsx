import React, { useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Upload, FileText, Sparkles, ShieldCheck, Check, ArrowRight, RefreshCw, X, AlertTriangle } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { analysisProgress, formatTimestamp, latestAnalysis, lessonWorkflow, uploadFileKind } from '../presentation';

type Phase = 'uploading' | 'analyzing' | null;
const buttonClass = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-[#2959ea] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500';

export function LectureWorkflow({ onReview, onPublish, step, onStepChange, onShowResults }: { onReview: () => void; onPublish: () => Promise<void>; step: 1 | 2 | 3; onStepChange: (step: 1 | 2 | 3) => void; onShowResults: () => void }) {
  const { workspace, bootstrap, currentLectureId, selectLecture, refreshWorkspace, refreshBootstrap, activeJob, setActiveJob, seekVideoTo } = useApp();
  const workflow = lessonWorkflow(workspace);
  const userAssets = workspace?.assets.filter(asset => asset.source_type === 'user_upload') || [];
  const selectedJob = activeJob?.workflow === 'analysis' && activeJob.lecture_id === currentLectureId && activeJob.input?.version === workspace?.lecture.version
    ? activeJob : latestAnalysis(workspace);
  const job = userAssets.length ? selectedJob : null;
  const setStep = onStepChange;
  const [files, setFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<Phase>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const draftTargetRef = useRef('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();

  const running = busy || Boolean(job && ['queued', 'running'].includes(job.status));
  const limit = bootstrap?.upload_limit_mb ?? 25;
  const canReview = userAssets.length > 0 && (workflow.canReview || workflow.reviewed || workflow.published);
  const needsNewLecture = Boolean(workspace?.assets.length) || workspace?.lecture.status === 'published' || Boolean(selectedJob && ['queued', 'running', 'paused', 'needs_review'].includes(selectedJob.status));
  const stages = analysisProgress(job).slice(0, 3);

  const chooseFiles = (incoming: File[]) => {
    setError('');
    setFiles([]);
    const kinds = new Set<string>();
    for (const file of incoming) {
      const kind = uploadFileKind(file.name);
      if (!kind) { setError(`Tệp “${file.name}” chưa được hỗ trợ. Chọn MP4, PDF, PPTX, VTT hoặc JSON.`); return; }
      if (!file.size || file.size > limit * 1024 * 1024) { setError(`Tệp “${file.name}” phải có dữ liệu và không vượt quá ${limit} MB.`); return; }
      if (kinds.has(kind)) { setError('Mỗi lượt chọn tối đa một video, một tệp trình chiếu và một tệp phụ đề.'); return; }
      kinds.add(kind);
    }
    setFiles(incoming); setStep(1);
  };

  const uploadAndAnalyze = async () => {
    if (!files.length) return;
    setBusy(true); setPhase('uploading'); setError('');
    let targetId = draftTargetRef.current || currentLectureId;
    try {
      if (!draftTargetRef.current && needsNewLecture) {
        const baseTitle = files[0].name.replace(/\.[^.]+$/, '').trim();
        const created = await api.createLecture({
          title: baseTitle.length >= 3 ? baseTitle.slice(0, 160) : `Bài giảng ${baseTitle}`,
          course_id: workspace?.lecture.course_id || bootstrap?.courses[0]?.id || '',
          objectives: ['Xác định và giải thích các ý chính trong học liệu đã tải lên'],
          total_minutes: 50,
        });
        targetId = created.id;
        draftTargetRef.current = targetId;
      }
      const order = { video: 0, slides: 1, transcript: 2 };
      const ordered = [...files].sort((a, b) => order[uploadFileKind(a.name)!] - order[uploadFileKind(b.name)!]);
      for (const file of ordered) await api.uploadAsset(targetId, file, uploadFileKind(file.name)!);
      setPhase('analyzing'); setStep(2);
      const started = await api.startAnalysis(targetId);
      if (targetId !== currentLectureId) {
        await refreshBootstrap();
        await selectLecture(targetId);
      } else {
        setActiveJob(started);
        await Promise.all([refreshWorkspace(), refreshBootstrap()]);
        setFiles([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    } catch (e: any) {
      setError(e.detail || e.message || 'Chưa hoàn tất tải lên và xử lý. Bạn có thể thử lại.');
      setPhase(null); setStep(1);
      await refreshBootstrap();
    } finally { setBusy(false); setPhase(null); }
  };

  const processExisting = async () => {
    setBusy(true); setError(''); setStep(2);
    try {
      const initial = job && ['paused', 'failed'].includes(job.status)
        ? await api.controlJob(job.id, job.status === 'failed' ? 'retry' : 'resume')
        : await api.startAnalysis(currentLectureId);
      setActiveJob(initial);
      await Promise.all([refreshWorkspace(), refreshBootstrap()]);
    } catch (e: any) { setError(e.detail || e.message || 'Chưa xử lý được học liệu.'); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    setBusy(true);
    try { await onPublish(); } finally { setBusy(false); }
  };
  const openSource = (seconds: number) => {
    seekVideoTo(seconds);
    document.getElementById('lecture-source-panel')?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' });
  };
  const nav = [
    { id: 1 as const, title: 'Tải học liệu', hint: phase === 'uploading' ? 'Đang tải tệp lên' : userAssets.length ? `${userAssets.length} tệp đã tải lên` : 'Chọn tệp từ máy tính', icon: Upload, done: Boolean(userAssets.length) },
    { id: 2 as const, title: 'AI xử lý', hint: running && phase !== 'uploading' ? 'Đang xử lý học liệu' : job && workflow.analyzed ? 'Đã có kết quả' : 'Sau khi tải tệp thành công', icon: Sparkles, done: Boolean(job && workflow.analyzed) },
    { id: 3 as const, title: 'Bạn duyệt', hint: canReview && workflow.published ? 'Đã xuất bản' : canReview && workflow.reviewed ? 'Đã duyệt' : canReview ? 'Chờ bạn kiểm tra' : 'Chờ AI xử lý xong', icon: ShieldCheck, done: canReview && (workflow.reviewed || workflow.published) },
  ];

  return <section id="lecture-workflow" aria-label="Tải học liệu, AI xử lý và bạn duyệt" className="scroll-mt-28 overflow-hidden rounded-2xl border border-[#dbe4f3] bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
      <p className="text-sm font-bold text-[#12213b]">Từ tệp bài giảng đến nội dung đã duyệt</p>
      <div className="min-w-0">
        <label htmlFor="workflow-lecture-picker" className="sr-only">Bài giảng đang xem</label>
        <select id="workflow-lecture-picker" value={currentLectureId} disabled={running} onChange={e => void selectLecture(e.target.value)} className="min-h-[44px] w-full max-w-[320px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-[#12213b]">
          {bootstrap?.lectures.map(lecture => <option key={lecture.id} value={lecture.id}>{lecture.title}</option>)}
        </select>
      </div>
    </div>
    <nav aria-label="Ba bước xử lý bài giảng" className="grid grid-cols-1 gap-2 p-3 sm:grid-cols-3 sm:p-4">
      {nav.map(item => <button key={item.id} type="button" aria-current={step === item.id ? 'step' : undefined} disabled={busy || item.id === 3 && !canReview || item.id === 2 && !userAssets.length} onClick={() => setStep(item.id)} className={`flex min-h-[72px] items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed ${step === item.id ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50 disabled:opacity-50'}`}>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.done || step === item.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{item.done ? <Check className="h-4 w-4" /> : <item.icon className="h-4 w-4" />}</span>
        <span><span className="block text-sm font-bold text-[#12213b]">{item.id}. {item.title}</span><span className="mt-0.5 block text-xs text-[#5f708b]">{item.hint}</span></span>
      </button>)}
    </nav>
    <div className="border-t border-slate-100 px-4 py-4 sm:px-5">
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <motion.div key={step} initial={reduce ? false : { opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }}>
        {step === 1 && <div className="space-y-4">
          <div><h2 className="text-lg font-bold text-[#12213b]">1. Tải tệp bài giảng lên</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Chọn video, tài liệu trình chiếu hoặc phụ đề. Tải xong, hệ thống sẽ xử lý các tệp bạn vừa gửi rồi chuyển kết quả sang bước duyệt.</p></div>
          <label onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!running) chooseFiles(Array.from(event.dataTransfer.files)); }} className={`flex min-h-[150px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center ${dragging ? 'border-blue-500 bg-blue-50' : 'border-blue-200 bg-blue-50/40'} ${running ? 'pointer-events-none opacity-60' : 'hover:bg-blue-50'}`}>
            <Upload className="h-7 w-7 text-[#2959ea]" />
            <span className="text-sm font-bold text-[#12213b]">Kéo thả tệp vào đây hoặc bấm để chọn</span>
            <span className="text-xs text-slate-500">MP4 · PDF · PPTX · Phụ đề VTT / JSON · Tối đa {limit} MB/tệp</span>
            <input ref={fileInputRef} aria-label="Chọn tệp bài giảng" type="file" multiple accept=".mp4,.pdf,.pptx,.vtt,.json" disabled={running} onChange={event => chooseFiles(Array.from(event.target.files || []))} className="sr-only" />
          </label>
          {!!files.length && <ul aria-label="Tệp đã chọn" className="space-y-2">{files.map(file => <li key={file.name} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm"><span className="flex min-w-0 items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-blue-600" /><span className="break-all">{file.name}</span><span className="shrink-0 text-xs text-slate-500">{file.size < 1024 * 1024 ? `${Math.max(1, Math.ceil(file.size / 1024))} KB` : `${(file.size / 1024 / 1024).toFixed(2)} MB`}</span></span><button type="button" disabled={busy} aria-label={`Bỏ tệp ${file.name}`} onClick={() => setFiles(files.filter(item => item !== file))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100"><X className="h-4 w-4" /></button></li>)}</ul>}
          <p className="rounded-lg bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Nếu tải video, hãy gửi kèm phụ đề VTT/JSON hoặc tài liệu có văn bản để phân tích nội dung. Bản demo chưa tự nghe lời nói, đọc hình trong video hoặc nhận chữ từ trang ảnh.</p>
          {needsNewLecture && <p className="text-xs text-slate-500">Những tệp được chọn trong lần tải này tạo thành một bài giảng mới. Bài đang xem được giữ nguyên; tệp cũ không tự ghép vào bài mới.</p>}
          {!!userAssets.length && <div className="space-y-2"><p className="text-xs font-semibold text-slate-500">Tệp của bài đang xem</p>{userAssets.map(asset => <p key={asset.id} className="flex items-center gap-2 text-sm text-slate-600"><Check className="h-4 w-4 text-emerald-600" />{asset.name}</p>)}</div>}
          <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={!files.length || running} onClick={uploadAndAnalyze} className={buttonClass}>{busy ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowRight className="h-4 w-4" />}{phase === 'uploading' ? 'Đang tải tệp lên…' : 'Tải lên và phân tích'}</button></div>
        </div>}
        {step === 2 && <div className="space-y-4">
          <div><h2 className="text-lg font-bold text-[#12213b]">2. AI xử lý học liệu đã tải lên</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Hệ thống đọc văn bản, tìm ý chính và gắn dẫn chứng. Kết quả vẫn cần bạn kiểm tra trước khi dùng cho học viên.</p></div>
          {phase === 'analyzing' ? <p role="status" className="flex items-center gap-2 rounded-xl bg-blue-50 p-4 text-sm text-blue-800"><RefreshCw className="h-4 w-4 motion-safe:animate-spin" />Đã tải xong tệp. Đang bắt đầu xử lý nội dung…</p> : <>
            <ol className="grid gap-3 lg:grid-cols-3">{stages.map((stage, index) => <li key={stage.id} className={`rounded-xl border p-4 ${stage.status === 'completed' ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'}`}><p className="flex items-center gap-2 text-sm font-bold text-[#12213b]">{stage.status === 'completed' ? <Check className="h-4 w-4 text-emerald-600" /> : stage.status === 'running' ? <RefreshCw className="h-4 w-4 motion-safe:animate-spin" /> : `${index + 1}.`}{stage.title}</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{stage.detail}</p></li>)}</ol>
            {!workflow.hasText && job && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Chưa có văn bản để phân tích nội dung. Hệ thống chỉ đọc được thông tin tệp; cần bổ sung phụ đề hoặc tài liệu có văn bản. Chưa có căn cứ để tạo ý chính.</p>}
            {workflow.hasText && job?.status === 'needs_review' && !workspace?.concepts.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Đã đọc tệp nhưng chưa nhận diện được ý chính cho chủ đề này. Bộ xử lý minh họa hiện hỗ trợ nội dung BFS/DFS; cần bổ sung bộ xử lý hoặc nội dung do giảng viên biên soạn.</p>}
            {!!workspace?.concepts.length && <button type="button" onClick={onShowResults} className="min-h-[44px] rounded-lg border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-700">Xem {workspace.concepts.length} ý chính và dẫn chứng bên dưới</button>}
            {job?.error && <p role="alert" className="text-sm text-red-700">{job.error}</p>}
          </>}
          <p className="text-xs text-slate-500">Bản demo dùng luật và từ khóa để xử lý văn bản; chưa kết nối mô hình AI bên ngoài.</p>
          <div className="flex flex-wrap justify-end gap-2">
            {workflow.canReview && <button type="button" onClick={() => setStep(3)} className={buttonClass}>Xem và duyệt kết quả<ArrowRight className="h-4 w-4" /></button>}
            {(!job || ['paused', 'failed', 'cancelled'].includes(job.status)) && <button type="button" disabled={running || !workflow.hasSources} onClick={processExisting} className={buttonClass}>{job?.status === 'failed' ? 'Thử xử lý lại' : job?.status === 'paused' ? 'Tiếp tục xử lý' : 'Phân tích học liệu'}</button>}
          </div>
        </div>}
        {step === 3 && <div className="space-y-4">
          <div><h2 className="text-lg font-bold text-[#12213b]">3. Kiểm tra và duyệt kết quả</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">Đọc các đề xuất và đối chiếu nguồn. Chỉ nội dung được bạn chấp nhận mới đưa vào bài dành cho học viên.</p></div>
          <ul className="grid gap-2 sm:grid-cols-2">{workspace?.findings.map(finding => <li key={finding.id} className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${finding.has_evidence ? 'border-slate-200' : 'border-amber-200 bg-amber-50'}`}>{finding.has_evidence ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}<div><p className="font-semibold text-[#12213b]">{finding.title}</p><p className="mt-1 text-xs text-slate-500">{finding.status === 'confirmed' ? 'Đã chấp nhận' : finding.status === 'rejected' ? 'Đã loại khỏi bài học' : finding.has_evidence ? 'Có nguồn · Chờ bạn xác nhận' : 'Chưa đủ nguồn · Cần bổ sung hoặc loại'}</p></div></li>)}</ul>
          {workflow.canReview && <button type="button" onClick={onReview} className={buttonClass}>Ghi quyết định duyệt</button>}
          {workflow.canPublish && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-800">Đã lưu quyết định duyệt. Bạn có thể xuất bản cho học viên.</p><button type="button" disabled={busy} onClick={publish} className={buttonClass}>Xuất bản cho học viên</button></div>}
          {workflow.published && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Đã xuất bản. Học viên có thể sử dụng bài giảng này.</p>}
        </div>}
      </motion.div>
    </div>
  </section>;
}
