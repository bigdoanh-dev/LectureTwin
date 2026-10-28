from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
import json
import os
import subprocess
import time
from pathlib import Path
from pydantic import BaseModel, Field
from . import store, domain
from .fixtures import AGENTS, CONCEPTS, EDGES

POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix='lecture-agent')
SCHEDULED = set()


class AgentInput(BaseModel):
    lecture_id: str
    version: int
    task: dict = Field(default_factory=dict)


class AgentOutput(BaseModel):
    agent: str
    result: dict
    evidence_ids: list[str] = Field(default_factory=list)
    mode: str = 'rule_based'


class Cancelled(Exception):
    pass


def save_job(job):
    store.put('jobs', job)


def boundary(job_id):
    job = store.get('jobs', job_id)
    if job['status'] == 'cancelled':
        raise Cancelled()
    return job['status'] == 'paused'


def run_tool(agent, name, data, function):
    allowed = next(a['tools'] for a in AGENTS if a['id'] == agent['agent'])
    if name not in allowed:
        raise ValueError('Tool không thuộc quyền của tác nhân')
    started = time.perf_counter()
    call = {'name': name, 'input': data, 'status': 'running', 'output': None, 'duration_ms': 0}
    agent['tools'].append(call)
    try:
        output = function()
        call.update(status='completed', output=output)
        return output
    except Exception as error:
        call.update(status='failed', error=str(error))
        raise
    finally:
        call['duration_ms'] = round((time.perf_counter() - started) * 1000, 2)


def media_probe(lecture):
    asset = next((a for a in lecture['assets'] if a['kind'] == 'video'), None)
    if not asset:
        return {'status': 'partial', 'reason': 'Chưa có video', 'asr': 'unavailable', 'vision': 'unavailable'}
    path = store.DATA / 'media' / Path(asset['path']).name
    if not path.exists():
        raise ValueError('Tệp video không tồn tại. Chạy npm run setup để dựng video mẫu.')
    result = subprocess.run(['ffprobe', '-v', 'quiet', '-show_format', '-show_streams', '-of', 'json', str(path)], capture_output=True, text=True, timeout=15, check=True)
    metadata = json.loads(result.stdout)
    duration = float(metadata.get('format', {}).get('duration', 0))
    folder = store.DATA / 'frames' / lecture['id']
    folder.mkdir(parents=True, exist_ok=True)
    frames = []
    for index, position in enumerate([0, min(10, duration / 3), min(24, duration * .6)]):
        output = folder / f'v{lecture["version"]}-{index}.jpg'
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-ss', str(position), '-i', str(path), '-frames:v', '1', '-vf', 'scale=640:-2', str(output)], capture_output=True, timeout=20, check=True)
        frames.append({'timestamp': round(position, 2), 'file': output.name, 'url': f"/api/lectures/{lecture['id']}/frames/{output.name}"})
    return {'status': 'completed', 'duration_seconds': duration, 'keyframes': frames,
        'video_codec': next((s.get('codec_name') for s in metadata.get('streams', []) if s.get('codec_type') == 'video'), None),
        'has_audio': any(s.get('codec_type') == 'audio' for s in metadata.get('streams', [])),
        'asr': 'unavailable', 'vision': 'unavailable', 'semantic_source': 'prepared_demo_annotation' if lecture['sample_attached'] else 'manual_transcript_or_slides'}


def perceive(lecture, agent):
    report = media_probe(lecture)
    if report.get('has_audio'):
        def audio():
            video = next(a for a in lecture['assets'] if a['kind'] == 'video')
            folder = store.DATA / 'audio' / lecture['id']
            folder.mkdir(parents=True, exist_ok=True)
            output = folder / f"v{lecture['version']}.wav"
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(store.DATA / 'media' / video['path']),
                '-vn', '-ac', '1', '-ar', '16000', str(output)], capture_output=True, timeout=30, check=True)
            return {'status': 'extracted', 'bytes': output.stat().st_size, 'sample_rate': 16000, 'asr': 'unavailable', 'note': 'Trích xuất âm thanh không phải nhận dạng lời nói.'}
        report['audio'] = run_tool(agent, 'extract_audio', {}, audio)
    report.update(run_tool(agent, 'read_sources', {}, lambda: {'transcript_segments': len(lecture['transcript']), 'slide_pages': len(lecture['slides'])}))
    return report


