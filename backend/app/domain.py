from copy import deepcopy
from statistics import mean
from fastapi import HTTPException
from . import store


def summary(lecture):
    keys = ['id', 'title', 'course_id', 'owner_id', 'status', 'version', 'published_version', 'updated_at', 'objectives', 'total_minutes', 'sample_attached']
    return {**{k: lecture.get(k) for k in keys}, 'concept_count': len(lecture.get('concepts', [])),
        'open_findings': sum(f['status'] == 'pending' for f in lecture.get('findings', [])),
        'analysis_current': lecture.get('analysis_version') == lecture['version']}


def snapshot(lecture, event, details):
    entry = {'id': store.uid('snap'), 'event': event, 'version': lecture['version'], 'created_at': store.now(), 'summary': details}
    lecture.setdefault('snapshots', []).append(entry)
    lecture['updated_at'] = store.now()
    store.put('snapshots', {**entry, 'lecture_id': lecture['id'], 'planned': deepcopy(lecture['planned']),
        'observed': {'concepts': len(lecture.get('concepts', [])), 'verified': sum(c.get('verified', False) for c in lecture.get('concepts', []))}})
    store.put('lectures', lecture)
    return entry


def analytics(lid, user=None):
    attempts = store.items('attempts', lid)
    if user and user['role'] == 'student':
        attempts = [a for a in attempts if a['owner_id'] == user['id']]
    latest = {}
    for attempt in attempts:
        latest[(attempt['owner_id'], attempt['assessment_id'])] = attempt
    current = list(latest.values())
    concepts = {}
    for attempt in current:
        for result in attempt['feedback']:
            metric = concepts.setdefault(result['concept_id'], {'concept_id': result['concept_id'], 'correct': 0, 'total': 0})
            metric['correct'] += int(result['correct'])
            metric['total'] += 1
    return {'attempt_count': len(attempts), 'unique_learners': len({a['owner_id'] for a in attempts}),
        'average_score': round(mean(a['score'] for a in current), 1) if current else None,
        'concept_results': list(concepts.values()), 'attempts': attempts}


def publication_payload(lecture):
    return deepcopy({key: value for key, value in lecture.items() if key != 'published_payload'})


def workspace(lecture, user):
    if user['role'] == 'student':
        data = deepcopy(lecture.get('published_payload', {}))
        if not data:
            raise HTTPException(403, 'Chưa có bản bài giảng được xuất bản')
        data['status'] = 'published'
    else:
        data = deepcopy(lecture)
        data.pop('published_payload', None)
    lid = lecture['id']
    jobs = store.items('jobs', lid)
    if user['role'] == 'student':
        jobs = [j for j in jobs if j['owner_id'] == user['id'] and j['workflow'] == 'tutor']
    # Admin observes execution metadata but does not receive student question/answer bodies.
    if user['role'] == 'admin':
        jobs = [redacted_job(j) for j in jobs]
    assessments = store.items('assessments', lid)
    if user['role'] == 'student':
        assessments = [public_assessment(a) for a in assessments if a['status'] == 'published' and a['version'] == lecture['published_version']]
    result = analytics(lid, user)
    if user['role'] == 'admin':
        result.pop('attempts', None)
    scenarios = [] if user['role'] == 'student' else store.items('scenarios', lid)
    progress = store.get('progress', f"{user['id']}:{lid}") or {'position_seconds': 0, 'completed': False, 'bookmarks': []}
    return {'lecture': summary(data), 'planned': data['planned'],
        **{k: data.get(k, []) for k in ('assets', 'transcript', 'slides', 'concepts', 'edges', 'evidence', 'findings')},
        'jobs': sorted(jobs, key=lambda j: j['created_at'], reverse=True), 'assessments': assessments, 'scenarios': scenarios,
        'progress': progress, 'twin': {'planned': data['planned'], 'observed': {'concepts': len(data.get('concepts', [])),
            'verified': sum(c.get('verified', False) for c in data.get('concepts', [])),
            'open_findings': sum(f['status'] == 'pending' for f in data.get('findings', [])),
            'source_mode': 'prepared_demo_fixture' if data.get('sample_attached') else 'uploaded_partial',
            'coverage': data.get('coverage', [])}, 'evaluated': result,
            'scenarios': {'count': len(scenarios)}, 'snapshots': data.get('snapshots', [])}}


def redacted_job(job):
    value = deepcopy(job)
    if value['workflow'] == 'tutor':
        value['input'] = {'redacted': 'Nội dung riêng của học viên'}
        value['result'] = None
        for agent in value['agents']:
            agent['input'], agent['output'], agent['tools'] = {}, {}, []
    return value


def public_assessment(assessment):
    data = deepcopy(assessment)
    for question in data['questions']:
        question.pop('correct_option_id', None)
        question.pop('explanation', None)
    return data


