from contextlib import asynccontextmanager
from copy import deepcopy
import hashlib
import json
import os
import shutil
from urllib.parse import urlsplit
import re
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, Depends, HTTPException, Response, UploadFile, File, Form, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from . import store, domain, workflows
from .auth import current_user, require_role, lecture_access, public_user, password_valid, password_hash, issue, DEMO_MODE
from .fixtures import seed, sample_sources, new_lecture, AGENTS, PROVIDER_NOTE, SAMPLE_DATA_REVISION


def migrate_seeded_youtube_samples():
    """Refresh sample-backed demo lessons that still use the old 50s source fixture."""
    for lecture in store.items('lectures'):
        lecture_id = lecture.get('id')
        if not lecture_id or not lecture.get('sample_attached'):
            continue
        has_youtube_reference = any(asset.get('source_type') == 'youtube_reference' for asset in lecture.get('assets', []))
        has_youtube_notes = bool(lecture.get('transcript')) and all(
            row.get('source_type') == 'youtube_caption_annotation' for row in lecture.get('transcript', [])
        )
        sample_revision_matches = lecture.get('sample_data_revision') == SAMPLE_DATA_REVISION
        should_reopen_for_review = lecture_id != 'lec-published' and lecture.get('status') == 'published' and lecture.get('published_version') != lecture.get('version')
        if has_youtube_reference and has_youtube_notes and sample_revision_matches and not should_reopen_for_review:
            continue

        lecture['version'] = int(lecture.get('version', 1)) + 1
        sample_sources(lecture)
        lecture.update(analysis_version=None, concepts=[], edges=[], evidence=[], findings=[], coverage=[])
        domain.snapshot(lecture, 'youtube_source_updated', 'Thay ghi chú minh họa cũ bằng ghi chú có mốc theo video YouTube BFS/DFS.')

        if lecture_id == 'lec-published':
            workflows.extract_knowledge(lecture)
            workflows.verify_lecture(lecture)
            for evidence in lecture['evidence']:
                evidence['verified'] = bool(evidence['valid'])
            for concept in lecture['concepts']:
                concept['verified'] = True
            for finding in lecture['findings']:
                finding.update(status='confirmed' if finding['has_evidence'] else 'rejected',
                    note='Nội dung mẫu đã được biên soạn theo phụ đề video và chuẩn bị sẵn để trải nghiệm.')
            lecture.update(status='published', published_version=lecture['version'], analysis_version=lecture['version'])
            domain.snapshot(lecture, 'prepared_publication', 'Bản học liệu mẫu đã được cập nhật theo video YouTube và ghi chú có mốc.')
            lecture['published_payload'] = domain.publication_payload(lecture)
        else:
            lecture.update(status='draft', published_version=None)
            lecture.pop('published_payload', None)

        store.put('lectures', lecture)


@asynccontextmanager
async def lifespan(app):
    store.initialize()
    seed()
    migrate_seeded_youtube_samples()
    for job in store.items('jobs'):
        if job['status'] in ('running', 'queued'):
            job.update(status='paused', error='Server đã khởi động lại; tác vụ được giữ để người dùng tiếp tục.')
            workflows.save_job(job)
    public = store.get('lectures', 'lec-published')
    if public and not public['published_version']:
        workflows.extract_knowledge(public)
        workflows.verify_lecture(public)
        for e in public['evidence']: e['verified'] = e['valid']
        for c in public['concepts']: c['verified'] = True
        for f in public['findings']: f.update(status='confirmed' if f['has_evidence'] else 'rejected', note='Nội dung mẫu đã biên soạn và xác minh sẵn, không phải lượt duyệt của người dùng.')
        public.update(status='published', published_version=1, analysis_version=1)
        domain.snapshot(public, 'prepared_publication', 'Bản học liệu mẫu đã được chuẩn bị sẵn để học viên trải nghiệm')
        public['published_payload'] = domain.publication_payload(public)
        store.put('lectures', public)
    yield


app = FastAPI(title='LectureTwin-AI Demo API', version='0.1.0', lifespan=lifespan)
LOGIN_ATTEMPTS = {}


@app.middleware('http')
async def origin_guard(request, call_next):
    origin = request.headers.get('origin')
    same_origin = origin and urlsplit(origin).netloc == request.headers.get('host')
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and origin and not same_origin and origin not in ('http://127.0.0.1:5175', 'http://localhost:5175', 'http://127.0.0.1:8001'):
        return Response(content='Origin không được phép', status_code=403)
    return await call_next(request)


@app.get('/api/health')
def health():
    return {'service': 'LectureTwin-AI', 'status': 'healthy', 'mode': 'DEMO_FALLBACK', 'provider_note': PROVIDER_NOTE}


class Login(BaseModel):
    username: str
    password: str


