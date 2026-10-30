import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Upload, Play, Network, Target, Check, ArrowRight, FileText, Clock, ShieldCheck, AlertCircle, Sliders, Layers, Search, Sparkles, ChevronDown, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VideoPlayer } from '../components/VideoPlayer';
import { ReviewModal } from '../components/ReviewModal';
import { AnalysisProgress } from '../components/AnalysisProgress';
import { api } from '../api';
import { analysisControl, formatEvidenceLabel, formatTimestamp, lessonWorkflow } from '../presentation';
import type { ConceptEdge, ConceptNode, Evidence, LectureResearch, ResearchObjective } from '../types';

const primary = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#2959ea] px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2';
const secondary = 'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-blue-500';
const card = 'rounded-2xl border border-[#e1e7ef] bg-white shadow-sm';

function ConceptGraph({nodes, edges, selected, onSelect}: {nodes: ConceptNode[]; edges: ConceptEdge[]; selected: string | null; onSelect: (id: string) => void}) {
  const xMin=Math.min(...nodes.map(n=>n.x)); const xSpan=Math.max(...nodes.map(n=>n.x))-xMin || 1;
  const yMin=Math.min(...nodes.map(n=>n.y)); const ySpan=Math.max(...nodes.map(n=>n.y))-yMin || 1;
  const points = new Map(nodes.map((n, i) => [n.id, {x: Number.isFinite(n.x) ? (nodes.length===1?320:110 + (n.x - xMin) / xSpan * 420) : 110 + (i % 3) * 210, y: Number.isFinite(n.y) ? 60 + (n.y - yMin) / ySpan * 370 : 60 + Math.floor(i / 3) * 140}]));
  return <div className="overflow-x-auto rounded-xl bg-[#f8faff] p-1">
    <svg viewBox="0 0 640 490" className="w-full min-w-[410px] max-h-[370px]" aria-label="Bản đồ khái niệm trong học liệu">
      <defs><marker id="concept-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="none" stroke="#9baec8" strokeWidth="1.3" /></marker></defs>
      {edges.map(edge => {
        const a = points.get(edge.source); const b = points.get(edge.target); if (!a || !b) return null;
        const dx = b.x-a.x; const dy=b.y-a.y; const length=Math.hypot(dx,dy) || 1;
        const trim = Math.min(88 / (Math.abs(dx)/length || .001), 26 / (Math.abs(dy)/length || .001));
        const x=(a.x+b.x)/2, y=(a.y+b.y)/2;
        return <g key={edge.id}><line x1={a.x+dx/length*trim} y1={a.y+dy/length*trim} x2={b.x-dx/length*(trim+3)} y2={b.y-dy/length*(trim+3)} stroke="#a4b5ce" strokeWidth="1.6" markerEnd="url(#concept-arrow)"/><rect x={x-43} y={y-10} width="86" height="21" rx="5" fill="#f8faff"/><text x={x} y={y+4} textAnchor="middle" fill="#667a97" fontSize="12">{edge.label}</text></g>;
      })}
      {nodes.map(n => {const pos=points.get(n.id)!; const active=selected===n.id;
        return <g key={n.id} role="button" tabIndex={0} aria-label={`Xem khái niệm ${n.label}`} aria-pressed={active} onClick={()=>onSelect(n.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(n.id);}}} className="cursor-pointer outline-none [&:focus-visible_rect]:stroke-blue-600 [&:focus-visible_rect]:stroke-[3]">
          <rect x={pos.x-88} y={pos.y-26} width="176" height="52" rx="13" fill={active?'#2959ea':'#ffffff'} stroke={active?'#2959ea':n.verified?'#a8d8cb':'#d2ddee'} strokeWidth="1.5"/>
          <text x={pos.x} y={pos.y+5} textAnchor="middle" fontSize="14" fontWeight="600" fill={active?'white':'#20334f'}>{n.label.length>25?n.label.slice(0,23)+'…':n.label}</text>
        </g>;
      })}
    </svg>
  </div>;
}

