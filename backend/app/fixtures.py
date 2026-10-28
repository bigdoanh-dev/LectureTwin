from copy import deepcopy
from . import store
from .auth import password_hash

PROVIDER_NOTE = 'DEMO_FALLBACK: các tác nhân chạy công cụ và luật xác định trên dữ liệu mẫu. Chưa kết nối ASR, vision hoặc LLM bên ngoài.'
OBJECTIVES = ['Giải thích duyệt đồ thị và đánh dấu đỉnh đã thăm', 'Mô tả BFS với hàng đợi FIFO và DFS với ngăn xếp/đệ quy', 'So sánh thứ tự duyệt BFS và DFS trên cùng đồ thị']
SEGMENTS = [
    {'id': 'intro', 'title': 'Đồ thị và mục tiêu', 'concept_id': 'graph', 'kind': 'intro', 'minutes': 5},
    {'id': 'bfs', 'title': 'BFS và hàng đợi', 'concept_id': 'bfs', 'kind': 'theory', 'minutes': 15},
    {'id': 'dfs', 'title': 'DFS và quay lui', 'concept_id': 'dfs', 'kind': 'theory', 'minutes': 15},
    {'id': 'practice', 'title': 'Thực hành so sánh BFS/DFS', 'concept_id': 'dfs', 'kind': 'practice', 'minutes': 10},
    {'id': 'summary', 'title': 'Tổng kết và kiểm tra', 'concept_id': 'compare', 'kind': 'summary', 'minutes': 5},
]
TRANSCRIPT = [
    {'id': 'tr-1', 'start': 0, 'end': 10, 'text': 'Đồ thị gồm các đỉnh và cạnh. Khi duyệt, đánh dấu đỉnh đã thăm để tránh lặp lại.', 'source_type': 'prepared_demo_annotation'},
    {'id': 'tr-2', 'start': 10, 'end': 22, 'text': 'BFS duyệt theo từng lớp. Hàng đợi FIFO lưu các đỉnh đang chờ xử lý.', 'source_type': 'prepared_demo_annotation'},
    {'id': 'tr-3', 'start': 22, 'end': 36, 'text': 'DFS đi sâu theo một nhánh trước khi quay lui. DFS có thể dùng ngăn xếp hoặc đệ quy.', 'source_type': 'prepared_demo_annotation'},
    {'id': 'tr-4', 'start': 36, 'end': 46, 'text': 'Với đồ thị mẫu và thứ tự kề theo chữ cái: BFS là A B C D E F; DFS là A B D E C F.', 'source_type': 'prepared_demo_annotation'},
    {'id': 'tr-5', 'start': 46, 'end': 50, 'text': 'Hãy so sánh hàng đợi FIFO và ngăn xếp LIFO trên cùng đồ thị.', 'source_type': 'prepared_demo_annotation'},
]
SLIDES = [{'page': i + 1, 'title': title, 'text': TRANSCRIPT[i]['text'], 'start': TRANSCRIPT[i]['start'], 'end': TRANSCRIPT[i]['end']}
    for i, title in enumerate(['Đồ thị', 'Breadth-first search', 'Depth-first search', 'So sánh BFS và DFS', 'Tự kiểm tra'])]
CONCEPTS = [
    {'id': 'graph', 'label': 'Đồ thị', 'description': 'Đỉnh, cạnh và đánh dấu đã thăm.', 'keywords': ['đồ thị', 'graph'], 'x': 260, 'y': 30},
    {'id': 'bfs', 'label': 'BFS', 'description': 'Duyệt lần lượt theo từng lớp.', 'keywords': ['bfs'], 'x': 80, 'y': 170},
    {'id': 'queue', 'label': 'Hàng đợi FIFO', 'description': 'Vào trước, ra trước.', 'keywords': ['fifo', 'hàng đợi'], 'x': 80, 'y': 310},
    {'id': 'dfs', 'label': 'DFS', 'description': 'Đi sâu trước khi quay lui.', 'keywords': ['dfs'], 'x': 440, 'y': 170},
    {'id': 'stack', 'label': 'Ngăn xếp / đệ quy', 'description': 'Lưu trạng thái để tiếp tục sau khi quay lui.', 'keywords': ['ngăn xếp', 'đệ quy', 'lifo'], 'x': 440, 'y': 310},
    {'id': 'compare', 'label': 'Thứ tự duyệt', 'description': 'Đối chiếu trên cùng đồ thị và thứ tự danh sách kề.', 'keywords': ['a b c d e f', 'so sánh'], 'x': 260, 'y': 440},
]
EDGES = [
    {'id': 'g-b', 'source': 'graph', 'target': 'bfs', 'type': 'prerequisite', 'label': 'nền tảng'},
    {'id': 'g-d', 'source': 'graph', 'target': 'dfs', 'type': 'prerequisite', 'label': 'nền tảng'},
    {'id': 'b-q', 'source': 'bfs', 'target': 'queue', 'type': 'uses', 'label': 'sử dụng'},
    {'id': 'd-s', 'source': 'dfs', 'target': 'stack', 'type': 'uses', 'label': 'sử dụng'},
    {'id': 'b-c', 'source': 'bfs', 'target': 'compare', 'type': 'compared_in', 'label': 'so sánh'},
    {'id': 'd-c', 'source': 'dfs', 'target': 'compare', 'type': 'compared_in', 'label': 'so sánh'},
]
AGENTS = [
    {'id': key, 'name': name, 'description': desc, 'tools': tools, 'mode': 'rule_based',
     'input_schema': {'lecture_id': 'string', 'sources': 'array'}, 'output_schema': {'result': 'object', 'evidence_ids': 'array'}}
    for key, name, desc, tools in [
        ('orchestrator', 'Orchestrator', 'Điều phối workflow, lưu trạng thái và kiểm tra quyền.', ['dispatch_workflow', 'persist_handoff']),
        ('perception', 'Perception', 'Đọc nguồn, metadata video, slide và chú giải đã chuẩn bị.', ['probe_video', 'extract_audio', 'read_sources']),
        ('knowledge', 'Knowledge', 'Trích xuất theo từ khóa và truy vấn liên kết có nguồn.', ['extract_concepts', 'query_evidence']),
        ('verification', 'Verification', 'Kiểm tra timestamp, nguồn và điều kiện xuất bản.', ['validate_evidence', 'validate_constraints']),
        ('pedagogical', 'Pedagogical', 'Đối chiếu mục tiêu với khái niệm đã xác nhận.', ['map_objectives', 'learning_analytics']),
        ('planning', 'Planning', 'Lập phương án phân bổ thời gian và kiểm tra ràng buộc.', ['plan_timetable', 'evaluate_scenario']),
        ('tutor', 'Tutor', 'Hướng dẫn trong phạm vi nguồn đã duyệt.', ['compose_grounded_answer']),
        ('assessment', 'Assessment', 'Chọn câu hỏi có đáp án xác định và phản hồi theo nguồn.', ['build_questions', 'grade_answers']),
    ]
]


