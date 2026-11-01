"""CLO suggestions and teacher review for arbitrary uploaded lecture concepts."""
from copy import deepcopy
from app import research, store
from .conftest import login
from .test_workflows import publish_fixture

CID = 'concept-python-module-uploaded'
TITLE = 'Tổ chức mã thành những phần tái sử dụng'


def local_lecture(client):
    teacher = login(client)
    publish_fixture(client, teacher)
    lecture = store.get('lectures', 'lec-bfs-dfs')
    lecture.update(knowledge_method='local_llm', objectives=[TITLE], objective_mappings={},
        concepts=[{'id': CID, 'label': 'Mô đun Python', 'description': 'Tệp mã tái sử dụng', 'verified': True,
            'evidence_ids': ['source-python']}], edges=[], findings=[],
        evidence=[{'id': 'source-python', 'concept_id': CID, 'text': 'Một mô đun là một tệp Python.',
            'kind': 'transcript', 'start': 0, 'end': 10, 'valid': True, 'verified': True}],
        coverage=[{'objective': TITLE, 'evidence_concepts': [CID, CID, 'invented-concept'],
            'status': 'needs_manual_mapping', 'note': 'Đề xuất AI, chờ giảng viên.'}])
    store.put('lectures', lecture)
    return teacher, lecture


def test_saved_llm_coverage_is_filtered_suggestion_not_teacher_confirmation(client):
    teacher, lecture = local_lecture(client)
    result = research.view(lecture, {'id': 'teacher', 'role': 'teacher'})
    objective = result['objectives'][0]
    assert objective['expected_concept_ids'] == [CID]
    assert objective['found_concept_ids'] == [CID]
    assert objective['suggestion_method'] == 'local_llm'
    assert objective['status'] == 'suggested' and objective['confirmed_concept_ids'] == []
    assert result['concepts'][0]['objective_ids'] == []
    assert any('AI đề xuất' in signal['description'] for signal in result['signals'])
    lecture['analysis_version'] = lecture['version'] - 1
    objective = research.view(lecture, {'id': 'teacher', 'role': 'teacher'})['objectives'][0]
    assert objective['expected_concept_ids'] == []  # Stale LLM coverage cannot supply current links.
    assert objective['status'] != 'confirmed' and objective['suggestion_method'] == 'lexical'


def test_teacher_can_confirm_arbitrary_uploaded_id_with_version_and_source_gates(client):
    teacher, lecture = local_lecture(client)
    before = deepcopy(lecture['published_payload'])
    url = '/api/lectures/lec-bfs-dfs/objectives/clo-1/mapping'
    body = {'version': lecture['version'], 'concept_ids': [CID], 'expected_concept_ids': [CID]}
    assert client.put(url, headers=login(client, 'student'), json=body).status_code == 403
    assert client.put(url, headers=login(client, 'admin'), json=body).status_code == 403
    assert client.put(url, headers=teacher, json={**body, 'version': 99}).status_code == 409
    assert client.put(url, headers=teacher, json={**body, 'expected_concept_ids': ['bfs']}).status_code == 422
    response = client.put(url, headers=teacher, json=body)
    assert response.status_code == 200, response.text
    objective = response.json()['research']['objectives'][0]
    assert objective['confirmed_concept_ids'] == [CID] and objective['status'] == 'confirmed'
    assert objective['suggestion_method'] == 'teacher_mapping'
    current = store.get('lectures', lecture['id'])
    assert current['published_payload'] == before
    current['version'] += 1
    store.put('lectures', current)
    objective = research.view(current, {'id': 'teacher', 'role': 'teacher'})['objectives'][0]
    assert objective['status'] != 'confirmed' and objective['confirmed_concept_ids'] == []


def test_uploaded_clo_mapping_rejects_unreviewed_source(client):
    teacher, lecture = local_lecture(client)
    url = '/api/lectures/lec-bfs-dfs/objectives/clo-1/mapping'
    body = {'version': lecture['version'], 'concept_ids': [CID], 'expected_concept_ids': [CID]}
    lecture['evidence'][0]['verified'] = False
    store.put('lectures', lecture)
    assert client.put(url, headers=teacher, json=body).status_code == 422
    lecture['evidence'][0]['verified'] = True
    lecture['concepts'][0]['verified'] = False
    store.put('lectures', lecture)
    assert client.put(url, headers=teacher, json=body).status_code == 409