function ObjectiveRow({objective, research, canEdit, lectureId, refresh}: {objective: ResearchObjective; research: LectureResearch; canEdit: boolean; lectureId: string; refresh: () => Promise<void>}) {
  const [editing,setEditing]=useState(false); const [expected,setExpected]=useState(objective.expected_concept_ids);
  const [confirmed,setConfirmed]=useState(objective.confirmed_concept_ids); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const catalog=research.concept_catalog; const label=(id:string)=>catalog.find(c=>c.id===id)?.label || id;
  const reviewed=new Set(research.concepts.filter(c=>c.source_status==='reviewed').map(c=>c.concept_id));
  const save=async()=>{setBusy(true);setError('');try{await api.saveObjectiveMapping(lectureId,objective.id,{version:research.source_version,expected_concept_ids:expected,concept_ids:confirmed.filter(id=>expected.includes(id))});await refresh();setEditing(false);}catch(e:any){setError(e.message);}finally{setBusy(false);}};
  return <article className="border-t border-slate-100 py-5 first:border-t-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase text-blue-600">{objective.id.toUpperCase()}</span><span className={`rounded-full px-2 py-1 text-xs font-medium ${objective.status==='confirmed'&&!objective.missing_concept_ids.length?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-800'}`}>{objective.status==='confirmed'?(objective.missing_concept_ids.length?'Đã đối chiếu · còn thiếu nguồn':'Đã xác nhận liên kết'):'Chờ đối chiếu'}</span></div><h3 className="text-sm font-semibold leading-relaxed">{objective.title}</h3></div>
      {canEdit && <button className={secondary} onClick={()=>{setEditing(!editing);setExpected(objective.expected_concept_ids);setConfirmed(objective.confirmed_concept_ids);}}>{editing?'Đóng':'Đối chiếu CLO'}</button>}
    </div>
    {objective.expected_concept_ids.length ? <div className="mt-3 flex flex-wrap gap-2">{objective.expected_concept_ids.map(id=><span key={id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${objective.missing_concept_ids.includes(id)?'border-amber-200 bg-amber-50 text-amber-800':'border-slate-200 bg-slate-50 text-slate-600'}`}>{label(id)} · {!research.source_processed?'chờ phân tích':objective.missing_concept_ids.includes(id)?'chưa thấy nguồn':objective.confirmed_concept_ids.includes(id)?'đã đối chiếu':'tìm thấy, cần xem lại'}</span>)}</div>:<p className="mt-2 text-sm text-slate-500">Chưa xác định kiến thức tương ứng. Giảng viên chọn nội dung dự kiến để đối chiếu.</p>}
    {editing && <div className="mt-4 space-y-4 rounded-xl bg-slate-50 p-4">
      <fieldset><legend className="mb-2 text-sm font-semibold">1. CLO này cần những kiến thức nào?</legend><div className="flex flex-wrap gap-2">{catalog.map(c=><label key={c.id} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm"><input type="checkbox" checked={expected.includes(c.id)} onChange={e=>{setExpected(e.target.checked?[...expected,c.id]:expected.filter(id=>id!==c.id));if(!e.target.checked)setConfirmed(confirmed.filter(id=>id!==c.id));}}/>{c.label}</label>)}</div></fieldset>
      <fieldset><legend className="mb-2 text-sm font-semibold">2. Kiến thức nào đã có nguồn phù hợp?</legend><p className="mb-2 text-xs leading-relaxed text-slate-500">Chỉ xác nhận sau khi xem đoạn nguồn. Mục thiếu nguồn có thể để trống.</p><div className="flex flex-wrap gap-2">{expected.map(id=><label key={id} className={`flex min-h-[44px] items-center gap-2 rounded-lg border px-3 text-sm ${reviewed.has(id)?'border-slate-200 bg-white':'border-amber-200 text-amber-800'}`}><input type="checkbox" disabled={!reviewed.has(id)} checked={confirmed.includes(id)} onChange={e=>setConfirmed(e.target.checked?[...confirmed,id]:confirmed.filter(cid=>cid!==id))}/>{label(id)}{!reviewed.has(id)&&' · chưa duyệt nguồn'}</label>)}</div></fieldset>
      {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
      <button onClick={save} disabled={busy} className={primary}><Check className="h-4 w-4"/>{busy?'Đang lưu…':'Lưu liên kết đã kiểm tra'}</button>
    </div>}
  </article>;
}

export function ResearchWorkspaceView() {
  const {workspace,bootstrap,currentLectureId,selectLecture,setCurrentView,seekVideoTo,videoSeekTarget,clearVideoSeek,refreshWorkspace,refreshBootstrap,setActiveJob,role}=useApp();
  const reduced=useReducedMotion(); const flow=lessonWorkflow(workspace); const control=analysisControl(flow.job);
  const [selectedId,setSelectedId]=useState<string|null>(null); const [evidenceId,setEvidenceId]=useState<string|null>(null);
  const [query,setQuery]=useState(''); const [reviewOpen,setReviewOpen]=useState(false); const [busy,setBusy]=useState(false); const [message,setMessage]=useState('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;setSelectedId(null);setEvidenceId(null);setQuery('');setMessage('');return()=>{mounted.current=false;};},[currentLectureId,workspace?.lecture.version]);
  const research=workspace?.research; const concepts=workspace?.concepts || []; const selected=concepts.find(c=>c.id===selectedId) || concepts[0];
  const fact=research?.concepts.find(c=>c.concept_id===selected?.id);
  const sources=(workspace?.evidence || []).filter(e=>e.valid && e.concept_id===selected?.id).sort((a,b)=>(fact?.evidence_ids.indexOf(a.id) ?? 0)-(fact?.evidence_ids.indexOf(b.id) ?? 0));
  const evidence=sources.find(e=>e.id===evidenceId) || sources[0] || null;
  const selectEvidence=(e:Evidence)=>{setEvidenceId(e.id);if(e.start!==null)seekVideoTo(e.start);};
  const selectConcept=(id:string)=>{setSelectedId(id);const preferred=research?.concepts.find(c=>c.concept_id===id)?.evidence_ids[0];const e=workspace?.evidence.find(e=>e.valid&&e.id===preferred)||workspace?.evidence.find(e=>e.valid&&e.concept_id===id);setEvidenceId(e?.id || null);if(e?.start!=null)seekVideoTo(e.start);};
  const doAction=async()=>{
    if(!currentLectureId)return;
    if(control.action==='review'){setReviewOpen(true);return;}
    setBusy(true);setMessage('');
    try{
      if(flow.canPublish){await api.publishLecture(currentLectureId);setMessage('Đã phát hành bản học liệu được duyệt.');}
      else {const job=control.action==='resume'||control.action==='retry'?await api.controlJob(flow.job!.id,control.action):await api.startAnalysis(currentLectureId);if(mounted.current)setActiveJob(job);}
      if(mounted.current)await Promise.all([refreshWorkspace(),refreshBootstrap()]);
    }catch(e:any){if(mounted.current)setMessage(e.message);}finally{if(mounted.current)setBusy(false);}
  };
  const review=async(note:string)=>{if(!currentLectureId)return;await api.bulkReview(currentLectureId,note);if(flow.job)setActiveJob(await api.getJob(flow.job.id));await Promise.all([refreshWorkspace(),refreshBootstrap()]);};
  const sourceVideo=workspace?.assets.find(a=>a.kind==='video'); const sourceLabel=sourceVideo?.source_type==='youtube_reference'?'Video tham khảo và ghi chú biên soạn':'Video bài giảng';
  const matches=concepts.filter(c=>(c.label+' '+c.description).toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
  const relatedQuestions=(workspace?.assessments || []).filter(a=>a.version===workspace?.lecture.version).flatMap(a=>a.questions.filter(q=>q.concept_id===selected?.id));
  return <motion.div initial={reduced?false:{opacity:0,y:5}} animate={{opacity:1,y:0}} className="space-y-6 pb-10">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-600"><Layers className="h-4 w-4"/>Lecture Digital Twin</p><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Hiểu và điều chỉnh bài giảng</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">Tìm kiến thức trong video, đối chiếu chuẩn đầu ra và thử phân bổ lại thời gian giảng dạy.</p></div>
      <div className="flex flex-wrap gap-2"><label className="sr-only" htmlFor="research-lecture">Chọn bài giảng</label><select id="research-lecture" value={currentLectureId || ''} onChange={e=>selectLecture(e.target.value)} className="min-h-[44px] max-w-full rounded-xl border border-slate-200 bg-white px-3 text-sm sm:max-w-[260px]">{bootstrap?.lectures.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select><button className={secondary} onClick={()=>setCurrentView('lectures')}><Upload className="h-4 w-4"/>Tải video và học liệu</button></div>
    </div>
    <section className={`${card} flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between`} aria-label="Quy trình bài giảng">
      <ol className="grid flex-1 grid-cols-3 gap-2 sm:gap-5">{[
        {title:'Tải học liệu',detail:flow.hasSources?'Đã có nguồn':'Chọn video để bắt đầu',done:flow.hasSources},
        {title:'Phân tích nội dung',detail:flow.running?'Đang xử lý':flow.analyzed?'Có kết quả để xem':'Chờ xử lý',done:flow.analyzed},
        {title:'Bạn duyệt',detail:flow.published?'Đã phát hành':flow.reviewed?'Đã duyệt nội dung':'Kiểm tra trước phát hành',done:flow.reviewed||flow.published},
      ].map((s,i)=><li key={s.title} className="flex flex-col gap-2 sm:flex-row sm:items-center"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.done?'bg-emerald-50 text-emerald-700':'bg-blue-50 text-blue-600'}`}>{s.done?<Check className="h-4 w-4"/>:i+1}</span><div><p className="text-xs font-bold sm:text-sm">{s.title}</p><p className="mt-1 text-[11px] text-slate-500 sm:text-xs">{s.detail}</p></div></li>)}</ol>
      {role==='teacher'&& !flow.published&& <button className={primary} disabled={busy||flow.running||!flow.hasSources} onClick={doAction}>{flow.canPublish?<ShieldCheck className="h-4 w-4"/>:<Sparkles className="h-4 w-4"/>}{busy?'Đang thực hiện…':flow.canPublish?'Phát hành học liệu':control.label}</button>}
    </section>
    {message&&<p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">{message}</p>}
    {research?.sample_notes_outdated&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">Bài này dùng bộ ghi chú mẫu cũ có mốc cần đối chiếu lại. Các quyết định đã lưu được giữ nguyên. Để dùng bộ nguồn đã cập nhật, hãy tạo bài giảng mới và gắn học liệu mẫu tại mục Bài giảng.</p>}
    {flow.running?<AnalysisProgress job={flow.job} pending={busy}/>:flow.job&&<details className={`${card} px-5 py-2`}><summary className="flex min-h-[44px] cursor-pointer items-center justify-between text-sm font-medium text-slate-600"><span>{flow.job.status==='needs_review'?'Đã có kết quả · Đang chờ bạn kiểm tra nguồn':flow.job.status==='failed'?'Xử lý gặp lỗi · Xem chi tiết và thử lại':flow.job.status==='paused'?'Lượt xử lý đang tạm dừng':'Xem các bước xử lý đã lưu'}</span><ChevronDown className="h-4 w-4"/></summary><AnalysisProgress job={flow.job}/></details>}
    <div className="grid items-start gap-5 lg:grid-cols-12">
      <section className={`${card} overflow-hidden lg:col-span-5`} aria-labelledby="video-panel-title"><div className="flex items-center justify-between gap-2 px-5 py-4"><h2 id="video-panel-title" className="text-base font-bold">Video và bằng chứng</h2><span className="text-xs text-slate-500">{sourceVideo?.duration_seconds?formatTimestamp(sourceVideo.duration_seconds):'Chưa có video'}</span></div>
        {sourceVideo?<VideoPlayer lectureId={currentLectureId} variant="embedded" seekTarget={videoSeekTarget} onClearSeekTarget={clearVideoSeek} sampleAttached={workspace?.lecture.sample_attached} selectedEvidence={evidence} defaultEvidence={null}/>:<div className="flex aspect-video flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center"><Upload className="h-8 w-8 text-slate-300"/><p className="text-sm text-slate-500">Tải video bài giảng để bắt đầu.</p><button className={secondary} onClick={()=>setCurrentView('lectures')}>Chọn học liệu</button></div>}
        <div className="space-y-3 p-5"><p className="text-xs text-slate-500">{sourceLabel} · Kế hoạch dạy {workspace?.lecture.total_minutes ?? '—'} phút</p>
          {evidence?<><div className="flex items-center gap-2 text-sm font-semibold text-blue-600">{evidence.kind==='slide'?<FileText className="h-4 w-4"/>:<Clock className="h-4 w-4"/>}{formatEvidenceLabel(evidence)}</div><p className="text-sm leading-relaxed text-slate-600">{evidence.text}</p><p className="text-xs text-slate-400">{evidence.source_type==='youtube_caption_annotation'?'Ghi chú biên soạn theo phụ đề, chưa phải AI tự nghe video.':evidence.verified?'Giảng viên đã duyệt nguồn này.':'Dẫn chứng cần giảng viên kiểm tra.'}</p></>:<p className="text-sm text-slate-500">Chọn khái niệm để xem nguồn, mốc video hoặc trang slide liên quan.</p>}
        </div>
      </section>
      <section className={`${card} min-w-0 space-y-4 p-5 lg:col-span-7`} aria-labelledby="concept-panel-title">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 id="concept-panel-title" className="flex items-center gap-2 text-base font-bold"><Network className="h-4 w-4 text-blue-600"/>Bản đồ kiến thức</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">Chọn một khái niệm để mở đúng đoạn nguồn.</p></div><span className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-500">{concepts.length} khái niệm</span></div>
        {concepts.length?<><ConceptGraph nodes={concepts} edges={workspace?.edges || []} selected={selected?.id || null} onSelect={selectConcept}/>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400"/><input aria-label="Tìm khái niệm" placeholder="Tìm BFS, DFS, hàng đợi…" value={query} onChange={e=>setQuery(e.target.value)} className="min-h-[44px] w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm"/></div><div className="flex flex-wrap gap-2">{matches.map(c=><button key={c.id} onClick={()=>selectConcept(c.id)} className={`min-h-[44px] rounded-lg border px-3 text-sm ${selected?.id===c.id?'border-blue-300 bg-blue-50 text-blue-700':'border-slate-200 text-slate-600'}`}>{c.label}</button>)}{matches.length===0&&<p className="text-sm text-slate-500">Không có khái niệm khớp tìm kiếm.</p>}</div>
          {selected&&<div className="space-y-3 border-t border-slate-100 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{selected.label}</h3><span className={`text-xs ${selected.verified?'text-emerald-700':'text-amber-700'}`}>{selected.verified?'Nguồn đã duyệt':'Chờ kiểm tra nguồn'}</span></div><p className="text-sm text-slate-500">{selected.description}</p><div className="flex flex-wrap gap-2">{sources.map(e=><button key={e.id} className={secondary} onClick={()=>selectEvidence(e)}><Clock className="h-3.5 w-3.5"/>{formatEvidenceLabel(e)}</button>)}</div><p className="text-xs leading-relaxed text-slate-500">{fact?.objective_ids.length?`Liên kết đã duyệt: ${fact.objective_ids.map(id=>id.toUpperCase()).join(', ')}`:'Chưa có liên kết CLO được giảng viên xác nhận.'} · {fact?.question_ids.length || 0} câu hỏi liên quan · {fact?.quiz.total?`${fact.quiz.correct}/${fact.quiz.total} câu trả lời đúng`:'Chưa có bài nộp cho kiến thức này'}</p></div>}
          <div className="border-t border-slate-100 pt-3"><h4 className="mb-2 text-sm font-semibold">Câu hỏi gắn với {selected?.label}</h4>{relatedQuestions.length?<ul className="space-y-2 text-sm text-slate-500">{relatedQuestions.map((q,i)=><li key={`${q.id}-${i}`}>{q.text}</li>)}</ul>:<p className="text-xs leading-relaxed text-slate-500">Chưa có câu hỏi cho kiến thức này trong phiên bản hiện tại.</p>}<button className="mt-2 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-blue-600" onClick={()=>setCurrentView('assessment')}>{role==='teacher'?'Soạn và kiểm tra câu hỏi':'Mở bài kiểm tra'}<ArrowRight className="h-4 w-4"/></button></div>
        </>:<div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><Network className="h-10 w-10 text-slate-300"/><h3 className="text-base font-semibold">Chưa có bản đồ kiến thức</h3><p className="max-w-sm text-sm leading-relaxed text-slate-500">{flow.hasSources?'Bắt đầu phân tích để tìm khái niệm và gắn với nguồn đã cung cấp.':'Tải video cùng phụ đề hoặc slide. Kết quả chỉ xuất hiện sau khi xử lý.'}</p></div>}
      </section>
    </div>
    <section className={`${card} p-5 sm:p-6`} id="clo-coverage"><div className="mb-3 flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Target className="h-5 w-5 text-blue-600"/>Đối chiếu chuẩn đầu ra</h2><p className="mt-2 text-sm text-slate-500">CLO là chuẩn đầu ra học phần. Đối chiếu bài giảng với kiến thức, kỹ năng sinh viên cần đạt.</p></div><span className="text-xs text-slate-400">Nguồn phiên bản {workspace?.lecture.version}</span></div>
      {research?.objectives.map(o=><ObjectiveRow key={`${currentLectureId}-${research.source_version}-${o.id}-${o.status}-${o.confirmed_concept_ids.join(',')}-${o.expected_concept_ids.join(',')}`} objective={o} research={research} canEdit={role==='teacher'&&(flow.reviewed||flow.published)} lectureId={currentLectureId!} refresh={refreshWorkspace}/>)}
      {!research&&<p className="py-4 text-sm text-slate-500">Đang chờ dữ liệu đối chiếu chuẩn đầu ra.</p>}
      <p className="border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">Liên kết đã xác nhận cho biết học liệu có nội dung phù hợp. Kết luận sinh viên đạt CLO cần bài đánh giá và tiêu chí riêng.</p>
    </section>
    <div className="grid gap-5 lg:grid-cols-2"><section className={`${card} p-5`}><h2 className="mb-4 text-base font-bold">Nội dung cần xem lại</h2>{research?.signals.length?<ul className="space-y-4">{research.signals.map(signal=><li key={signal.id} className="flex gap-3"><AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${signal.kind==='quiz_errors'?'text-rose-500':'text-amber-500'}`}/><div><p className="text-sm font-semibold">{signal.title}</p><p className="mt-1 text-xs leading-relaxed text-slate-500">{signal.description}</p>
                {signal.concept_id && concepts.some(c=>c.id===signal.concept_id) ? <button className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-blue-600" onClick={()=>{selectConcept(signal.concept_id!);document.getElementById('concept-panel-title')?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'center'});}}>Xem kiến thức và đoạn nguồn<ArrowRight className="h-3.5 w-3.5"/></button> : signal.kind==='missing_source' ? <button className="mt-1 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-blue-600" onClick={()=>setCurrentView('lectures')}>Bổ sung học liệu<ArrowRight className="h-3.5 w-3.5"/></button> : null}
              </div></li>)}</ul>:<p className="text-sm text-slate-500">Chưa có điểm cần rà soát từ dữ liệu hiện tại.</p>}</section>
      <section className={`${card} flex flex-col justify-between gap-5 bg-gradient-to-br from-white to-blue-50/40 p-5`}><div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-600">Simulation Studio</p><h2 className="text-xl font-bold">Nếu dành thêm 15 phút cho một chủ đề?</h2><p className="mt-3 text-sm leading-relaxed text-slate-500">Chọn nội dung trong kế hoạch đã duyệt. Hệ thống thử rút thời gian ở phần khác và kiểm tra giới hạn tổng thời lượng.</p><p className="mt-3 text-xs leading-relaxed text-slate-500">Phương án mới cần bạn duyệt. Chưa có mô hình dự đoán mức tăng điểm học tập.</p></div><div className="flex flex-wrap gap-2"><button className={primary} onClick={()=>setCurrentView('simulation')}><Sliders className="h-4 w-4"/>Thử điều chỉnh bài giảng<ArrowRight className="h-4 w-4"/></button><button className={secondary} onClick={()=>setCurrentView('twin')}><Layers className="h-4 w-4"/>Xem Lecture Twin</button></div></section></div>
    <details className={`${card} p-5`}><summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold"><span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-blue-600"/>AI đã làm gì và đang có giới hạn nào?</span><ChevronDown className="h-4 w-4"/></summary><div className="mt-4 grid gap-4 sm:grid-cols-2">{[
      ['Hiểu video','Đã đọc thông tin tệp; chưa có mô hình diễn giải bảng vẽ hoặc ví dụ code.'],
      ['Lời nói và slide','Đọc phụ đề, văn bản được cung cấp; chưa tự chép lời hoặc OCR ảnh.'],
      ['Lập bản đồ kiến thức','Tìm từ khóa BFS/DFS và gắn đoạn nguồn. Giảng viên xác nhận liên kết với CLO.'],
      ['Phân tích giảng dạy','Đối chiếu nguồn, tổng hợp bài làm và tính phương án thời lượng; chưa kết luận hiệu quả học tập.'],
    ].map(([title,description])=><div key={title}><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-2"><button className={secondary} onClick={()=>setCurrentView('agents')}>Xem các bước xử lý đã lưu</button><button className={secondary} onClick={()=>setCurrentView('assessment')}>Xem câu hỏi và bài làm</button></div></details>
    <ReviewModal isOpen={reviewOpen} onClose={()=>setReviewOpen(false)} onConfirm={review} pendingCount={flow.pendingCount} unsupportedCount={flow.unsupportedCount}/>
  </motion.div>;
}