def extract_knowledge(lecture):
    duration = next((a.get('duration_seconds', 0) for a in lecture['assets'] if a['kind'] == 'video'), 0)
    evidence, concepts = [], []
    for definition in CONCEPTS:
        citations = []
        for source in lecture.get('transcript', []):
            if any(word in source['text'].lower() for word in definition['keywords']):
                eid = f"ev-{definition['id']}-{source['id']}"
                evidence.append({'id': eid, 'concept_id': definition['id'], 'kind': 'transcript', 'start': source['start'], 'end': source['end'],
                    'text': source['text'], 'slide_page': next((p['page'] for p in lecture.get('slides', []) if p.get('start') == source['start']), None),
                    'source_type': source['source_type'], 'valid': bool(duration and 0 <= source['start'] < source['end'] <= duration + .1), 'verified': False})
                citations.append(eid)
        for slide in lecture.get('slides', []):
            if any(word in slide['text'].lower() for word in definition['keywords']):
                eid = f"ev-{definition['id']}-slide-{slide['page']}"
                evidence.append({'id': eid, 'concept_id': definition['id'], 'kind': 'slide', 'start': slide.get('start'), 'end': slide.get('end'),
                    'text': slide['text'], 'slide_page': slide['page'], 'source_type': 'prepared_demo_fixture' if lecture['sample_attached'] else 'document_parser', 'valid': True, 'verified': False})
                citations.append(eid)
        if citations:
            concepts.append({k: deepcopy(v) for k, v in definition.items() if k != 'keywords'} | {'verified': False, 'evidence_ids': citations})
    ids = {c['id'] for c in concepts}
    lecture['concepts'], lecture['evidence'] = concepts, evidence
    lecture['edges'] = [deepcopy(e) for e in EDGES if e['source'] in ids and e['target'] in ids]
    store.put('lectures', lecture)
    return {'concept_count': len(concepts), 'evidence_count': len(evidence), 'edge_count': len(lecture['edges']),
        'method': 'Keyword matching against the explicit BFS/DFS sample vocabulary; not general semantic AI'}


def verify_lecture(lecture):
    findings = []
    for concept in lecture['concepts']:
        valid = [e for e in lecture['evidence'] if e['concept_id'] == concept['id'] and e['valid']]
        findings.append({'id': f"finding-{concept['id']}", 'concept_id': concept['id'], 'title': f"{concept['label']}: {'có nguồn để xác nhận' if valid else 'thiếu bằng chứng hợp lệ'}",
            'description': 'Giảng viên cần kiểm tra nội dung và nguồn trước khi xác nhận.', 'severity': 'info' if valid else 'warning',
            'has_evidence': bool(valid), 'source_ids': [e['id'] for e in valid], 'status': 'pending', 'note': ''})
    findings.append({'id': 'finding-extension', 'concept_id': 'complexity', 'title': 'Nội dung mở rộng: chưa đủ nguồn về độ phức tạp',
        'description': 'Bộ mẫu chưa cung cấp bằng chứng cho phần này. Không đưa vào nội dung đã xác nhận nếu chưa bổ sung nguồn.',
        'severity': 'warning', 'has_evidence': False, 'source_ids': [], 'status': 'pending', 'note': ''})
    if not lecture['transcript'] and not lecture['slides']:
        findings.append({'id': 'finding-provider', 'concept_id': None, 'title': 'Chưa có ASR/vision hoặc chú giải thủ công',
            'description': 'Chỉ có metadata/keyframe. Hãy cung cấp transcript hoặc slide để phân tích nội dung có nguồn.',
            'severity': 'warning', 'has_evidence': False, 'source_ids': [], 'status': 'pending', 'note': ''})
    lecture['findings'] = findings
    domain.snapshot(lecture, 'observed_draft', f"Trích xuất {len(lecture['concepts'])} khái niệm; chờ giảng viên xác minh")
    return {'findings': findings, 'supported': sum(f['has_evidence'] for f in findings), 'requires_teacher_review': True}


def step(job, key, name, function, handoff=None):
    if boundary(job['id']):
        return None
    current = store.get('jobs', job['id'])
    prior = next((a for a in current['agents'] if a['agent'] == key and a['status'] == 'completed'), None)
    if prior:
        return prior['output']
    agent = {'id': store.uid('agent'), 'agent': key, 'status': 'running', 'started_at': store.now(), 'finished_at': None,
        'duration_ms': 0, 'input': AgentInput(lecture_id=job['lecture_id'], version=job['input']['version'], task=job['input']).model_dump(),
        'output': {}, 'tools': [], 'handoff_to': handoff, 'model_calls': 0, 'tokens': None, 'error': None}
    current['agents'].append(agent)
    save_job(current)
    started = time.perf_counter()
    try:
        output = run_tool(agent, name, job['input'], lambda: function(agent))
        validated = AgentOutput(agent=key, result=output, evidence_ids=output.get('evidence_ids', [])).model_dump()
        agent.update(status='completed', output=validated)
        return validated
    except Exception as error:
        agent.update(status='failed', error=str(error))
        raise
    finally:
        agent.update(finished_at=store.now(), duration_ms=round((time.perf_counter() - started) * 1000, 2))
        current = store.get('jobs', job['id'])
        current['agents'] = [agent if a['id'] == agent['id'] else a for a in current['agents']]
        current['progress'] = round(sum(a['status'] == 'completed' for a in current['agents']) / current['total_steps'] * 100)
        save_job(current)


