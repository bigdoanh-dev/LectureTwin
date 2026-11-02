import json
from copy import deepcopy
import pytest
from app import ai_runtime, knowledge_ai, store, workflows, key_points, graph_collaboration
from .conftest import login

SOURCE = 'Module là một tệp Python chứa các hàm. Lệnh import sử dụng các hàm trong module.'


def local_ai(monkeypatch, flagged=False):
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    monkeypatch.setattr(key_points, 'generate', lambda lecture: {'status': 'draft', 'source_version': lecture['version'], 'points': [], 'limitations': []})
    def generate(schema, task, data):
        if schema is knowledge_ai.GraphBatch:
            sid = data['sources'][0]['id']
            return schema.model_validate({'concepts': [
                {'key': 'module', 'label': 'Module Python', 'description': 'Tệp chứa các hàm Python.', 'references': [{'source_id': sid, 'quote': 'Module là một tệp Python chứa các hàm.'}]},
                {'key': 'import', 'label': 'Lệnh import', 'description': 'Sử dụng các hàm trong module.', 'references': [{'source_id': sid, 'quote': 'Lệnh import sử dụng các hàm trong module.'}]}],
                'relations': [{'source': 'import', 'target': 'module', 'type': 'uses', 'label': 'sử dụng',
                    'references': [{'source_id': sid, 'quote': 'Lệnh import sử dụng các hàm trong module.'}]}]})
        if schema is knowledge_ai.Verification:
            return schema.model_validate({'checks': [{'id': c['id'], 'supported': not flagged, 'reason': 'Đối chiếu nguồn thử nghiệm.'} for c in data['claims']]})
        if schema is knowledge_ai.ObjectiveMapping:
            return schema.model_validate({'links': [{'objective': obj, 'concept_ids': [], 'explanation': 'Cần giảng viên đối chiếu.'} for obj in data['objectives']]})
        if schema is graph_collaboration.Revisions:
            return schema(revisions=[])
        raise AssertionError(schema)
    monkeypatch.setattr(ai_runtime, 'generate', generate)


def upload_text(client, teacher, text=SOURCE):
    response = client.post('/api/lectures/lec-bfs-dfs/assets', headers=teacher, data={'kind': 'slides'},
        files={'file': ('module.txt', text.encode(), 'text/plain')})
    assert response.status_code == 200, response.text
    return response.json()


def test_upload_to_generated_graph_requires_concept_and_relation_review(client, monkeypatch):
    teacher = login(client)
    local_ai(monkeypatch)
    uploaded = upload_text(client, teacher)
    assert not uploaded['lecture']['sample_attached']
    job = client.post('/api/lectures/lec-bfs-dfs/analyze', headers=teacher, json={}).json()
    assert job['status'] == 'needs_review', job
    graph = client.get('/api/lectures/lec-bfs-dfs/graph', headers=teacher).json()
    assert {c['label'] for c in graph['nodes']} == {'Module Python', 'Lệnh import'}
    assert len(graph['edges']) == 1 and graph['edges'][0]['evidence_ids']
    assert all(e['text'] in SOURCE and e['source_version'] == uploaded['lecture']['version'] for e in graph['evidence'])
    assert all(e['slide_page'] is None and e['start'] is None for e in graph['evidence'])
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=teacher).status_code == 409
    assert client.get('/api/lectures/lec-bfs-dfs/graph', headers=login(client, 'student')).status_code == 403
    findings = store.get('lectures', 'lec-bfs-dfs')['findings']
    edge_finding = next(f for f in findings if f.get('edge_id'))
    for finding in findings:
        decision = 'reject' if finding is edge_finding else 'confirm'
        response = client.post(f"/api/lectures/lec-bfs-dfs/findings/{finding['id']}/decision", headers=teacher,
            json={'decision': decision, 'note': 'Đã đối chiếu nguồn; không dùng quan hệ này.'})
        assert response.status_code == 200, response.text
    finished = client.get('/api/jobs/' + job['id'], headers=teacher).json()
    assert finished['status'] == 'completed', finished
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=teacher).status_code == 200
    published = client.get('/api/lectures/lec-bfs-dfs/graph', headers=login(client, 'student')).json()
    assert len(published['nodes']) == 2 and published['edges'] == []
    assert not any(e.get('edge_id') for e in published['evidence'])
    assert client.get('/api/lectures/lec-bfs-dfs', headers=login(client, 'student')).json()['findings'] == []


