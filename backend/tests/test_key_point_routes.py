from copy import deepcopy
from app import store, domain
from .conftest import login


def test_teacher_summary_does_not_replace_reviewed_graph_or_enter_publication(client, monkeypatch):
    from app import key_points
    teacher = login(client)
    original = store.get('lectures', 'lec-bfs-dfs')
    original['concepts'] = [{'id': 'edited', 'label': 'Giảng viên đã chỉnh', 'description': 'Nội dung đã chỉnh.', 'verified': True, 'evidence_ids': []}]
    store.put('lectures', original)
    summary = {'status': 'draft', 'source_version': original['version'], 'points': [], 'limitations': []}
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    monkeypatch.setattr(key_points, 'generate', lambda lecture: deepcopy(summary))
    response = client.post('/api/lectures/lec-bfs-dfs/key-points', headers=teacher)
    assert response.status_code == 200, response.text
    assert response.json()['key_points'] == summary
    current = store.get('lectures', 'lec-bfs-dfs')
    assert current['concepts'] == original['concepts']
    assert current['findings'] == original['findings']
    assert 'key_points' not in domain.publication_payload(current)
    for role in ('student', 'admin', 'teacher2'):
        assert client.post('/api/lectures/lec-bfs-dfs/key-points', headers=login(client, role)).status_code == 403
    admin_view = client.get('/api/lectures/lec-bfs-dfs', headers=login(client, 'admin')).json()
    assert admin_view['key_points'] is None
    reset = client.post('/api/lectures/lec-bfs-dfs/sample', headers=teacher)
    assert reset.status_code == 200 and reset.json()['key_points'] is None


def test_summary_version_race_rejects_stale_result(client, monkeypatch):
    from app import key_points
    teacher = login(client)
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    def changed_source(lecture):
        newer = store.get('lectures', lecture['id'])
        newer['version'] += 1
        store.put('lectures', newer)
        return {'status': 'draft', 'source_version': lecture['version'], 'points': [], 'limitations': []}
    monkeypatch.setattr(key_points, 'generate', changed_source)
    response = client.post('/api/lectures/lec-bfs-dfs/key-points', headers=teacher)
    assert response.status_code == 409
    assert store.get('lectures', 'lec-bfs-dfs').get('key_points') is None


def test_source_replacement_at_same_version_rejects_stale_summary(client, monkeypatch):
    from app import key_points
    teacher = login(client)
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    def changed_source(lecture):
        newer = store.get('lectures', lecture['id'])
        newer['transcript'] = [{'text': 'Nguồn mới hoàn toàn.', 'start': 0, 'end': 3}]
        store.put('lectures', newer)
        return {'status': 'draft', 'source_version': lecture['version'], 'points': [], 'limitations': []}
    monkeypatch.setattr(key_points, 'generate', changed_source)
    assert client.post('/api/lectures/lec-bfs-dfs/key-points', headers=teacher).status_code == 409
    assert store.get('lectures', 'lec-bfs-dfs').get('key_points') is None