def knowledge_for_question(lecture, question):
    lower = question.lower()
    selected = [c['id'] for c in lecture['concepts'] if c.get('verified') and (c['id'] in lower or c['label'].lower() in lower)]
    if 'hàng đợi' in lower or 'fifo' in lower:
        selected.extend(['bfs', 'queue'])
    if 'ngăn xếp' in lower or 'đệ quy' in lower:
        selected.extend(['dfs', 'stack'])
    if 'so sánh' in lower:
        selected.extend(['bfs', 'dfs', 'compare'])
    citations = [e for e in lecture['evidence'] if e['concept_id'] in selected and e['valid'] and e['verified']]
    dedup = {}
    for e in citations:
        dedup.setdefault((e['text'], e['start']), e)
    return list(dedup.values())[:3]


def execute(job_id):
    try:
        with store.LOCK:
            job = store.get('jobs', job_id)
            if not job or job['status'] in ('cancelled', 'completed', 'needs_review', 'paused'):
                return
            job.update(status='running', started_at=job['started_at'] or store.now(), error=None)
            save_job(job)
        lecture = store.get('lectures', job['lecture_id'])
        if lecture['version'] != job['input']['version'] and job['workflow'] != 'tutor':
            raise ValueError('Phiên bản bài giảng đã thay đổi; hãy khởi tạo workflow mới')
        if job['workflow'] == 'tutor':
            lecture = deepcopy(lecture['published_payload']) if job['input']['role'] == 'student' else lecture
        step(job, 'orchestrator', 'dispatch_workflow', lambda _: {'workflow': job['workflow'], 'version': job['input']['version'], 'mode': 'DEMO_FALLBACK'}, 'perception' if job['workflow'] == 'analysis' else 'knowledge')
        if boundary(job_id): return
        if job['workflow'] == 'analysis':
            result = step(job, 'perception', 'probe_video', lambda a: perceive(lecture, a), 'knowledge')
            if boundary(job_id): return
            if result:
                lecture['media_report'] = result['result']
                store.put('lectures', lecture)
            step(job, 'knowledge', 'extract_concepts', lambda _: extract_knowledge(lecture), 'verification')
            if boundary(job_id): return
            step(job, 'verification', 'validate_evidence', lambda _: verify_lecture(lecture), 'teacher_review')
            if boundary(job_id): return
            current = store.get('jobs', job_id)
            if any(f['status'] == 'pending' for f in lecture['findings']):
                for agent in current['agents']:
                    if agent['agent'] == 'verification': agent['status'] = 'needs_review'
                current.update(status='needs_review', result={'findings': lecture['findings'], 'media_report': lecture.get('media_report')})
                save_job(current)
                return
            result = step(job, 'pedagogical', 'map_objectives', lambda _: {'coverage': [{'objective': objective, 'evidence_concepts': [c['id'] for c in lecture['concepts'] if c['verified']],
                'status': 'needs_manual_mapping', 'note': 'Đối chiếu sơ bộ theo bộ từ khóa; giảng viên đánh giá mức độ phù hợp.'} for objective in lecture['objectives']]}, None)
            if boundary(job_id): return
            lecture = store.get('lectures', lecture['id'])
            lecture['coverage'] = result['result']['coverage']
            lecture['analysis_version'] = lecture['version']
            domain.snapshot(lecture, 'analysis_verified', 'Workflow đã qua cổng kiểm duyệt; sẵn sàng giảng viên xuất bản')
            final = {'concept_count': len(lecture['concepts']), 'coverage': lecture['coverage'], 'partial': not lecture.get('sample_attached'), 'provider_note': 'Không có ASR/vision/LLM bên ngoài'}
        elif job['workflow'] == 'tutor':
            evidence_result = step(job, 'knowledge', 'query_evidence', lambda _: {'citations': knowledge_for_question(lecture, job['input']['question'])}, 'tutor')
            if boundary(job_id): return
            citations = evidence_result['result']['citations']
            answer = step(job, 'tutor', 'compose_grounded_answer', lambda _: {'answer': '\n'.join(e['text'] for e in citations) if citations else 'Chưa có nguồn đã xác minh phù hợp trong bài giảng. Mời bạn hỏi về BFS, DFS hoặc nhờ giảng viên bổ sung học liệu.',
                'citations': citations, 'limitation': 'Tổng hợp trích đoạn theo từ khóa, không phải câu trả lời từ LLM.'}, 'verification')
            if boundary(job_id): return
            step(job, 'verification', 'validate_evidence', lambda _: {'valid_citations': all(e['verified'] and e['valid'] for e in citations), 'evidence_ids': [e['id'] for e in citations]}, None)
            final = answer['result']
        elif job['workflow'] == 'assessment':
            step(job, 'knowledge', 'query_evidence', lambda _: {'verified_concepts': [c['id'] for c in lecture['concepts'] if c.get('verified')]}, 'assessment')
            if boundary(job_id): return
            generated = step(job, 'assessment', 'build_questions', lambda _: {'questions': domain.create_questions(lecture)}, 'verification')
            if boundary(job_id): return
            questions = generated['result']['questions']
            step(job, 'verification', 'validate_evidence', lambda _: {'valid': all(q['evidence_id'] in {e['id'] for e in lecture['evidence'] if e['verified']} for q in questions), 'question_count': len(questions)}, None)
            assessment = {'id': store.uid('quiz'), 'lecture_id': lecture['id'], 'owner_id': job['owner_id'], 'version': lecture['version'], 'title': 'Tự kiểm tra BFS & DFS', 'status': 'draft', 'questions': questions, 'created_at': store.now()}
            store.put('assessments', assessment)
            final = {'assessment_id': assessment['id'], 'question_count': len(questions)}
        elif job['workflow'] == 'planning':
            planned = step(job, 'planning', 'plan_timetable', lambda a: run_tool(a, 'evaluate_scenario', job['input'], lambda: domain.evaluate_scenario(lecture, job['input']['add_practice_minutes'], job['input']['total_limit'])), 'verification')
            if boundary(job_id): return
            comparison = planned['result']
            step(job, 'verification', 'validate_constraints', lambda _: {'feasible': comparison['feasible'], 'violations': comparison['violations']}, None)
            scenario = {'id': store.uid('scenario'), 'lecture_id': lecture['id'], 'owner_id': job['owner_id'], 'title': job['input'].get('title') or 'Tăng thực hành DFS', 'base_version': lecture['version'],
                'request': job['input']['request'], 'comparison': comparison, 'segments': comparison['scenario_segments'], 'created_at': store.now(), 'status': 'draft'}
            store.put('scenarios', scenario)
            domain.snapshot(lecture, 'scenario_evaluated', 'Đã tính kịch bản riêng; không thay đổi bản gốc hay điểm số học tập')
            final = {'scenario_id': scenario['id'], 'comparison': comparison}
        else:
            raise ValueError('Workflow không hỗ trợ')
        if boundary(job_id): return
        current = store.get('jobs', job_id)
        current.update(status='completed', progress=100, finished_at=store.now(), result=final)
        save_job(current)
    except Cancelled:
        pass
    except Exception as error:
        current = store.get('jobs', job_id)
        if current and current['status'] not in ('cancelled', 'paused'):
            current.update(status='failed', finished_at=store.now(), error=str(error))
            save_job(current)
    finally:
        with store.LOCK:
            SCHEDULED.discard(job_id)