def test_model_flags_cannot_be_bulk_approved(client, monkeypatch):
    teacher = login(client)
    local_ai(monkeypatch, flagged=True)
    upload_text(client, teacher)
    job = client.post('/api/lectures/lec-bfs-dfs/analyze', headers=teacher, json={}).json()
    response = client.post('/api/lectures/lec-bfs-dfs/review', headers=teacher,
        json={'exclude_unsupported': True, 'note': 'Đọc và duyệt các ý không bị gắn cờ.'})
    assert response.status_code == 200
    assert client.get('/api/jobs/' + job['id'], headers=teacher).json()['status'] == 'needs_review'
    finding = response.json()['findings'][0]
    assert finding['status'] == 'pending' and finding['requires_individual_review']
    path = f"/api/lectures/lec-bfs-dfs/findings/{finding['id']}/decision"
    assert client.post(path, headers=teacher, json={'decision': 'confirm'}).status_code == 422
    assert client.post(path, headers=teacher, json={'decision': 'confirm', 'note': 'Đã đối chiếu nội dung nguồn.'}).status_code == 200


def test_fabricated_quote_or_source_never_enters_graph(client, monkeypatch):
    teacher = login(client)
    local_ai(monkeypatch)
    upload_text(client, teacher)
    real = ai_runtime.generate
    def fabricated(schema, task, data):
        response = real(schema, task, data)
        if schema is knowledge_ai.GraphBatch:
            response.concepts[0].references[0].quote = 'Không có câu này trong nguồn'
            response.concepts[1].references[0].source_id = 'invented-source'
        return response
    monkeypatch.setattr(ai_runtime, 'generate', fabricated)
    job = client.post('/api/lectures/lec-bfs-dfs/analyze', headers=teacher, json={}).json()
    lecture = store.get('lectures', 'lec-bfs-dfs')
    assert lecture['concepts'] == [] and lecture['edges'] == [] and lecture['evidence'] == []
    assert lecture['extraction_report']['rejected_unsupported'] == 3
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=teacher).status_code == 409


def test_provider_failure_is_visible_without_sample_substitution(client, monkeypatch):
    teacher = login(client)
    local_ai(monkeypatch)
    upload_text(client, teacher)
    def fail(*args, **kwargs):
        raise ai_runtime.ProviderUnavailable('Mô hình chưa sẵn sàng')
    monkeypatch.setattr(ai_runtime, 'generate', fail)
    job = client.post('/api/lectures/lec-bfs-dfs/analyze', headers=teacher, json={}).json()
    assert job['status'] == 'failed' and 'chưa sẵn sàng' in job['error']
    assert store.get('lectures', 'lec-bfs-dfs')['concepts'] == []


def test_tutor_retrieves_only_verified_source_and_rejects_invented_citation(monkeypatch):
    local_ai(monkeypatch)
    lecture = {'evidence': [
        {'id': 'ok', 'text': SOURCE, 'verified': True, 'valid': True, 'concept_id': 'module'},
        {'id': 'draft', 'text': 'Đáp án bí mật chưa phát hành', 'verified': False, 'valid': True, 'concept_id': 'module'}], 'edges': []}
    received = []
    def embed(texts):
        received.extend(texts)
        return [[1, 0] for _ in texts]
    monkeypatch.setattr(ai_runtime, 'embeddings', embed)
    citations, retrieval = knowledge_ai.retrieve(lecture, 'Module là gì?')
    assert [e['id'] for e in citations] == ['ok']
    assert not any('bí mật' in text for text in received)
    monkeypatch.setattr(ai_runtime, 'generate', lambda *a, **k: knowledge_ai.TutorAnswer(
        answer='Nội dung sai', evidence_ids=['invented'], insufficient_source=False))
    result = knowledge_ai.answer(lecture, 'Module là gì?', citations)
    assert result['citations'] == [] and result['method'] == 'source_abstention'


def test_long_sources_are_partitioned_completely_and_not_silently_truncated():
    text = 'module ' * 6000
    rows = knowledge_ai.source_segments({'version': 3, 'assets': [{'id': 'doc', 'kind': 'slides'}],
        'slides': [{'page': 7, 'text': text}]})
    assert len(rows) > 10 and rows[-1]['text'].endswith(text.strip()[-100:])
    assert all(r['asset_id'] == 'doc' and r['page'] == 7 and r['version'] == 3 for r in rows)


def test_media_ocr_keeps_real_frame_timestamp_without_fake_slide_page():
    rows = knowledge_ai.source_segments({'version': 1, 'slides': [{'page': 1, 'text': 'import random',
        'frame_timestamp': 12.5, 'source_type': 'sampled_frame_ocr', 'asset_id': 'video'}]})
    assert rows[0]['kind'] == 'video' and rows[0]['start'] == 12.5
    assert rows[0]['page'] is None and rows[0]['end'] is None


def test_document_download_checks_owner_and_published_snapshot(client):
    teacher = login(client)
    uploaded = upload_text(client, teacher)
    url = uploaded['assets'][0]['url']
    assert client.get(url, headers=teacher).content.decode() == SOURCE
    assert client.get(url, headers=login(client, 'teacher2')).status_code == 403
    assert client.get(url, headers=login(client, 'student')).status_code == 403
