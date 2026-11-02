from copy import deepcopy
import pytest
from app import ai_runtime, key_points, knowledge_ai

SOURCE = 'Lớp SoNgauNhien có hàm hienthi2so. Hàm dùng random.randint(0,9) để sinh hai số rồi return so1,so2.'


@pytest.fixture(autouse=True)
def isolate_generation(monkeypatch):
    # Extraction tests exercise source guards; feedback protocol is tested separately.
    monkeypatch.setattr(key_points, 'collaborate', lambda points, version: (points, {'source_version': version}))


def lecture():
    return {'id': 'lecture-keypoints', 'title': 'Bài tập hiển thị số ngẫu nhiên', 'version': 4,
        'concepts': [{'id': 'teacher-edited', 'label': 'Nội dung giảng viên đã sửa', 'verified': True}],
        'assets': [{'id': 'asset-video', 'kind': 'video'}],
        'slides': [{'asset_id': 'asset-video', 'text': SOURCE, 'frame_timestamp': 12.5,
            'source_type': 'sampled_frame_ocr'}]}


def point(**changes):
    value = {'title': 'Hàm hienthi2so tạo hai số ngẫu nhiên',
        'explanation': 'Hàm sử dụng random.randint(0,9) để sinh các giá trị, sau đó trả về so1,so2 cho nơi gọi.',
        'references': [{'source_id': 'slide-0-0', 'quote': SOURCE}]}
    return {**value, **changes}


def test_single_call_useful_points_preserve_source_and_do_not_overwrite_graph(monkeypatch):
    original = lecture(); before = deepcopy(original); calls = []
    def generate(schema, task, payload):
        calls.append((schema, task, payload))
        assert 'IDE menus' in task and 'do not guess' in task
        return schema(points=[point()])
    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = key_points.generate(original)
    assert len(calls) == 1 and calls[0][0] is key_points.ShortPoints
    assert original == before
    assert result['source_version'] == 4 and result['status'] == 'draft'
    assert len(result['points']) == 1
    evidence = result['points'][0]['evidence'][0]
    assert evidence['text'] == SOURCE and evidence['source_segment_id'] == 'slide-0-0'
    assert evidence['source_version'] == 4 and evidence['asset_id'] == 'asset-video'
    assert evidence['start'] == 12.5 and evidence['end'] is None and evidence['slide_page'] is None
    assert evidence['kind'] == 'video' and evidence['source_type'] == 'sampled_frame_ocr'
    assert evidence['valid'] and not evidence['verified'] and evidence['semantic_review'] == 'pending_teacher'


def test_nonverbatim_quote_keyword_echo_duplicate_and_renamed_code_are_rejected(monkeypatch):
    candidates = [point(), point(),
        point(title='SoNgauNhienPython', explanation='SoNgauNhienPython là nội dung được nhắc tới trong bài học này.'),
        point(explanation='Hàm hienthi2so tạo hai số ngẫu nhiên và hàm hienthi2so tạo hai số ngẫu nhiên.'),
        point(references=[{'source_id': 'slide-0-0', 'quote': 'Hàm dùng random.randint(0,99) để sinh hai số.'}]),
        point(explanation='Hàm sử dụng random.randInt(0,9) để sinh các giá trị, sau đó trả về so1,so2 cho nơi gọi.')]
    monkeypatch.setattr(ai_runtime, 'generate', lambda schema, task, payload: schema(points=candidates))
    result = key_points.generate(lecture())
    assert len(result['points']) == 1
    assert result['points'][0]['title'] == point()['title']


def test_normalized_quote_recovers_actual_source_span_and_document_provenance(monkeypatch):
    data = lecture()
    raw = 'Tài liệu nêu cách tạo một lớp Python. Sau đó gọi hàm để lấy kết quả.'
    data['slides'] = [{'text': raw, 'page': 2, 'source_type': 'pdf_text', 'asset_id': 'doc'}]
    candidate = {'title': 'Tài liệu trình bày cách tạo lớp Python',
        'explanation': 'Nội dung nêu bước tạo lớp trong Python trước khi gọi hàm để nhận kết quả.',
        'references': [{'source_id': 'slide-0-0', 'quote': 'tài liệu nêu cách tạo một lớp python'}]}
    # Include an explicit action verb accepted by the non-keyword guard.
    candidate['title'] = 'Tạo một lớp Python trước khi gọi hàm'
    monkeypatch.setattr(ai_runtime, 'generate', lambda schema, task, payload: schema(points=[candidate]))
    result = key_points.generate(data)
    evidence = result['points'][0]['evidence'][0]
    assert evidence['text'] == 'Tài liệu nêu cách tạo một lớp Python'
    assert evidence['validation'] == 'normalized_quote_source_span'
    assert evidence['slide_page'] == 2 and evidence['start'] is None and evidence['end'] is None