@app.post('/api/auth/login')
def login(body: Login, response: Response, request: Request):
    key = request.client.host + ':' + body.username
    recent = [stamp for stamp in LOGIN_ATTEMPTS.get(key, []) if time.time() - stamp < 60]
    if len(recent) >= 10: raise HTTPException(429, 'Thử lại sau một phút')
    user = next((u for u in store.items('users') if u['username'] == body.username), None)
    if not user or not user['is_active'] or not password_valid(body.password, user['password_hash']):
        LOGIN_ATTEMPTS[key] = recent + [time.time()]
        raise HTTPException(401, 'Thông tin đăng nhập không hợp lệ')
    LOGIN_ATTEMPTS.pop(key, None)
    store.audit(user, 'LOGIN', 'Đăng nhập demo')
    return issue(user, response)


class DemoLogin(BaseModel):
    role: Literal['admin', 'teacher', 'student']


@app.post('/api/auth/demo-login')
def demo_login(body: DemoLogin, response: Response):
    if not DEMO_MODE: raise HTTPException(404)
    user = store.get('users', body.role)
    if not user['is_active']: raise HTTPException(403, 'Tài khoản demo đã bị vô hiệu hóa')
    store.audit(user, 'DEMO_LOGIN', 'Chọn vai trò trong chế độ demo')
    return issue(user, response)


@app.get('/api/auth/me')
def me(user=Depends(current_user)):
    return public_user(user)


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, user=Depends(current_user)):
    header = request.headers.get('authorization', '')
    token = header[7:] if header.startswith('Bearer ') else request.cookies.get('lt_session', '')
    store.delete_session(hashlib.sha256(token.encode()).hexdigest())
    response.delete_cookie('lt_session', path='/api')
    return {'message': 'Đã đăng xuất'}


@app.get('/api/bootstrap')
def bootstrap(user=Depends(current_user)):
    lectures = []
    for lecture in store.items('lectures'):
        try:
            lecture_access(user, lecture['id'])
            data = lecture.get('published_payload', {}) if user['role'] == 'student' else lecture
            if data: lectures.append(domain.summary(data))
        except HTTPException: pass
    courses = [c for c in store.items('courses') if user['role'] == 'admin' or c['id'] in user['course_ids']]
    jobs = store.items('jobs')
    if user['role'] != 'admin': jobs = [j for j in jobs if j['owner_id'] == user['id']]
    return {'user': public_user(user), 'mode': 'DEMO_FALLBACK', 'provider_note': PROVIDER_NOTE, 'courses': courses, 'lectures': lectures,
        'agents': AGENTS, 'system': {'active_jobs': sum(j['status'] in ('queued', 'running', 'paused', 'needs_review') for j in jobs),
        'completed_jobs': sum(j['status'] == 'completed' for j in jobs), 'failed_jobs': sum(j['status'] == 'failed' for j in jobs), 'model_calls': 0, 'tokens': None}}


class LectureCreate(BaseModel):
    title: str = Field(min_length=3, max_length=160)
    course_id: str
    objectives: list[str] = Field(min_length=1, max_length=8)
    total_minutes: int = Field(default=50, ge=15, le=180)


@app.post('/api/lectures')
def create_lecture(body: LectureCreate, user=Depends(current_user)):
    require_role(user, 'teacher')
    if body.course_id not in user['course_ids']: raise HTTPException(403, 'Không phụ trách học phần này')
    if any(not text.strip() for text in body.objectives): raise HTTPException(422, 'Mục tiêu học tập không được trống')
    lecture = new_lecture(store.uid('lec'), user['id'], body.course_id, body.title.strip(), body.objectives, body.total_minutes)
    store.put('lectures', lecture)
    domain.snapshot(lecture, 'created', 'Giảng viên tạo bản nháp và khai báo mục tiêu học tập')
    store.audit(user, 'CREATE_LECTURE', body.title, lecture['id'])
    return domain.summary(lecture)


@app.get('/api/lectures/{lid}')
def get_lecture(lid: str, user=Depends(current_user)):
    return domain.workspace(lecture_access(user, lid), user)


def ensure_editable(lecture):
    if lecture['status'] == 'published':
        raise HTTPException(409, 'Tạo bản nháp mới trước khi thay đổi học liệu đã xuất bản')
    if any(j['status'] in ('queued', 'running', 'paused', 'needs_review') and j['input']['version'] == lecture['version'] for j in store.items('jobs', lecture['id']) if j['workflow'] == 'analysis'):
        raise HTTPException(409, 'Dừng workflow đang mở trước khi đổi nguồn học liệu')


@app.post('/api/lectures/{lid}/sample')
def attach_sample(lid: str, user=Depends(current_user)):
    lecture = lecture_access(user, lid, edit=True)
    ensure_editable(lecture)
    sample_sources(lecture)
    lecture.update(analysis_version=None, concepts=[], edges=[], evidence=[], findings=[])
    domain.snapshot(lecture, 'sample_attached', 'Gắn video YouTube BFS/DFS và ghi chú tiếng Việt biên soạn theo phụ đề tự động; chưa chạy ASR/vision')
    store.audit(user, 'ATTACH_SAMPLE', 'Video YouTube Abdul Bari · BFS/DFS', lid)
    return domain.workspace(lecture, user)


