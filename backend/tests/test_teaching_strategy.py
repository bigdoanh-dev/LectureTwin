from copy import deepcopy
from app import store, learner_twin
from .conftest import login


def setup_quiz(client, teacher):
    generated = client.post('/api/lectures/lec-published/assessments/generate', headers=teacher).json()
    assert generated['status'] == 'completed', generated
    aid = generated['result']['assessment_id']
    assert client.post(f'/api/assessments/{aid}/publish', headers=teacher).status_code == 200
    quiz = store.get('assessments', aid)
    return quiz


def wrong_answers(quiz):
    return {q['id']: next(o['id'] for o in q['options'] if o['id'] != q['correct_option_id']) for q in quiz['questions']}


def test_submission_twin_teacher_decision_and_adaptive_context_end_to_end(client):
    teacher, student = login(client), login(client, 'student')
    quiz = setup_quiz(client, teacher)
    response = client.post(f"/api/assessments/{quiz['id']}/submit", headers=student, json={'answers': wrong_answers(quiz)})
    assert response.status_code == 200, response.text
    ws = client.get('/api/lectures/lec-published', headers=teacher).json()
    state = ws['twin']['learner']
    assert state['status'] == 'observed' and state['observed']['incorrect'] > 0
    assert store.get('learner_states', state['state_id'])['source_version'] == ws['lecture']['published_version']
    proposal = state['adaptive_proposals'][0]
    publication_before = deepcopy(store.get('lectures', 'lec-published')['published_payload'])
    path = f"/api/lectures/lec-published/teaching-proposals/{proposal['id']}/decision"
    body = {'decision': 'confirm', 'note': 'Đã kiểm tra nguồn, cho phép ôn lại.', 'state_id': state['state_id']}
    for role in ('admin', 'student', 'teacher2'):
        assert client.post(path, headers=login(client, role), json=body).status_code == 403
    assert client.post(path, headers=teacher, json={**body, 'state_id': '0' * 64}).status_code == 409
    accepted = client.post(path, headers=teacher, json=body)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()['twin']['learner']['approved_strategy']
    assert client.post(path, headers=teacher, json=body).status_code == 409
    lecture = store.get('lectures', 'lec-published')
    assert lecture['published_payload'] == publication_before
    context = learner_twin.tutor_context(lecture, {'id': 'student', 'role': 'student'})
    assert context and 'supporting_attempt_ids' not in str(context)
    personal = client.get('/api/lectures/lec-published', headers=student).json()['twin']['learner']
    assert personal['scope'] == 'self' and personal['reviewed_proposals'] == []
    # A new answer makes the old class approval stale; it cannot silently follow a changed state.
    correct = {q['id']: q['correct_option_id'] for q in quiz['questions']}
    assert client.post(f"/api/assessments/{quiz['id']}/submit", headers=student, json={'answers': correct}).status_code == 200
    assert not learner_twin.tutor_context(lecture, {'id': 'student', 'role': 'student'})
    assert client.post(path, headers=teacher, json=body).status_code == 409


def test_no_student_observations_means_no_synthetic_strategy(client):
    teacher = login(client)
    state = client.get('/api/lectures/lec-published', headers=teacher).json()['twin']['learner']
    assert state['status'] == 'insufficient_data' and state['adaptive_proposals'] == []
    assert client.get('/api/lectures/lec-published', headers=login(client, 'admin')).json()['twin']['learner']['status'] == 'unavailable'
