from copy import deepcopy
from app import collaboration, graph_collaboration, key_points, knowledge_ai, ai_runtime


def test_challenge_revision_recheck_is_bounded_linked_and_fail_closed():
    original = [{'id': 'a', 'text': 'wrong'}, {'id': 'b', 'text': 'good'}, {'id': 'c', 'text': 'uncertain'}]
    before = deepcopy(original); reviewed = []
    def review(rows):
        reviewed.append(rows)
        return {p['id']: {'supported': p['text'] in ('good', 'fixed')} for p in rows if p['id'] != 'c'}
    def revise(disputed, feedback):
        assert [p['id'] for p in disputed] == ['a', 'c']
        assert not feedback['a']['supported']
        return [{'id': 'a', 'text': 'fixed'}, {'id': 'c', 'text': 'still bad'}, {'id': 'injected', 'text': 'good'}]
    final, trace = collaboration.deliberate(original, review, revise, version=7)
    assert original == before and {p['id'] for p in final} == {'a', 'b'}
    assert len(reviewed) == 2 and all(p['id'] != 'injected' for p in reviewed[1])
    assert trace['max_revision_rounds'] == trace['revision_rounds'] == 1
    assert [m['kind'] for m in trace['messages']] == ['proposal', 'review', 'revision', 'recheck', 'review_required']
    for previous, current in zip(trace['messages'], trace['messages'][1:]):
        assert current['parent_id'] == previous['id'] and current['source_version'] == 7
    assert trace['teacher_review_required'] and not trace['independent_models']


def test_graph_repair_uses_feedback_and_preserves_edges_evidence_and_teacher_gate(monkeypatch):
    lecture = {'version': 3, 'concepts': [{'id': 'a', 'label': 'Hàm', 'description': 'sai', 'verified': False, 'evidence_ids': ['ev']}],
        'edges': [], 'evidence': [{'id': 'ev', 'text': 'Hàm trả về hai số.', 'valid': True, 'verified': False}]}
    before = deepcopy(lecture['evidence']); calls = []
    def verify(data):
        good = data['concepts'][0]['description'] == 'Hàm trả về hai số.'
        calls.append(good)
        return {'a': {'id': 'a', 'supported': good, 'reason': 'Đối chiếu mô tả với nguồn.'}}
    monkeypatch.setattr(knowledge_ai, 'verify_claims', verify)
    def generate(schema, task, data):
        assert data['challenged_claims'][0]['review']['supported'] is False
        assert data['challenged_claims'][0]['quotes'] == ['Hàm trả về hai số.']
        return schema(revisions=[{'id': 'a', 'label': 'Hàm', 'description': 'Hàm trả về hai số.'}])
    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = graph_collaboration.run(lecture)
    assert calls == [False, True] and result['a']['supported']
    assert lecture['concepts'][0]['description'] == 'Hàm trả về hai số.'
    assert not lecture['concepts'][0]['verified'] and lecture['evidence'] == before


def test_key_point_critic_blocks_missing_checks_and_rechecks_revision(monkeypatch):
    points = [{'id': 'a', 'title': 'Tạo đối tượng và gọi hàm hiển thị',
        'explanation': 'Gọi hàm bằng dấu ngoặc vuông là cách lấy kết quả được trình bày trong bài.',
        'evidence': [{'text': 'nn=SoNgauNhien() print(nn.hienthi2so())', 'id': 'ev'}]}]
    calls = []
    def verify(schema, task, payload):
        claim = payload['claims'][0]; calls.append(claim)
        good = 'ngoặc vuông' not in claim['explanation']
        return schema(checks=[{'id': 'a', 'supported': good, 'reason': 'Dùng lời gọi hàm, không phải ngoặc vuông.'}])
    monkeypatch.setattr(ai_runtime, 'generate_verification', verify)
    monkeypatch.setattr(ai_runtime, 'generate', lambda schema, task, data: schema(points=[{'id': 'a',
        'title': 'Tạo đối tượng rồi gọi hàm để in kết quả',
        'explanation': 'Đoạn mã tạo đối tượng rồi gọi hàm để hiển thị kết quả trong bài tập.'}]))
    final, trace = key_points.collaborate(points, 1)
    assert len(calls) == 2 and len(final) == 1
    assert final[0]['evidence'] == points[0]['evidence']
    assert trace['revision_rounds'] == 1
    monkeypatch.setattr(ai_runtime, 'generate_verification', lambda schema, *args: schema(checks=[]))
    final, trace = key_points.collaborate(points, 1)
    assert final == []