@app.get('/api/lectures/{lid}/video')
def video(lid: str, user=Depends(current_user)):
    lecture = lecture_access(user, lid)
    data = lecture.get('published_payload', {}) if user['role'] == 'student' else lecture
    asset = next((a for a in data.get('assets', []) if a['kind'] == 'video' and a.get('source_type') != 'youtube_reference'), None)
    if not asset: raise HTTPException(404, 'Chưa có video')
    path = store.DATA / 'media' / Path(asset['path']).name
    if not store.restore_media(path): raise HTTPException(404, 'Không tìm thấy tệp video')
    return FileResponse(path, media_type='video/mp4', headers={'Cache-Control': 'private, no-store'})


def parse_transcript(path, duration):
    if path.suffix.lower() == '.json':
        data = json.loads(path.read_text())
        rows = data if isinstance(data, list) else data.get('segments', [])
    else:
        text = path.read_text(encoding='utf-8-sig')
        rows = []
        pattern = r'(?m)(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})\s*-->\s*(\d{1,2}:\d{2}(?::\d{2})?\.\d{3})[^\n]*\n([^\n]+(?:\n(?!\n)[^\n]+)*)'
        def seconds(stamp):
            result = 0
            for part in stamp.split(':'): result = result * 60 + float(part)
            return result
        for match in re.finditer(pattern, text): rows.append({'start': seconds(match[1]), 'end': seconds(match[2]), 'text': match[3]})
    if not rows: raise ValueError('Cần transcript JSON hoặc WebVTT có timestamp; tệp văn bản thuần không có mốc thời gian chưa được hỗ trợ')
    result = []
    for i, row in enumerate(rows[:2000]):
        start, end = float(row['start']), float(row['end'])
        if not 0 <= start < end or (duration and end > duration + .1): raise ValueError('Timestamp transcript vượt thời lượng hoặc không hợp lệ')
        text = str(row['text']).strip()
        if not text or len(text) > 10000: raise ValueError('Đoạn transcript không hợp lệ')
        result.append({'id': f'upload-tr-{i}', 'start': start, 'end': end, 'text': text, 'source_type': 'manual_uploaded_transcript'})
    return result


@app.post('/api/lectures/{lid}/assets')
async def upload(lid: str, file: UploadFile = File(...), kind: str = Form(...), user=Depends(current_user)):
    lecture = lecture_access(user, lid, edit=True)
    ensure_editable(lecture)
    suffix = Path(file.filename or '').suffix.lower()
    allowed = {'video': {'.mp4'}, 'slides': {'.pdf', '.pptx'}, 'transcript': {'.json', '.vtt', '.txt'}}
    if kind not in allowed or suffix not in allowed[kind]: raise HTTPException(422, 'Định dạng không được hỗ trợ cho loại học liệu này')
    limit_mb = 4 if os.environ.get('VERCEL') else 25
    payload = await file.read(limit_mb * 1024 * 1024 + 1)
    if len(payload) > limit_mb * 1024 * 1024: raise HTTPException(413, f'Giới hạn tệp demo là {limit_mb} MB')
    if not payload: raise HTTPException(422, 'Tệp rỗng')
    folder = store.DATA / 'media'
    folder.mkdir(parents=True, exist_ok=True)
    aid = store.uid('asset')
    path = folder / (aid + suffix)
    path.write_bytes(payload)
    asset = {'id': aid, 'kind': kind, 'name': Path(file.filename or 'upload').name[:160], 'path': path.name, 'status': 'ready', 'source_type': 'user_upload', 'notes': 'Dữ liệu tải lên được coi là nội dung, không phải chỉ dẫn cho tác nhân.'}
    try:
        if kind == 'video':
            if not shutil.which('ffprobe'):
                raise ValueError('Bản online dùng học liệu thực hành có sẵn. Tải và xử lý video riêng ở bản local có FFmpeg.')
            import subprocess
            report = subprocess.run(['ffprobe', '-v', 'quiet', '-show_format', '-of', 'json', str(path)], capture_output=True, text=True, timeout=20, check=True)
            asset['duration_seconds'] = float(json.loads(report.stdout)['format']['duration'])
            if not 0 < asset['duration_seconds'] <= 7200: raise ValueError('Video demo phải có thời lượng tối đa hai giờ')
            asset['url'] = f'/api/lectures/{lid}/video'
            # A different video cannot inherit prepared annotations from the old sample.
            lecture.update(sample_attached=False, transcript=[], slides=[], assets=[])
        elif kind == 'transcript':
            duration = next((a.get('duration_seconds') for a in lecture['assets'] if a['kind'] == 'video'), None)
            lecture['transcript'] = parse_transcript(path, duration)
            lecture['sample_attached'] = False
        else:
            if suffix == '.pdf':
                from pypdf import PdfReader
                reader = PdfReader(path)
                if len(reader.pages) > 100: raise ValueError('Tối đa 100 trang cho bản demo')
                lecture['slides'] = [{'page': i + 1, 'title': f'Trang {i+1}', 'text': (page.extract_text() or '')[:12000], 'start': None, 'end': None} for i, page in enumerate(reader.pages)]
            else:
                with zipfile.ZipFile(path) as archive:
                    names = sorted([n for n in archive.namelist() if re.fullmatch(r'ppt/slides/slide\d+\.xml', n)], key=lambda n: int(re.search(r'slide(\d+)', n)[1]))
                    if len(names) > 100 or sum(x.file_size for x in archive.infolist()) > 50 * 1024 * 1024: raise ValueError('Slide vượt giới hạn xử lý của demo')
                    lecture['slides'] = [{'page': i + 1, 'title': f'Slide {i+1}', 'text': ' '.join(e.text or '' for e in ET.fromstring(archive.read(name)).iter() if e.tag.endswith('}t'))[:12000], 'start': None, 'end': None} for i, name in enumerate(names)]
            lecture['sample_attached'] = False
            asset['notes'] += ' Trích xuất văn bản; chưa OCR trang ảnh và chưa căn chỉnh timestamp tự động.'
    except Exception as error:
        path.unlink(missing_ok=True)
        raise HTTPException(422, f'Không đọc được học liệu: {error}') from error
    store.save_media(path)
    lecture['assets'] = [a for a in lecture['assets'] if a['kind'] != kind] + [asset]
    lecture.update(analysis_version=None, concepts=[], edges=[], evidence=[], findings=[])
    domain.snapshot(lecture, 'asset_uploaded', f'Tải {kind}; chờ phân tích nguồn mới')
    store.audit(user, 'UPLOAD_ASSET', {'asset_id': aid, 'kind': kind}, lid)
    return domain.workspace(lecture, user)


