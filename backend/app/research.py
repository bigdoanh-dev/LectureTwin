"""Evidence-based lecture/CLO read model. Rules suggest links; teachers confirm them."""
import re
import unicodedata
from . import store
from .fixtures import CONCEPTS, SAMPLE_DATA_REVISION

CATALOG = [{**c} for c in CONCEPTS]


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.lower().replace('đ', 'd')) if unicodedata.category(c) != 'Mn')


def expected_concepts(title):
    text = normalized(title)
    return [c['id'] for c in CATALOG if any(
        re.search(r'(?<!\w)' + re.escape(normalized(word)) + r'(?!\w)', text)
        for word in [c['label'], *c.get('keywords', [])])]


def merged_ranges(evidence):
    ranges = sorted((e['start'], e['end']) for e in evidence
        if e.get('kind') != 'slide' and isinstance(e.get('start'), (int, float))
        and isinstance(e.get('end'), (int, float)) and e['end'] > e['start'] >= 0)
    merged = []
    for start, end in ranges:
        if merged and start <= merged[-1]['end']:
            merged[-1]['end'] = max(merged[-1]['end'], end)
        else:
            merged.append({'start': start, 'end': end})
    return merged


def source_priority(cid, text):
    """Readable lexical preference for explanatory passages, not semantic confidence."""
    terms = {'dfs': ['đi sâu', 'quay lui', 'ngăn xếp'], 'bfs': ['hàng đợi', 'từng lớp', 'fifo'],
        'queue': ['hàng đợi', 'fifo'], 'stack': ['ngăn xếp', 'đệ quy', 'quay lui'],
        'complexity': ['độ phức tạp', 'complexity']}.get(cid, [])
    return sum(normalized(term) in normalized(text) for term in terms)


def view(lecture, user):
    version = lecture['version']
    concepts = lecture.get('concepts', [])
    source_processed = bool(concepts or lecture.get('findings')) or lecture.get('analysis_version') == version
    evidence = [e for e in lecture.get('evidence', []) if e.get('valid')]
    found = {c['id'] for c in concepts if any(e['concept_id'] == c['id'] for e in evidence)}
    verified = {c['id'] for c in concepts if c.get('verified') and any(e['concept_id'] == c['id'] and e.get('verified') for e in evidence)}
    objectives, signals = [], []
    for index, title in enumerate(lecture.get('objectives', []), 1):
        oid = f'clo-{index}'
        saved = lecture.get('objective_mappings', {}).get(oid, {})
        same_source = saved.get('version') == version and saved.get('title') == title
        expected = saved['expected_concept_ids'] if same_source else expected_concepts(title)
        confirmed = saved.get('concept_ids', []) if same_source else []
        reviewed = same_source and lecture.get('analysis_version') == version and set(confirmed) <= verified
        ids = [cid for cid in expected if cid in found]
        missing = [cid for cid in expected if cid not in found] if source_processed else []
        objectives.append({'id': oid, 'title': title, 'expected_concept_ids': expected,
            'found_concept_ids': ids, 'missing_concept_ids': missing,
            'confirmed_concept_ids': confirmed if reviewed else [],
            'status': 'confirmed' if reviewed else ('suggested' if expected else 'unmapped'), 'version': version})
        if not reviewed and source_processed:
            signals.append({'id': f'map-{oid}', 'kind': 'mapping_needed', 'objective_id': oid,
                'title': f'{oid.upper()} cần giảng viên đối chiếu',
                'description': 'Liên kết theo từ khóa mới là gợi ý, chưa xác nhận mức đạt chuẩn đầu ra.'})
        for cid in missing:
            label = next(c['label'] for c in CATALOG if c['id'] == cid)
            signals.append({'id': f'missing-{oid}-{cid}', 'kind': 'missing_source', 'concept_id': cid, 'objective_id': oid,
                'title': f'Chưa tìm thấy nguồn cho {label}',
                'description': 'Trong dữ liệu đã xử lý chưa có dẫn chứng. Kiểm tra video hoặc bổ sung học liệu; chưa kết luận bài giảng bỏ sót nội dung.'})
    # Aggregate only attempts attached to this exact source version and permitted user.
    assessments = {a['id']: a for a in store.items('assessments', lecture['id']) if a.get('version') == version}
    attempts = [a for a in store.items('attempts', lecture['id']) if a['assessment_id'] in assessments
        and (user['role'] != 'student' or a['owner_id'] == user['id'])]
    latest = {}
    for a in sorted(attempts, key=lambda x: x['submitted_at']): latest[(a['owner_id'], a['assessment_id'])] = a
    metrics = {}
    for a in latest.values():
        for f in a['feedback']:
            row = metrics.setdefault(f['concept_id'], {'correct': 0, 'total': 0})
            row['correct'] += int(f['correct']); row['total'] += 1
    rows = []
    for concept in concepts:
        cid = concept['id']; sources = sorted([e for e in evidence if e['concept_id'] == cid],
            key=lambda e: -source_priority(cid, e['text']))
        ranges = merged_ranges(sources); quiz = metrics.get(cid, {'correct': 0, 'total': 0})
        rows.append({'concept_id': cid, 'evidence_ids': [e['id'] for e in sources], 'video_ranges': ranges,
            'observed_seconds': sum(r['end'] - r['start'] for r in ranges),
            'source_status': 'reviewed' if cid in verified else 'needs_review',
            'objective_ids': [o['id'] for o in objectives if cid in o['confirmed_concept_ids']],
            'question_ids': [q['id'] for a in assessments.values() if user['role'] != 'student' or a['status'] == 'published'
                for q in a['questions'] if q['concept_id'] == cid], 'quiz': quiz})
        if quiz['total'] > quiz['correct']:
            signals.append({'id': f'quiz-{cid}', 'kind': 'quiz_errors', 'concept_id': cid,
                'title': f'Cần xem lại câu hỏi về {concept["label"]}',
                'description': f'{quiz["total"] - quiz["correct"]}/{quiz["total"]} câu trả lời sai trong các bài nộp mới nhất của phiên bản này. Chưa xác định nguyên nhân hoặc mức hiểu toàn bộ chủ đề.'})
    for finding in lecture.get('findings', []):
        cid = finding.get('concept_id')
        if cid and not finding.get('has_evidence') and cid not in found and not any(s.get('concept_id') == cid and s['kind'] == 'missing_source' for s in signals):
            signals.append({'id': f'finding-{cid}', 'kind': 'missing_source', 'concept_id': cid,
                'title': finding['title'], 'description': finding['description']})
    return {'source_version': version, 'source_processed': source_processed,
        'sample_notes_outdated': bool(lecture.get('sample_attached') and lecture.get('sample_data_revision') != SAMPLE_DATA_REVISION),
        'mode': 'rule_based', 'objectives': objectives, 'concepts': rows,
        'signals': signals, 'concept_catalog': [{'id': c['id'], 'label': c['label']} for c in CATALOG],
        'limitations': ['Đang dùng từ khóa và công cụ xác định; chưa có mô hình ASR, OCR hoặc hiểu hình.',
            'Khoảng nguồn có chứa từ khóa, không phải thời lượng giảng thuần cho một khái niệm.',
            'Giảng viên xác nhận liên kết CLO; hệ thống chưa chứng nhận người học đạt CLO.']}
