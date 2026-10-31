"""Question-only, explainable request classification; never assesses learner ability."""
import re
from . import store
from .research import normalized

LEVELS = [
    {'id': 'recall', 'label': 'Khái niệm', 'hint': 'Hỏi định nghĩa, tên gọi hoặc nhắc lại kiến thức.', 'phrases': ['la gi', 'dinh nghia', 'khai niem', 'what is', 'what are', 'define']},
    {'id': 'explain', 'label': 'Giải thích / so sánh', 'hint': 'Hỏi lý do, sự khác nhau hoặc cách một quá trình diễn ra.', 'phrases': ['tai sao', 'vi sao', 'giai thich', 'so sanh', 'khac nhau', 'why', 'explain', 'compare', 'hoat dong nhu the nao']},
    {'id': 'apply', 'label': 'Vận dụng', 'hint': 'Yêu cầu ví dụ, giải bài, viết mã hoặc áp dụng vào trường hợp cụ thể.', 'phrases': ['vi du', 'giai bai', 'bai tap', 'viet code', 'viet ma', 'ap dung', 'cai dat', 'implement', 'example', 'solve', 'lap trinh', 'truy vet', 'duyet thu']},
]


def matches(text, phrase):
    return bool(re.search(r'(?<!\w)' + re.escape(normalized(phrase)) + r'(?!\w)', normalized(text)))


def classify(question, concepts):
    ideas = []
    # Preserve the actual question; splitting is a readable heuristic, not inferred intent.
    for part in re.split(r'[?？;\n]+', question):
        if not part.strip(): continue
        hits = {l['id']: [p for p in l['phrases'] if matches(part, p)] for l in LEVELS}
        topics = [c['id'] for c in concepts if any(matches(part, term) for term in [c['label'], *c.get('keywords', [])])]
        ideas.append({'text': part.strip(), 'levels': [k for k, v in hits.items() if v], 'topics': topics,
                      'reasons': [f'{l["label"]}: “{p}”' for l in LEVELS for p in hits[l['id']]]})
    return {'ideas': ideas, 'levels': sorted({l for i in ideas for l in i['levels']}),
            'topics': sorted({t for i in ideas for t in i['topics']})}


def report(lecture, version):
    # Read ONLY learner-authored input; answers, marks, transcripts and watch data excluded.
    snapshot = lecture.get('published_payload') if lecture.get('published_version') == version else None
    concepts = (snapshot or lecture).get('concepts', []) if version == lecture['version'] or snapshot else []
    jobs = [j for j in store.items('jobs', lecture['id']) if j.get('workflow') == 'tutor'
            and j.get('input', {}).get('role') == 'student' and j.get('input', {}).get('question', '').strip()]
    versions = sorted({j['input']['version'] for j in jobs} | {lecture['version']} | ({lecture['published_version']} if lecture.get('published_version') else set()))
    rows = [{'id': j['id'], 'question': j['input']['question'], 'asked_at': j['created_at'],
             **classify(j['input']['question'], concepts)} for j in jobs if j['input']['version'] == version]
    regions = []
    for mask in range(1, 8):
        levels = [l['id'] for i, l in enumerate(LEVELS) if mask & (1 << i)]
        ids = [r['id'] for r in rows if set(r['levels']) == set(levels)]
        regions.append({'key': str(mask), 'levels': levels, 'question_ids': ids, 'count': len(ids)})
    topics = [{ 'id': c['id'], 'label': c['label'], 'count': sum(c['id'] in r['topics'] for r in rows)} for c in concepts]
    return {'version': version, 'versions': versions, 'method': 'question_rules_v1',
            'levels': [{k: v for k, v in l.items() if k != 'phrases'} for l in LEVELS],
            'questions': rows, 'regions': regions, 'topics': topics, 'total': len(rows),
            'unclassified': sum(not r['levels'] for r in rows),
            'limitations': 'Chỉ phân loại yêu cầu trong câu hỏi bằng từ khóa, chưa gọi mô hình AI. Đây không phải điểm số, mức hiểu hay đánh giá hiệu quả giảng dạy. Diện tích vòng tròn không biểu thị tỷ lệ.'}