@app.post('/api/lectures/{lid}/analyze')
def analyze(lid: str, user=Depends(current_user)):
    lecture = lecture_access(user, lid, edit=True)
    if not lecture['assets']: raise HTTPException(409, 'Cần video hoặc slide/transcript trước khi phân tích')
    return workflows.create_job(user, lecture, 'analysis')


def job_access(jid, user):
    job = store.get('jobs', jid)
    if not job: raise HTTPException(404, 'Không tìm thấy lượt chạy')
    if user['role'] == 'admin': return job
    lecture_access(user, job['lecture_id'])
    if job['owner_id'] != user['id']: raise HTTPException(403, 'Không được xem lượt chạy của người khác')
    return job


@app.get('/api/jobs/{jid}')
def get_job(jid: str, user=Depends(current_user)):
    job = job_access(jid, user)
    return domain.redacted_job(job) if user['role'] == 'admin' else job


@app.get('/api/lectures/{lid}/jobs')
def jobs(lid: str, user=Depends(current_user)):
    lecture_access(user, lid)
    return [domain.redacted_job(j) if user['role'] == 'admin' else j for j in store.items('jobs', lid) if user['role'] == 'admin' or j['owner_id'] == user['id']]


class Control(BaseModel):
    action: Literal['pause', 'resume', 'cancel', 'retry']


@app.post('/api/jobs/{jid}/control')
def control(jid: str, body: Control, user=Depends(current_user)):
    with store.LOCK:
        job = job_access(jid, user)
        if user['role'] == 'admin' and job['owner_id'] != user['id'] and body.action != 'cancel':
            raise HTTPException(403, 'Admin được hủy tác vụ, không thay giảng viên tiếp tục duyệt học thuật')
        if body.action == 'pause' and job['status'] in ('running', 'queued'): job['status'] = 'paused'
        elif body.action == 'cancel' and job['status'] in ('running', 'queued', 'paused', 'needs_review'):
            job.update(status='cancelled', finished_at=store.now())
        elif body.action in ('resume', 'retry') and job['status'] in ('paused', 'failed'):
            job['status'] = 'queued'
            old = [a for a in job['agents'] if a['status'] in ('running', 'failed', 'cancelled')]
            if old: job.setdefault('retry_history', []).append({'at': store.now(), 'agents': old})
            job['agents'] = [a for a in job['agents'] if a['status'] == 'completed']
        else: raise HTTPException(409, 'Trạng thái tác vụ không cho phép thao tác này; cổng duyệt cần giảng viên xác minh bằng chứng')
        workflows.save_job(job)
        store.audit(user, 'JOB_CONTROL', {'job_id': jid, 'action': body.action}, job['lecture_id'])
    if body.action in ('resume', 'retry'): workflows.schedule(jid)
    return store.get('jobs', jid)