def schedule(job_id):
    with store.LOCK:
        if job_id not in SCHEDULED:
            SCHEDULED.add(job_id)
            POOL.submit(execute, job_id)


def create_job(user, lecture, workflow, payload=None, run_async=True):
    with store.LOCK:
        active = [j for j in store.items('jobs', lecture['id']) if j['owner_id'] == user['id'] and j['workflow'] == workflow and j['status'] in ('queued', 'running', 'paused', 'needs_review')]
        if active:
            return active[-1]
        job = {'id': store.uid('job'), 'lecture_id': lecture['id'], 'owner_id': user['id'], 'workflow': workflow, 'status': 'queued', 'progress': 0,
            'input': {'lecture_id': lecture['id'], 'version': lecture['published_version'] if workflow == 'tutor' and user['role'] == 'student' else lecture['version'], 'role': user['role'], **(payload or {})}, 'agents': [], 'created_at': store.now(),
            'started_at': None, 'finished_at': None, 'error': None, 'result': None, 'total_steps': 5 if workflow == 'analysis' else 4 if workflow in ('tutor', 'assessment') else 3}
        save_job(job)
        store.audit(user, 'START_WORKFLOW', {'workflow': workflow, 'job_id': job['id']}, lecture['id'])
    if run_async:
        schedule(job['id'])
    else:
        execute(job['id'])
    return store.get('jobs', job['id'])
