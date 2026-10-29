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
YOUTUBE_VIDEO_ID = 'pcKY4hjDrxk'
YOUTUBE_VIDEO_URL = f'https://www.youtube.com/watch?v={YOUTUBE_VIDEO_ID}'
YOUTUBE_VIDEO_TITLE = '5.1 Graph Traversals - BFS & DFS - Breadth First Search and Depth First Search'
YOUTUBE_VIDEO_DURATION = 18 * 60 + 29
SAMPLE_DATA_REVISION = 'youtube-bfs-dfs-caption-notes-v2'

# These are Vietnamese paraphrase notes tied to the timestamps in Abdul Bari's
# YouTube video. They were prepared from its auto-generated English captions;
# the demo does not claim to run ASR or computer vision over the video.
TRANSCRIPT = [
    {'id': 'yt-1', 'start': 0, 'end': 62, 'text': 'Video giới thiệu BFS và DFS như hai cách duyệt đồ thị. Giảng viên phân biệt việc đi tới một đỉnh với việc lần lượt xem các đỉnh kề; cây cũng là một dạng đồ thị.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-2', 'start': 62, 'end': 128, 'text': 'Ví dụ BFS bắt đầu ở đỉnh 1: lần lượt đưa các đỉnh kề 2, 4, 5 vào hàng đợi, rồi mới xét các đỉnh kề của 2. Thứ tự giữa các đỉnh cùng mức có thể thay đổi.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-3', 'start': 128, 'end': 213, 'text': 'Ví dụ DFS bắt đầu ở đỉnh 1 và đi sâu sang đỉnh mới trước. Khi một nhánh hết đỉnh chưa thăm, thuật toán quay lui để tiếp tục nhánh còn lại.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-4', 'start': 253, 'end': 322, 'text': 'Trên cây nhị phân, BFS tương ứng với duyệt theo từng tầng; DFS trong ví dụ được minh họa như thứ tự tiền tự.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-5', 'start': 322, 'end': 550, 'text': 'Phần BFS dùng hàng đợi: lấy đỉnh đang chờ ra, xem các đỉnh kề chưa thăm, ghi nhận chúng rồi đưa vào hàng đợi. Ví dụ trên đồ thị lớn đánh dấu các đỉnh đã gặp để tránh lặp.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-6', 'start': 550, 'end': 632, 'text': 'Quy tắc BFS: có thể chọn đỉnh bắt đầu và thứ tự xét các đỉnh kề; nhưng phải xét hết các đỉnh kề của lượt hiện tại trước khi lấy đỉnh tiếp theo từ hàng đợi.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-7', 'start': 632, 'end': 970, 'text': 'Phần DFS dùng ngăn xếp để nhớ đường quay lại. Khi gặp đỉnh mới, tạm dừng đỉnh hiện tại và đi sâu tiếp; khi không còn đỉnh kề chưa thăm thì quay lui.', 'source_type': 'youtube_caption_annotation'},
    {'id': 'yt-8', 'start': 970, 'end': YOUTUBE_VIDEO_DURATION, 'text': 'Video kết thúc bằng các thứ tự DFS hợp lệ khác nhau trên cùng đồ thị. Kết quả phụ thuộc vào đỉnh bắt đầu và thứ tự chọn các đỉnh kề.', 'source_type': 'youtube_caption_annotation'},
]
SLIDES = []
CONCEPTS = [
    {'id': 'graph', 'label': 'Đồ thị', 'description': 'Đỉnh, cạnh và đánh dấu đã thăm.', 'keywords': ['đồ thị', 'graph'], 'x': 260, 'y': 30},
    {'id': 'bfs', 'label': 'BFS', 'description': 'Duyệt lần lượt theo từng lớp.', 'keywords': ['bfs'], 'x': 80, 'y': 170},
    {'id': 'queue', 'label': 'Hàng đợi FIFO', 'description': 'Vào trước, ra trước.', 'keywords': ['fifo', 'hàng đợi'], 'x': 80, 'y': 310},
    {'id': 'dfs', 'label': 'DFS', 'description': 'Đi sâu trước khi quay lui.', 'keywords': ['dfs'], 'x': 440, 'y': 170},
    {'id': 'stack', 'label': 'Ngăn xếp / đệ quy', 'description': 'Lưu trạng thái để tiếp tục sau khi quay lui.', 'keywords': ['ngăn xếp', 'đệ quy', 'lifo'], 'x': 440, 'y': 310},
    {'id': 'compare', 'label': 'Thứ tự duyệt', 'description': 'Đối chiếu trên cùng đồ thị và thứ tự danh sách kề.', 'keywords': ['thứ tự', 'phụ thuộc vào đỉnh'], 'x': 260, 'y': 440},
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
    lecture['sample_data_revision'] = SAMPLE_DATA_REVISION
    lecture['transcript'] = deepcopy(TRANSCRIPT)
    lecture['slides'] = deepcopy(SLIDES)
    lecture['assets'] = [
        {'id': 'youtube-bfs-dfs', 'kind': 'video', 'name': f'Abdul Bari · {YOUTUBE_VIDEO_TITLE}', 'status': 'ready', 'source_type': 'youtube_reference', 'url': YOUTUBE_VIDEO_URL,
         'youtube_video_id': YOUTUBE_VIDEO_ID, 'duration_seconds': YOUTUBE_VIDEO_DURATION,
         'notes': 'Nguồn tham khảo công khai. Ghi chú tiếng Việt được biên soạn theo phụ đề tự động tiếng Anh; hệ thống demo chưa chạy ASR hoặc phân tích hình ảnh.'},
        {'id': 'sample-video', 'kind': 'video', 'name': 'Mô phỏng riêng BFS/DFS · 50 giây', 'status': 'ready', 'source_type': 'prepared_demo_fixture', 'url': f"/api/lectures/{lecture['id']}/video", 'duration_seconds': 50,
         'path': 'sample-lecture.mp4', 'notes': 'Đoạn mô phỏng độc lập, không trích từ video YouTube và không phải nguồn cho các mốc dẫn chứng.'},
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
