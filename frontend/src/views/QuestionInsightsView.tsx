import { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, MessageCircle, RefreshCw, Upload } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../api';
import { VideoPlayer } from '../components/VideoPlayer';
import { SimulationView } from './SimulationView';
import { ResearchWorkspaceView } from './ResearchWorkspaceView';
import { formatEvidenceLabel, lessonWorkflow } from '../presentation';

type Level = {id:string;label:string;hint:string};
type Question = {id:string;question:string;asked_at:string;levels:string[];topics:string[];ideas:{text:string;levels:string[];topics:string[];reasons:string[]}[]};
type Report = {version:number;versions:number[];levels:Level[];questions:Question[];topics:{id:string;label:string;count:number}[];total:number;unclassified:number;limitations:string};
const control='min-h-[44px] min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus-visible:ring-2 focus-visible:ring-blue-600';
const names:Record<string,string>={recall:'Hỏi khái niệm',explain:'Cần giải thích',apply:'Muốn làm thử'};
const positions=[[180,61],[74,220],[122,135],[286,220],[238,135],[180,254],[180,188]];

export function QuestionInsightsView(){
 const {currentLectureId,bootstrap,workspace,selectLecture,seekVideoTo,videoSeekTarget,clearVideoSeek,setCurrentView}=useApp();
 const [data,setData]=useState<Report|null>(null),[version,setVersion]=useState('');
 const [topic,setTopic]=useState(''),[region,setRegion]=useState('all');
 const [error,setError]=useState(''),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 const [materialsOpen,setMaterialsOpen]=useState(false),[focusedQuestion,setFocusedQuestion]=useState<string|null>(null);
 const flow=lessonWorkflow(workspace);
 useEffect(()=>{setMaterialsOpen(!flow.reviewed&&!flow.published);},[currentLectureId,flow.reviewed,flow.published]);
 useEffect(()=>{setData(null);setVersion('');setTopic('');setRegion('all');setFocusedQuestion(null);},[currentLectureId]);
 useEffect(()=>{
  if(!currentLectureId)return;
  let cancelled=false;setLoading(true);setError('');
  api.questionInsights<Report>(currentLectureId,version).then(r=>{
   if(!cancelled){setData(r);setTopic(previous=>previous || r.topics.filter(t=>t.count>0).sort((a,b)=>b.count-a.count)[0]?.id || '');}
  }).catch(e=>{if(!cancelled){setData(null);setError(e.message);}}).finally(()=>{if(!cancelled)setLoading(false);});
  return()=>{cancelled=true;};
 },[currentLectureId,version,reload]);
 const levels=data?.levels||[];
 const rows=(data?.questions||[]).filter(q=>!topic||q.topics.includes(topic));
 const groups=Array.from({length:7},(_,i)=>{
  const ids=levels.filter((_,bit)=>(i+1)&(1<<bit)).map(l=>l.id);
  return {key:String(i+1),label:ids.map(id=>names[id]).join(' + '),rows:rows.filter(q=>q.levels.length===ids.length&&ids.every(id=>q.levels.includes(id)))};
 });
 const visible=region==='all'?rows:region==='unknown'?rows.filter(q=>!q.levels.length):groups.find(g=>g.key===region)?.rows||[];
 const topicName=data?.topics.find(t=>t.id===topic)?.label || 'bài giảng';
 const sameVersion=!data || data.version===workspace?.lecture.version;
 const relatedEvidence=sameVersion?workspace?.evidence.filter(e=>e.valid&&e.concept_id===topic)||[]:[];
 const preferredId=workspace?.research?.concepts.find(c=>c.concept_id===topic)?.evidence_ids[0];
 const evidence=relatedEvidence.find(e=>e.id===preferredId)||relatedEvidence[0]||null;
 useEffect(()=>{if(sameVersion&&evidence?.start!=null)seekVideoTo(evidence.start);},[evidence?.id,sameVersion,seekVideoTo]);
 const hasVideo=workspace?.assets.some(a=>a.kind==='video');
 const note=topic&&rows.length?`Dành thêm thời gian cho ${topicName}: ${rows.length} câu hỏi của học viên ở phiên bản ${data?.version}.`:'';
 const chooseTopic=(id:string)=>{setTopic(id);setRegion('all');setFocusedQuestion(null);};
 const openSource=(q:Question)=>{
  const id=q.topics.includes(topic)?topic:q.topics.find(id=>workspace?.concepts.some(c=>c.id===id));
  if(!sameVersion||!id)return;
  setTopic(id);setFocusedQuestion(q.id);
  const preferred=workspace?.research?.concepts.find(c=>c.concept_id===id)?.evidence_ids[0];
  const source=workspace?.evidence.find(e=>e.valid&&e.id===preferred)||workspace?.evidence.find(e=>e.valid&&e.concept_id===id);
  if(source?.start!=null)seekVideoTo(source.start);
 };
 return <div className="space-y-5 pb-10">
  <header className="flex flex-wrap items-center justify-between gap-4">
   <div><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Điều chỉnh bài dạy</h1><p className="mt-1.5 text-sm text-slate-500">Từ câu hỏi của lớp, xem lại bài giảng và chuẩn bị cho lần dạy tới.</p></div>
   <div className="flex min-w-0 max-w-full flex-wrap gap-2">
    <label className="sr-only" htmlFor="teaching-lecture">Chọn bài giảng</label>
    <select id="teaching-lecture" className={`${control} max-w-full sm:max-w-[300px]`} value={currentLectureId||''} onChange={e=>selectLecture(e.target.value)}>{bootstrap?.lectures.map(l=><option key={l.id} value={l.id}>{l.title}</option>)}</select>
    <button className={control} onClick={()=>setCurrentView('lectures')} aria-label="Thêm học liệu"><Upload size={17}/></button>
   </div>
  </header>
  {error&&<p role="alert" className="rounded-lg bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
  {!sameVersion&&<p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">Các câu hỏi này thuộc phiên bản {data?.version}. Bài đang chỉnh sửa là phiên bản {workspace?.lecture.version}; hãy đối chiếu riêng trước khi thay đổi bài dạy.</p>}
  <div className="grid min-w-0 items-start gap-4 xl:grid-cols-[190px_minmax(0,1fr)_310px]">
   <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 xl:sticky xl:top-4">
    <div className="flex items-center justify-between gap-2 px-2 py-2"><h2 className="text-sm font-bold">Lớp đang hỏi gì?</h2><button disabled={loading} onClick={()=>setReload(n=>n+1)} aria-label="Cập nhật câu hỏi" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50"><RefreshCw size={16}/></button></div>
    <nav aria-label="Chủ đề câu hỏi" className="flex gap-1 overflow-x-auto xl:flex-col">
     <button onClick={()=>chooseTopic('')} aria-pressed={!topic} className={`flex min-h-[48px] shrink-0 items-center justify-between gap-4 rounded-lg px-3 text-left text-sm ${!topic?'bg-blue-50 font-semibold text-blue-700':'text-slate-600 hover:bg-slate-50'}`}><span>Tất cả câu hỏi</span><span className="tabular-nums">{loading?'…':data?.total||0}</span></button>
     {data?.topics.filter(t=>t.count>0).map(t=><button key={t.id} onClick={()=>chooseTopic(t.id)} aria-pressed={topic===t.id} className={`flex min-h-[48px] shrink-0 items-center justify-between gap-4 rounded-lg px-3 text-left text-sm ${topic===t.id?'bg-blue-50 font-semibold text-blue-700':'text-slate-600 hover:bg-slate-50'}`}><span>{t.label}</span><span className="tabular-nums">{t.count}</span></button>)}
    </nav>
    <div className="mt-3 border-t border-slate-100 px-2 pt-3"><label className="grid gap-1.5 text-xs text-slate-500">Câu hỏi từ phiên bản<select className={`${control} w-full`} disabled={!data||loading} value={version||data?.version||''} onChange={e=>{setVersion(e.target.value);chooseTopic('');}}>{data?.versions.map(v=><option key={v} value={v}>Phiên bản {v}</option>)}</select></label></div>
   </aside>
   <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-label="Câu hỏi và bài giảng">
    <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-base font-bold">{topic?`Những thắc mắc về ${topicName}`:'Những điều lớp đang thắc mắc'}</h2><p className="mt-1 text-xs text-slate-500">{loading?'Đang cập nhật…':`${rows.length} câu hỏi đã gửi${rows.some(q=>!q.levels.length)?` · ${rows.filter(q=>!q.levels.length).length} câu cần đọc thêm để phân nhóm`:''}`}</p></div>
    {!loading&&!data?.total?<div className="space-y-3 px-5 py-10 text-center"><MessageCircle className="mx-auto text-blue-500"/><h3 className="font-semibold">Lớp chưa gửi câu hỏi</h3><p className="mx-auto max-w-md text-sm leading-relaxed text-slate-500">Câu hỏi ở phần hỏi đáp của học viên sẽ xuất hiện tại đây. Bạn vẫn có thể xem và chuẩn bị bài giảng bên dưới.</p></div>:<div className="grid min-w-0 gap-4 p-5 md:grid-cols-[minmax(190px,.8fr)_minmax(0,1.2fr)]">
     <div className="min-w-0">
      <svg viewBox="0 0 360 315" className="mx-auto w-full max-w-[230px]" role="group" aria-label="Biểu đồ các kiểu câu hỏi"><circle cx="180" cy="117" r="90" fill="#10b981" fillOpacity=".22" stroke="#059669"/><circle cx="130" cy="200" r="90" fill="#0284c7" fillOpacity=".22" stroke="#0284c7"/><circle cx="230" cy="200" r="90" fill="#06b6d4" fillOpacity=".22" stroke="#0891b2"/>{groups.map((g,i)=><g key={g.key} role="button" tabIndex={0} aria-label={`${g.label}: ${g.rows.length} câu hỏi`} aria-pressed={region===g.key} onClick={()=>setRegion(g.key)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setRegion(g.key);}}} className="cursor-pointer outline-blue-600"><circle cx={positions[i][0]} cy={positions[i][1]} r="19" fill={region===g.key?'#2959ea':'white'}/><text x={positions[i][0]} y={positions[i][1]+5} textAnchor="middle" fontSize="16" fontWeight="700" fill={region===g.key?'white':'#12213b'}>{g.rows.length}</text></g>)}</svg>
      <div className="space-y-1.5 text-xs">{levels.map((l,i)=><div key={l.id} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{background:['#059669','#0284c7','#0891b2'][i]}}/>{names[l.id]}</div>)}</div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Vùng giao là câu hỏi có nhiều ý. Số câu được đếm theo từng vùng, không theo diện tích.</p>
     </div>
     <div className="min-w-0 space-y-3">
      <label className="sr-only" htmlFor="question-group">Nhóm câu hỏi</label><select id="question-group" className={`${control} w-full text-xs`} value={region} onChange={e=>setRegion(e.target.value)}><option value="all">Tất cả câu hỏi ({rows.length})</option>{groups.map(g=><option key={g.key} value={g.key}>{g.label} ({g.rows.length})</option>)}<option value="unknown">Cần đọc thêm ({rows.filter(q=>!q.levels.length).length})</option></select>
      <div className="max-h-[260px] space-y-3 overflow-y-auto pr-1">{visible.map(q=><article key={q.id} className={`rounded-lg border p-3 ${focusedQuestion===q.id?'border-blue-300 bg-blue-50/40':'border-slate-200'}`}><p className="break-words text-sm font-semibold leading-relaxed">“{q.question}”</p><div className="mt-2 flex flex-wrap gap-1.5">{q.levels.map(id=><span key={id} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{names[id]}</span>)}</div><button disabled={!sameVersion||!q.topics.some(id=>workspace?.evidence.some(e=>e.valid&&e.concept_id===id))} onClick={()=>openSource(q)} className="mt-2 inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-blue-600 disabled:text-slate-400">Xem đoạn giảng<ArrowRight size={13}/></button><details className="text-xs text-slate-500"><summary className="cursor-pointer py-2">Xem các ý trong câu hỏi</summary>{q.ideas.map((idea,i)=><p key={i} className="py-1 leading-relaxed">{idea.text} · {idea.levels.map(id=>names[id]).join(', ')||'Cần đọc thêm'}</p>)}</details></article>)}{!visible.length&&<p className="py-5 text-sm text-slate-500">Không có câu hỏi trong nhóm này.</p>}</div>
     </div>
    </div>}
    <div className="border-t border-slate-200 p-5" id="teaching-source"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-bold">Đoạn giảng liên quan{topic?` · ${topicName}`:''}</h2>{evidence&&<button className="min-h-[44px] text-xs font-semibold text-blue-600" onClick={()=>{if(evidence.start!=null)seekVideoTo(evidence.start);}}>{formatEvidenceLabel(evidence)}</button>}</div>
     <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]"><div className="min-w-0">{sameVersion&&hasVideo?<VideoPlayer lectureId={currentLectureId} variant="embedded" seekTarget={videoSeekTarget} onClearSeekTarget={clearVideoSeek} sampleAttached={workspace?.lecture.sample_attached} selectedEvidence={evidence} defaultEvidence={null}/>:<p className="rounded-lg bg-slate-50 p-5 text-sm text-slate-500">{!sameVersion?'Nguồn đang chỉnh sửa thuộc phiên bản khác với các câu hỏi.':'Chưa có video. Thêm học liệu để bắt đầu chuẩn bị bài.'}</p>}</div><div className="min-w-0">
     <p className="mt-3 text-xs leading-relaxed text-slate-500">{evidence?.text||'Chọn một chủ đề hoặc câu hỏi để tìm đoạn giảng tương ứng. Liên kết theo chủ đề, chưa xác định chính xác nguyên nhân của từng thắc mắc.'}</p>
     <button className="mt-2 min-h-[44px] text-xs font-semibold text-blue-600" onClick={()=>{setMaterialsOpen(true);document.getElementById('teaching-materials')?.scrollIntoView({block:'start',behavior:'auto'});}}>Xem kiến thức và mục tiêu bài học</button></div></div>
    </div>
   </section>
   <aside className="min-w-0 space-y-5 rounded-xl border border-slate-200 bg-white p-5">
    <div><h2 className="text-base font-bold">Chuẩn bị cho lần dạy tới</h2><p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm leading-relaxed text-slate-600">{rows.length?`${rows.length} câu hỏi${topic?` nhắc đến ${topicName}`:''}. ${rows.some(q=>q.levels.includes('apply'))?'Có yêu cầu làm thử; bạn có thể thêm một ví dụ có hướng dẫn.':rows.some(q=>q.levels.includes('explain'))?'Có yêu cầu giải thích; bạn có thể minh họa lại từng bước.':'Bạn có thể nhắc lại khái niệm và kiểm tra bằng một câu hỏi ngắn.'}`:'Chưa có câu hỏi để gợi ý thay đổi. Bạn có thể thử phân bổ thời gian dựa trên kế hoạch hiện tại.'}</p></div>
    <SimulationView embedded conceptId={sameVersion?topic:undefined} questionNote={sameVersion?note:undefined} disabled={!sameVersion}/>
   </aside>
  </div>
  <details id="teaching-materials" open={materialsOpen} onToggle={e=>setMaterialsOpen(e.currentTarget.open)} className="rounded-xl border border-slate-200 bg-white p-5"><summary className="flex min-h-[44px] cursor-pointer items-center justify-between text-sm font-semibold">Nội dung, mục tiêu và duyệt bài giảng<ChevronDown size={16}/></summary><div className="mt-4">{materialsOpen&&<ResearchWorkspaceView embedded onConceptSelect={chooseTopic} focusConceptId={topic}/>}</div></details>
  <details className="rounded-xl border border-slate-200 bg-white px-5 py-2"><summary className="flex min-h-[44px] cursor-pointer items-center justify-between text-sm font-medium text-slate-600">Nguồn dữ liệu và cách tổng hợp<ChevronDown size={16}/></summary><p className="pb-4 text-xs leading-relaxed text-slate-500">Chỉ lấy câu hỏi học viên gửi ở phần hỏi đáp, không dùng câu trả lời của trợ lý, điểm kiểm tra hay lịch sử xem video. Bản demo phân nhóm bằng từ khóa, chưa gọi mô hình AI. Câu hỏi giúp gợi ý nội dung nên xem lại, không xác định năng lực học viên hoặc hiệu quả giảng dạy. Giảng viên quyết định nội dung và duyệt bản nháp trước khi phát hành.</p></details>
 </div>;
}