def after_review(lecture):
    for concept in lecture['concepts']:
        ensure_reviewable(lecture)
        finding = next((f for f in lecture['findings'] if f['concept_id'] == concept['id']), None)
        concept['verified'] = bool(finding and finding['status'] == 'confirmed')
    for evidence in lecture['evidence']:
        evidence['verified'] = bool(evidence['valid'] and any(c['id'] == evidence['concept_id'] and c['verified'] for c in lecture['concepts']))
    # Rejected concepts are excluded from the publishable graph, rather than silently affirmed.
    rejected = {f['concept_id'] for f in lecture['findings'] if f['status'] == 'rejected'}
    if not any(f['status'] == 'pending' for f in lecture['findings']):
        lecture['concepts'] = [c for c in lecture['concepts'] if c['id'] not in rejected]
        ids = {c['id'] for c in lecture['concepts']}
        lecture['edges'] = [e for e in lecture['edges'] if e['source'] in ids and e['target'] in ids]
    domain.snapshot(lecture, 'teacher_review', 'Giảng viên quyết định đối với bằng chứng, giữ nguyên dấu vết nội dung bị loại')
    if not any(f['status'] == 'pending' for f in lecture['findings']):
        for job in store.items('jobs', lecture['id']):
            if job['workflow'] == 'analysis' and job['status'] == 'needs_review' and job['input']['version'] == lecture['version']:
                for agent in job['agents']:
                    if agent['agent'] == 'verification': agent.update(status='completed', handoff_to='pedagogical', teacher_reviewed_at=store.now())
                job['status'] = 'queued'
                workflows.save_job(job)
                workflows.schedule(job['id'])


class Decision(BaseModel):
    decision: Literal['confirm', 'reject']
    note: str = Field(default='', max_length=1000)


def ensure_reviewable(lecture):
    jobs = [j for j in store.items('jobs', lecture['id']) if j['workflow'] == 'analysis' and j['input']['version'] == lecture['version']]
    if not jobs or jobs[-1]['status'] != 'needs_review':
        raise HTTPException(409, 'Chờ workflow đến bước giảng viên xác minh trước khi quyết định')


@app.post('/api/lectures/{lid}/findings/{fid}/decision')
def review_finding(lid: str, fid: str, body: Decision, user=Depends(current_user)):
    with store.LOCK:
        lecture = lecture_access(user, lid, edit=True)
        finding = next((f for f in lecture['findings'] if f['id'] == fid), None)
        if not finding: raise HTTPException(404, 'Không tìm thấy nội dung cần xác minh')
        if finding['status'] != 'pending': raise HTTPException(409, 'Nội dung này đã được quyết định')
        if body.decision == 'confirm' and not finding['has_evidence']: raise HTTPException(422, 'Chưa có bằng chứng hợp lệ; hãy loại khỏi bản xuất bản hoặc bổ sung nguồn')
        if body.decision == 'reject' and len(body.note.strip()) < 3: raise HTTPException(422, 'Cần ghi lý do loại nội dung')
        finding.update(status='confirmed' if body.decision == 'confirm' else 'rejected', note=body.note.strip(), reviewed_by=user['id'])
        after_review(lecture)
        store.audit(user, 'REVIEW_FINDING', {'finding_id': fid, 'decision': body.decision}, lid)
    return domain.workspace(lecture, user)


class BulkReview(BaseModel):
    exclude_unsupported: Literal[True]
    note: str = Field(min_length=3, max_length=1000)


@app.post('/api/lectures/{lid}/review')
def bulk_review(lid: str, body: BulkReview, user=Depends(current_user)):
    with store.LOCK:
        lecture = lecture_access(user, lid, edit=True)
        ensure_reviewable(lecture)
        if len(body.note.strip()) < 3: raise HTTPException(422, 'Cần ghi nhận xét cụ thể cho quyết định kiểm duyệt')
        if not lecture['findings']: raise HTTPException(409, 'Chưa có kết quả phân tích')
        for finding in lecture['findings']:
            if finding['status'] == 'pending': finding.update(status='confirmed' if finding['has_evidence'] else 'rejected', note=body.note, reviewed_by=user['id'])
        after_review(lecture)
        store.audit(user, 'BULK_REVIEW', body.note, lid)
    return domain.workspace(lecture, user)


@app.post('/api/lectures/{lid}/publish')
def publish(lid: str, user=Depends(current_user)):
    with store.LOCK:
        lecture = lecture_access(user, lid, edit=True)
        result = domain.publish(lecture)
        store.audit(user, 'PUBLISH_LECTURE', {'version': lecture['version']}, lid)
        return result


@app.get('/api/lectures/{lid}/graph')
def graph(lid: str, q: str = '', user=Depends(current_user)):
    lecture = lecture_access(user, lid)
    data = lecture.get('published_payload', {}) if user['role'] == 'student' else lecture
    nodes = data.get('concepts', [])
    if q.strip(): nodes = [c for c in nodes if q.lower() in (c['label'] + ' ' + c['description']).lower()]
    ids = {c['id'] for c in nodes}
    return {'nodes': nodes, 'edges': [e for e in data.get('edges', []) if e['source'] in ids and e['target'] in ids],
        'evidence': [e for e in data.get('evidence', []) if e['concept_id'] in ids]}