def sample_sources(lecture):
    lecture['sample_attached'] = True
    lecture['transcript'] = deepcopy(TRANSCRIPT)
    lecture['slides'] = deepcopy(SLIDES)
    lecture['assets'] = [
        {'id': 'sample-video', 'kind': 'video', 'name': 'BFS-DFS · trích đoạn minh họa 50 giây', 'status': 'ready', 'source_type': 'prepared_demo_fixture', 'url': f"/api/lectures/{lecture['id']}/video", 'duration_seconds': 50,
         'path': 'sample-lecture.mp4', 'notes': 'Video minh họa được dựng từ mã nguồn; chú giải soạn sẵn, không phải kết quả ASR/vision.'},
        {'id': 'sample-slides', 'kind': 'slides', 'name': '5 slide mẫu BFS & DFS', 'status': 'ready', 'source_type': 'prepared_demo_fixture', 'notes': 'Slide và chú giải cùng bộ dữ liệu mẫu.'},
    ]
    return lecture


def new_lecture(lid, owner_id, course_id, title, objectives=None, total_minutes=50):
    segments = deepcopy(SEGMENTS)
    for segment in segments: segment['minutes'] = round(segment['minutes'] * total_minutes / 50)
    segments[-1]['minutes'] += total_minutes - sum(s['minutes'] for s in segments)
    return {'id': lid, 'owner_id': owner_id, 'course_id': course_id, 'title': title, 'status': 'draft', 'version': 1,
        'published_version': None, 'updated_at': store.now(), 'objectives': objectives or deepcopy(OBJECTIVES),
        'total_minutes': total_minutes, 'sample_attached': False, 'planned': {'objectives': objectives or deepcopy(OBJECTIVES), 'total_minutes': total_minutes,
            'segments': segments},
        'assets': [], 'transcript': [], 'slides': [], 'concepts': [], 'edges': [], 'evidence': [], 'findings': [], 'snapshots': [], 'analysis_version': None}


def seed():
    if store.items('users'):
        return
    for username, role, label, courses in [
        ('admin', 'admin', 'Quản trị hệ thống · Demo', []), ('teacher', 'teacher', 'Giảng viên A · Demo', ['course-algo']),
        ('teacher2', 'teacher', 'Giảng viên B · Demo', ['course-other']), ('student', 'student', 'Học viên A · Demo', ['course-algo']),
        ('student2', 'student', 'Học viên B · Demo', ['course-algo'])]:
        store.put('users', {'id': username, 'username': username, 'role': role, 'full_name': label, 'course_ids': courses,
            'is_active': True, 'password_hash': password_hash('demo123')})
    for cid, code, title, owner in [('course-algo', 'CTDL-201', 'Cấu trúc dữ liệu & Giải thuật', 'teacher'), ('course-other', 'CTDL-202', 'Lớp học độc lập', 'teacher2')]:
        store.put('courses', {'id': cid, 'code': code, 'title': title, 'owner_id': owner})
    lecture = sample_sources(new_lecture('lec-bfs-dfs', 'teacher', 'course-algo', 'Duyệt đồ thị: BFS & DFS'))
    store.put('lectures', lecture)
    store.put('lectures', new_lecture('lec-other', 'teacher2', 'course-other', 'Bài giảng của lớp khác'))
    public = sample_sources(new_lecture('lec-published', 'teacher', 'course-algo', 'BFS & DFS · Bài học đã duyệt'))
    store.put('lectures', public)