def test_batching_covers_every_source_character_and_never_exceeds_budget(monkeypatch):
    data = lecture()
    texts = ['A' * 11001, 'B' * 4200, 'C' * 103]
    data['slides'] = []
    data['transcript'] = [{'text': text} for text in texts]
    expected = ''.join(row['text'] for row in knowledge_ai.source_segments(data))
    received = []
    def generate(schema, task, payload):
        assert schema is key_points.BatchPoints
        assert sum(len(source['text']) for source in payload['sources']) <= 5000
        received.extend(source['text'] for source in payload['sources'])
        return schema(points=[])
    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = key_points.generate(data)
    assert ''.join(received) == expected
    assert result['points'] == [] and any('Chưa tạo được' in note for note in result['limitations'])


def test_empty_or_failed_source_returns_honest_empty_draft(monkeypatch):
    def unavailable(*args):
        raise ai_runtime.ProviderUnavailable('model offline')
    monkeypatch.setattr(ai_runtime, 'generate', unavailable)
    result = key_points.generate(lecture())
    assert result['points'] == [] and result['status'] == 'draft'
    assert any('1/1 lô' in note for note in result['limitations'])
    result = key_points.generate({'version': 1, 'transcript': [], 'slides': []})
    assert result['points'] == [] and any('Chưa có đoạn nguồn' in note for note in result['limitations'])


def test_stale_cached_sources_never_replace_current_raw_upload(monkeypatch):
    data = lecture()
    data['source_segments'] = [{'id': 'slide-0-0', 'text': 'Nội dung cũ của nguồn trước.',
        'kind': 'video', 'version': 3, 'asset_id': 'old-asset'}]
    def generate(schema, task, payload):
        assert payload['sources'][0]['text'] == SOURCE
        assert payload['sources'][0]['asset_id'] == 'asset-video'
        assert payload['sources'][0]['version'] == 4
        return schema(points=[point()])
    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = key_points.generate(data)
    assert len(result['points']) == 1 and result['points'][0]['evidence'][0]['asset_id'] == 'asset-video'
    data['slides'] = []
    # Even apparently current cached metadata is not raw current source content.
    data['source_segments'][0]['version'] = 4
    result = key_points.generate(data)
    assert result['points'] == [] and any('Chưa có đoạn nguồn' in note for note in result['limitations'])


def test_consolidation_selects_existing_candidates_without_rewriting(monkeypatch):
    data = lecture(); data['slides'] = []
    data['transcript'] = [{'text': value * 3000} for value in ('A', 'B', 'C')]
    candidates = []; call = 0
    monkeypatch.setattr(key_points, '_useful', lambda candidate, quotes: True)  # Test ID selection independently of prose quality.
    def generate(schema, task, payload):
        nonlocal call
        if schema is key_points.Selection:
            candidates.extend(payload['candidates'])
            return schema(point_ids=[payload['candidates'][1]['id'], 'invented-point'])
        call += 1
        source = payload['sources'][0]
        return schema(points=[{'title': f'Tạo riêng{call}-{number} ý{call}-{number} điểm{call}-{number}',
            'explanation': ' '.join(f'word{call}_{number}_{index}' for index in range(10)),
            'references': [{'source_id': source['id'], 'quote': source['text'][:20]}]} for number in range(3)])
    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = key_points.generate(data)
    assert len(candidates) > 6 and len(result['points']) == 1
    assert result['points'][0]['id'] == candidates[1]['id']
    assert result['points'][0]['title'] == candidates[1]['title']
    assert result['points'][0]['explanation'] == candidates[1]['explanation']


def test_unfinished_prose_rejected_and_empty_ai_uses_explicit_code_observations(monkeypatch):
    candidate = key_points.PointCandidate(**point(explanation='Hàm sử dụng random.randint để tạo các giá trị và trả về một chí liệu đa'))
    assert not key_points._useful(candidate, [SOURCE])
    data = lecture()
    code = 'class Exemple:\ndef obtenir(self):\nx=outil.calculer(0,9)\ny=outil.calculer(0,9)\nreturn x,y\nprint(obj.obtenir())'
    data['slides'][0]['text'] = code
    monkeypatch.setattr(ai_runtime, 'generate', lambda schema, task, payload: schema(points=[]))
    result = key_points.generate(data)
    assert result['method'] == 'deterministic_python_code_observation'
    assert result['points'] and all(p['method'] == result['method'] for p in result['points'])
    assert 'không phải diễn giải do LLM sinh' in result['limitations'][0]
    assert all(e['text'] in code and not e['verified'] for p in result['points'] for e in p['evidence'])