class TutorQuestion(BaseModel):
    question: str = Field(min_length=2, max_length=1500)


@app.post('/api/lectures/{lid}/tutor')
def tutor(lid: str, body: TutorQuestion, user=Depends(current_user)):
    require_role(user, 'teacher', 'student')
    lecture = lecture_access(user, lid)
    if user['role'] == 'teacher' and not any(c.get('verified') for c in lecture['concepts']): raise HTTPException(409, 'Cần nguồn đã xác minh trước khi hỏi trợ lý')
    return workflows.create_job(user, lecture, 'tutor', {'question': body.question})


@app.post('/api/lectures/{lid}/assessments/generate')
def generate_assessment(lid: str, user=Depends(current_user)):
    return workflows.create_job(user, lecture_access(user, lid, edit=True), 'assessment')


def assessment_access(aid, user, edit=False):
    assessment = store.get('assessments', aid)
    if not assessment: raise HTTPException(404, 'Không tìm thấy bài kiểm tra')
    lecture = lecture_access(user, assessment['lecture_id'], edit=edit)
    if user['role'] == 'student' and (assessment['status'] != 'published' or assessment['version'] != lecture['published_version']): raise HTTPException(403, 'Bài kiểm tra chưa được giao')
    return assessment, lecture


class AssessmentEdit(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    questions: list[dict] | None = None


def validate_questions(questions, lecture):
    if not 1 <= len(questions) <= 12: raise HTTPException(422, 'Cần từ 1 đến 12 câu hỏi')
    ids = set()
    valid_sources = {e['id'] for e in lecture['evidence'] if e.get('verified') and e['valid']}
    for question in questions:
        try:
            choices = question['options']
            option_ids = {o['id'] for o in choices}
            valid = (question['id'] not in ids and str(question['text']).strip() and 2 <= len(choices) <= 6 and len(option_ids) == len(choices)
                and question['correct_option_id'] in option_ids and question['evidence_id'] in valid_sources and all(str(o['text']).strip() for o in choices))
        except (KeyError, TypeError): valid = False
        if not valid: raise HTTPException(422, 'Câu hỏi cần mã duy nhất, các lựa chọn, đáp án đúng và nguồn đã xác minh')
        ids.add(question['id'])


@app.patch('/api/assessments/{aid}')
def edit_assessment(aid: str, body: AssessmentEdit, user=Depends(current_user)):
    assessment, lecture = assessment_access(aid, user, edit=True)
    if assessment['status'] != 'draft': raise HTTPException(409, 'Bài kiểm tra đã xuất bản không thể sửa trực tiếp')
    if body.questions is not None:
        validate_questions(body.questions, lecture)
        assessment['questions'] = body.questions
    if body.title: assessment['title'] = body.title
    store.put('assessments', assessment)
    return assessment


@app.post('/api/assessments/{aid}/publish')
def publish_assessment(aid: str, user=Depends(current_user)):
    assessment, lecture = assessment_access(aid, user, edit=True)
    if lecture['published_version'] != assessment['version']: raise HTTPException(409, 'Xuất bản phiên bản bài giảng tương ứng trước khi giao bài kiểm tra')
    validate_questions(assessment['questions'], lecture)
    assessment.update(status='published', approved_by=user['id'])
    store.put('assessments', assessment)
    store.audit(user, 'PUBLISH_ASSESSMENT', aid, lecture['id'])
    return assessment


class Submission(BaseModel):
    answers: dict[str, str]


@app.post('/api/assessments/{aid}/submit')
def submit(aid: str, body: Submission, user=Depends(current_user)):
    require_role(user, 'student')
    assessment, lecture = assessment_access(aid, user)
    if set(body.answers) != {q['id'] for q in assessment['questions']}: raise HTTPException(422, 'Cần trả lời đầy đủ các câu hỏi')
    feedback = []
    for q in assessment['questions']:
        answer = body.answers[q['id']]
        if answer not in {o['id'] for o in q['options']}: raise HTTPException(422, 'Lựa chọn không hợp lệ')
        feedback.append({'question_id': q['id'], 'concept_id': q['concept_id'], 'correct': answer == q['correct_option_id'],
            'explanation': q.get('explanation', 'Xem lại đoạn nguồn tương ứng.'), 'evidence_id': q['evidence_id']})
    correct = sum(f['correct'] for f in feedback)
    result = {'id': store.uid('attempt'), 'assessment_id': aid, 'lecture_id': lecture['id'], 'owner_id': user['id'], 'answers': body.answers,
        'correct_count': correct, 'total': len(feedback), 'score': round(correct / len(feedback) * 100, 1), 'feedback': feedback, 'submitted_at': store.now()}
    store.put('attempts', result)
    domain.snapshot(lecture, 'evaluated', 'Có bài nộp mới; tổng hợp kết quả được tính từ bài làm đã lưu')
    store.audit(user, 'SUBMIT_ASSESSMENT', {'assessment_id': aid, 'attempt_id': result['id']}, lecture['id'])
    return result


@app.get('/api/lectures/{lid}/analytics')
def get_analytics(lid: str, user=Depends(current_user)):
    require_role(user, 'teacher', 'student')
    lecture_access(user, lid)
    return domain.analytics(lid, user)


class ScenarioRequest(BaseModel):
    title: str = Field(default='Tăng thời gian thực hành DFS', max_length=160)
    request: str = Field(min_length=3, max_length=1200)
    add_practice_minutes: int = Field(default=10, ge=1, le=60)
    total_limit: int = Field(default=50, ge=15, le=180)


@app.post('/api/lectures/{lid}/scenarios')
def scenario(lid: str, body: ScenarioRequest, user=Depends(current_user)):
    return workflows.create_job(user, lecture_access(user, lid, edit=True), 'planning', body.model_dump())


@app.post('/api/scenarios/{sid}/create-version')
def scenario_version(sid: str, user=Depends(current_user)):
    with store.LOCK:
        scenario = store.get('scenarios', sid)
        if not scenario: raise HTTPException(404, 'Không tìm thấy kịch bản')
        lecture = lecture_access(user, scenario['lecture_id'], edit=True)
        if scenario['base_version'] != lecture['version']: raise HTTPException(409, 'Kịch bản thuộc phiên bản cũ; cần chạy lại trước khi áp dụng')
        if not scenario['comparison']['feasible']: raise HTTPException(409, 'Kịch bản chưa đáp ứng ràng buộc')
        if any(j['status'] in ('running', 'queued', 'paused', 'needs_review') for j in store.items('jobs', lecture['id'])): raise HTTPException(409, 'Hoàn tất hoặc hủy tác vụ trước khi tạo phiên bản')
        lecture['version'] += 1
        lecture.update(status='draft_changes', analysis_version=None)
        lecture['planned']['segments'] = deepcopy(scenario['segments'])
        lecture['planned']['total_minutes'] = scenario['comparison']['scenario_total']
        lecture['total_minutes'] = lecture['planned']['total_minutes']
        domain.snapshot(lecture, 'scenario_draft_version', 'Tạo bản nháp mới; snapshot đã xuất bản không thay đổi')
        store.audit(user, 'CREATE_SCENARIO_VERSION', sid, lecture['id'])
        return domain.summary(lecture)


class Progress(BaseModel):
    position_seconds: float = Field(ge=0)
    completed: bool = False


@app.post('/api/lectures/{lid}/progress')
def progress(lid: str, body: Progress, user=Depends(current_user)):
    require_role(user, 'student')
    lecture = lecture_access(user, lid)
    duration = next((a.get('duration_seconds', 0) for a in lecture['published_payload']['assets'] if a['kind'] == 'video'), 0)
    if body.position_seconds > duration + 1: raise HTTPException(422, 'Vị trí vượt thời lượng video')
    entry = store.get('progress', f"{user['id']}:{lid}") or {'id': f"{user['id']}:{lid}", 'owner_id': user['id'], 'lecture_id': lid, 'bookmarks': []}
    entry.update(position_seconds=body.position_seconds, completed=entry.get('completed', False) or (body.completed and body.position_seconds >= duration * .9))
    store.put('progress', entry)
    return entry


class Bookmark(BaseModel):
    seconds: float = Field(ge=0)
    label: str = Field(min_length=1, max_length=160)


@app.post('/api/lectures/{lid}/bookmarks')
def bookmark(lid: str, body: Bookmark, user=Depends(current_user)):
    require_role(user, 'student')
    lecture = lecture_access(user, lid)
    duration = next((a.get('duration_seconds', 0) for a in lecture['published_payload']['assets'] if a['kind'] == 'video'), 0)
    if body.seconds > duration: raise HTTPException(422, 'Mốc lưu vượt thời lượng video')
    entry = store.get('progress', f"{user['id']}:{lid}") or {'id': f"{user['id']}:{lid}", 'owner_id': user['id'], 'lecture_id': lid, 'position_seconds': 0, 'completed': False, 'bookmarks': []}
    entry['bookmarks'].append({'id': store.uid('bookmark'), 'seconds': body.seconds, 'label': body.label})
    store.put('progress', entry)
    return entry


@app.get('/api/admin/users')
def users(user=Depends(current_user)):
    require_role(user, 'admin')
    return [public_user(u) for u in store.items('users')]


class UserCreate(BaseModel):
    username: str = Field(pattern=r'^[a-zA-Z0-9_-]{3,40}$')
    full_name: str = Field(min_length=2, max_length=100)
    role: Literal['admin', 'teacher', 'student']
    password: str = Field(min_length=6, max_length=120)
    course_ids: list[str] = []


@app.post('/api/admin/users')
def add_user(body: UserCreate, user=Depends(current_user)):
    require_role(user, 'admin')
    if any(u['username'] == body.username for u in store.items('users')): raise HTTPException(409, 'Tên tài khoản đã tồn tại')
    if any(not store.get('courses', cid) for cid in body.course_ids): raise HTTPException(422, 'Học phần không tồn tại')
    value = {'id': store.uid('user'), 'username': body.username, 'full_name': body.full_name, 'role': body.role, 'course_ids': body.course_ids, 'is_active': True, 'password_hash': password_hash(body.password)}
    store.put('users', value)
    store.audit(user, 'CREATE_USER', value['id'])
    return public_user(value)


class UserEdit(BaseModel):
    is_active: bool | None = None
    course_ids: list[str] | None = None


@app.patch('/api/admin/users/{uid}')
def edit_user(uid: str, body: UserEdit, user=Depends(current_user)):
    require_role(user, 'admin')
    value = store.get('users', uid)
    if not value: raise HTTPException(404, 'Không tìm thấy tài khoản')
    if body.is_active is False and uid == user['id']: raise HTTPException(409, 'Không tự vô hiệu hóa tài khoản đang sử dụng')
    if body.course_ids is not None:
        if any(not store.get('courses', cid) for cid in body.course_ids): raise HTTPException(422, 'Học phần không tồn tại')
        value['course_ids'] = body.course_ids
    if body.is_active is not None: value['is_active'] = body.is_active
    store.put('users', value)
    store.audit(user, 'UPDATE_USER', uid)
    return public_user(value)


@app.get('/api/admin/monitoring')
def admin_monitoring(user=Depends(current_user)):
    require_role(user, 'admin')
    jobs = store.items('jobs')
    agents = [a for j in jobs for a in j['agents']]
    return {'jobs': [domain.redacted_job(j) for j in reversed(jobs)], 'audit': list(reversed(store.items('audit')[-100:])), 'agents': AGENTS,
        'metrics': {'active_jobs': sum(j['status'] in ('queued', 'running', 'paused', 'needs_review') for j in jobs),
            'completed_jobs': sum(j['status'] == 'completed' for j in jobs), 'failed_jobs': sum(j['status'] == 'failed' for j in jobs),
            'model_calls': 0, 'tokens': None, 'tool_calls': sum(len(a['tools']) for a in agents), 'total_latency_ms': round(sum(a['duration_ms'] for a in agents), 1)},
        'provider_note': PROVIDER_NOTE}


@app.get('/api/lectures/{lid}/frames/{filename}')
def frame(lid: str, filename: str, user=Depends(current_user)):
    lecture = lecture_access(user, lid)
    if not re.fullmatch(r'v\d+-\d+\.jpg', filename): raise HTTPException(404, 'Không tìm thấy khung hình')
    if user['role'] == 'student' and not filename.startswith(f"v{lecture['published_version']}-"): raise HTTPException(403, 'Khung hình chưa xuất bản')
    path = store.DATA / 'frames' / lid / filename
    if not path.is_file(): raise HTTPException(404, 'Khung hình chưa được trích xuất')
    return FileResponse(path, media_type='image/jpeg', headers={'Cache-Control': 'private, no-store'})


class LectureEdit(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=160)
    objectives: list[str] | None = Field(default=None, min_length=1, max_length=8)


@app.patch('/api/lectures/{lid}')
def update_lecture(lid: str, body: LectureEdit, user=Depends(current_user)):
    lecture = lecture_access(user, lid, edit=True)
    ensure_editable(lecture)
    if body.title: lecture['title'] = body.title.strip()
    if body.objectives is not None:
        if any(not text.strip() for text in body.objectives): raise HTTPException(422, 'Mục tiêu không được để trống')
        lecture['objectives'] = [text.strip() for text in body.objectives]
        lecture['planned']['objectives'] = lecture['objectives']
        lecture['analysis_version'] = None
    domain.snapshot(lecture, 'draft_edited', 'Giảng viên cập nhật bản nháp')
    return domain.summary(lecture)


class ConceptEdit(BaseModel):
    label: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=3, max_length=1000)


@app.patch('/api/lectures/{lid}/concepts/{cid}')
def edit_concept(lid: str, cid: str, body: ConceptEdit, user=Depends(current_user)):
    lecture = lecture_access(user, lid, edit=True)
    ensure_reviewable(lecture)
    concept = next((c for c in lecture['concepts'] if c['id'] == cid), None)
    if not concept: raise HTTPException(404, 'Không tìm thấy khái niệm')
    concept.update(label=body.label, description=body.description, verified=False, edited_by=user['id'])
    finding = next(f for f in lecture['findings'] if f['concept_id'] == cid)
    finding.update(status='pending', note='Giảng viên chỉnh sửa nội dung; cần xác nhận lại với nguồn.')
    domain.snapshot(lecture, 'concept_edited', f'Đã sửa khái niệm {cid}; chưa tự xác nhận')
    store.audit(user, 'EDIT_CONCEPT', cid, lid)
    return domain.workspace(lecture, user)