def publish(lecture):
    if lecture.get('analysis_version') != lecture['version']:
        raise HTTPException(409, 'Cần phân tích và xác nhận phiên bản hiện tại trước khi xuất bản')
    if any(f['status'] == 'pending' for f in lecture.get('findings', [])):
        raise HTTPException(409, 'Còn nội dung chưa được giảng viên xác minh')
    if not lecture.get('concepts') or not all(c.get('verified') for c in lecture['concepts']):
        raise HTTPException(409, 'Chưa có tri thức được xác minh để xuất bản')
    active = [j for j in store.items('jobs', lecture['id']) if j['workflow'] == 'analysis' and j['input']['version'] == lecture['version']]
    if not active or active[-1]['status'] != 'completed':
        raise HTTPException(409, 'Workflow phân tích chưa hoàn tất sau kiểm duyệt')
    lecture['status'], lecture['published_version'] = 'published', lecture['version']
    snapshot(lecture, 'published', 'Giảng viên xác nhận xuất bản bản nội dung hiện tại')
    lecture['published_payload'] = publication_payload(lecture)
    store.put('lectures', lecture)
    return summary(lecture)


def create_questions(lecture):
    if lecture.get('analysis_version') != lecture['version']:
        raise ValueError('Cần phân tích và xác minh phiên bản hiện tại trước khi tạo đề')
    verified = {c['id'] for c in lecture['concepts'] if c.get('verified')}
    definitions = [
        ('q-bfs', 'BFS sử dụng cấu trúc dữ liệu nào để duyệt theo lớp?', 'bfs', [('a', 'Hàng đợi FIFO'), ('b', 'Ngăn xếp LIFO'), ('c', 'Không cần lưu đỉnh chờ')], 'a', 'BFS lưu các đỉnh chờ trong hàng đợi vào trước ra trước.'),
        ('q-dfs', 'DFS trên đồ thị mẫu duyệt các đỉnh theo thứ tự nào (kề theo chữ cái)?', 'dfs', [('a', 'A B C D E F'), ('b', 'A B D E C F'), ('c', 'A F E D C B')], 'b', 'DFS đi sâu từ A qua B, D rồi quay lui qua E, sau đó mới đến C và F.'),
        ('q-visited', 'Vì sao cần đánh dấu đỉnh đã thăm?', 'graph', [('a', 'Để thay đổi cạnh của đồ thị'), ('b', 'Để tránh xử lý lặp lại các đỉnh'), ('c', 'Để biến DFS thành BFS')], 'b', 'Bộ đánh dấu đã thăm giúp tránh lặp lại các đỉnh trong quá trình duyệt.'),
    ]
    questions = []
    for qid, text, cid, options, correct, explanation in definitions:
        evidence = next((e for e in lecture['evidence'] if e['concept_id'] == cid and e.get('verified') and e.get('valid')), None)
        if cid in verified and evidence:
            questions.append({'id': qid, 'text': text, 'concept_id': cid, 'evidence_id': evidence['id'],
                'options': [{'id': oid, 'text': label} for oid, label in options], 'correct_option_id': correct, 'explanation': explanation})
    if not questions:
        raise ValueError('Chưa có nguồn đã xác minh phù hợp với ngân hàng câu hỏi mẫu BFS/DFS')
    return questions


def evaluate_scenario(lecture, delta, total_limit):
    baseline = deepcopy(lecture['planned']['segments'])
    scenario = deepcopy(baseline)
    target = next((s for s in scenario if s['kind'] == 'practice'), None)
    violations = []
    if not target:
        violations.append('Chưa có phần thực hành để điều chỉnh')
    else:
        target['minutes'] += delta
        remaining = delta
        for kind in ('theory', 'intro', 'summary'):
            for segment in scenario:
                if segment['kind'] != kind:
                    continue
                minimum = 5 if kind == 'theory' else 2
                take = min(remaining, max(0, segment['minutes'] - minimum))
                segment['minutes'] -= take
                remaining -= take
        if remaining:
            violations.append('Không đủ thời gian có thể tinh gọn mà vẫn giữ thời lượng tối thiểu')
    total = sum(s['minutes'] for s in scenario)
    if total > total_limit:
        violations.append(f'Tổng {total} phút vượt giới hạn {total_limit} phút')
    positions = {s['concept_id']: i for i, s in enumerate(scenario) if s['kind'] != 'practice'}
    for edge in lecture.get('edges', []):
        if edge['type'] == 'prerequisite' and edge['source'] in positions and edge['target'] in positions and positions[edge['source']] > positions[edge['target']]:
            violations.append('Thứ tự kiến thức tiên quyết không hợp lệ')
    return {'baseline_total': sum(s['minutes'] for s in baseline), 'scenario_total': total, 'practice_delta': delta,
        'feasible': not violations, 'violations': violations, 'baseline_segments': baseline, 'scenario_segments': scenario,
        'assumptions': ['Chỉ đánh giá phân bổ thời gian và thứ tự kiến thức, không dự báo điểm số hoặc hiệu quả học tập.',
            'Giữ tối thiểu 5 phút cho mỗi phần lý thuyết, 2 phút cho mở đầu và tổng kết.', 'Chưa mô hình hóa khác biệt từng học viên.']}
