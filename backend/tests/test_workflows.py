import json
from copy import deepcopy
from pathlib import Path
from .conftest import login, ORIGINAL_PROBE
from app import store, workflows, domain


def post(client, path, headers, data=None):
    response = client.post('/api' + path, headers=headers, json=data or {})
    assert response.status_code == 200, response.text
    return response.json()


def analyzed(client, teacher):
    job = post(client, '/lectures/lec-bfs-dfs/analyze', teacher)
    assert job['status'] == 'needs_review'
    return job


def test_analysis_reuses_current_review_but_never_an_old_version(client):
    teacher = login(client)
    original = analyzed(client, teacher)
    repeated = post(client, '/lectures/lec-bfs-dfs/analyze', teacher)
    assert repeated['id'] == original['id']
    assert repeated['status'] == 'needs_review'
    # A source update may leave an older review gate in the history.
    # That historical job must not prevent analysis of the new lecture version.
    lecture = store.get('lectures', 'lec-bfs-dfs')
    lecture['version'] += 1
    store.put('lectures', lecture)
    fresh = analyzed(client, teacher)
    assert fresh['id'] != original['id']
    assert fresh['input']['version'] == lecture['version']


def test_guided_demo_executes_real_tools_one_checkpoint_at_a_time(client):
    teacher = login(client)
    source_before = deepcopy(store.get('lectures', 'lec-bfs-dfs'))
    copied = post(client, '/lectures/lec-bfs-dfs/guided-demo', teacher)
    lid = copied['lecture']['id']
    assert lid != 'lec-bfs-dfs' and copied['lecture']['guided_demo']
    assert copied['concepts'] == [] and copied['findings'] == [] and copied['jobs'] == []
    job = post(client, f'/lectures/{lid}/analyze', teacher)
    assert job['status'] == 'paused' and job['checkpoint'] == 'perception'
    assert [a['agent'] for a in job['agents']] == ['orchestrator', 'perception']
    assert store.get('lectures', lid)['concepts'] == []
    assert client.post(f'/api/lectures/{lid}/publish', headers=teacher).status_code == 409
    job = post(client, f"/jobs/{job['id']}/control", teacher, {'action': 'resume'})
    assert job['status'] == 'paused' and job['checkpoint'] == 'knowledge'
    assert [a['agent'] for a in job['agents']] == ['orchestrator', 'perception', 'knowledge']
    assert store.get('lectures', lid)['concepts'] and not store.get('lectures', lid)['findings']
    # Results and the checkpoint survive independent workspace reads.
    reloaded = client.get(f'/api/lectures/{lid}', headers=teacher).json()
    assert reloaded['jobs'][0]['checkpoint'] == 'knowledge'
    job = post(client, f"/jobs/{job['id']}/control", teacher, {'action': 'resume'})
    assert job['status'] == 'needs_review'
    assert client.post(f"/api/jobs/{job['id']}/control", headers=teacher, json={'action':'resume'}).status_code == 409
    post(client, f'/lectures/{lid}/review', teacher, {'exclude_unsupported': True, 'note': 'Đã xem nguồn bài thực hành.'})
    finished = client.get('/api/jobs/' + job['id'], headers=teacher).json()
    assert finished['status'] == 'completed'
    post(client, f'/lectures/{lid}/publish', teacher)
    assert store.get('lectures', 'lec-bfs-dfs') == source_before
    student_view = client.get(f'/api/lectures/{lid}', headers=login(client, 'student'))
    assert student_view.status_code == 200
    assert all(concept['verified'] for concept in student_view.json()['concepts'])
    assert client.post('/api/lectures/lec-published/guided-demo', headers=login(client, 'student')).status_code == 403
    assert client.post('/api/lectures/lec-bfs-dfs/guided-demo', headers=login(client, 'admin')).status_code == 403


def publish_fixture(client, teacher):
    job = analyzed(client, teacher)
    post(client, '/lectures/lec-bfs-dfs/review', teacher, {'exclude_unsupported': True, 'note': 'Xác nhận nguồn mẫu, loại phần không có nguồn.'})
    current = client.get('/api/jobs/' + job['id'], headers=teacher).json()
    assert current['status'] == 'completed', current
    post(client, '/lectures/lec-bfs-dfs/publish', teacher)
    return job


def test_role_ownership_and_private_drafts(client):
    student = login(client, 'student')
    teacher2 = login(client, 'teacher2')
    admin = login(client, 'admin')
    assert client.get('/api/lectures/lec-bfs-dfs', headers=student).status_code == 403
    assert client.post('/api/lectures/lec-bfs-dfs/analyze', headers=teacher2).status_code == 403
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=admin).status_code == 403
    assert client.post('/api/lectures/lec-bfs-dfs/review', headers=admin, json={'exclude_unsupported': True, 'note': 'Admin thử duyệt'}).status_code == 403
    assert client.get('/api/admin/users', headers=student).status_code == 403
    bootstrap = client.get('/api/bootstrap', headers=student).json()
    assert [l['id'] for l in bootstrap['lectures']] == ['lec-published']
    assert {a['id'] for a in bootstrap['agents']} == {'orchestrator','perception','knowledge','verification','pedagogical','planning','tutor','assessment'}


def test_real_tool_contracts_and_review_gate(client):
    teacher = login(client)
    job = analyzed(client, teacher)
    assert [a['agent'] for a in job['agents']] == ['orchestrator', 'perception', 'knowledge', 'verification']
    assert job['agents'][-1]['status'] == 'needs_review'
    assert all(a['tools'] and a['duration_ms'] >= 0 and a['output']['mode'] == 'rule_based' for a in job['agents'])
    assert client.post('/api/jobs/' + job['id'] + '/control', headers=teacher, json={'action': 'resume'}).status_code == 409
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=teacher).status_code == 409
    assert client.post('/api/lectures/lec-bfs-dfs/findings/finding-extension/decision', headers=teacher, json={'decision': 'confirm'}).status_code == 422
    assert client.post('/api/lectures/lec-bfs-dfs/findings/finding-extension/decision', headers=teacher, json={'decision': 'reject'}).status_code == 422
    post(client, '/lectures/lec-bfs-dfs/review', teacher, {'exclude_unsupported': True, 'note': 'Nguồn đã xem; loại phần không có bằng chứng.'})
    current = client.get('/api/jobs/' + job['id'], headers=teacher).json()
    assert current['status'] == 'completed'
    assert current['agents'][-1]['agent'] == 'pedagogical'
    assert current['progress'] == 100
    post(client, '/lectures/lec-bfs-dfs/publish', teacher)
    data = client.get('/api/lectures/lec-bfs-dfs', headers=login(client, 'student')).json()
    assert all(c['verified'] for c in data['concepts'])
    assert all(e['verified'] for e in data['evidence'] if e['valid'])
    assert data['twin']['observed']['open_findings'] == 0


def test_graph_search_and_tutor_verified_sources(client):
    student = login(client, 'student')
    graph = client.get('/api/lectures/lec-published/graph?q=DFS', headers=student).json()
    assert graph['nodes'] and all('dfs' in (n['label'] + n['description']).lower() for n in graph['nodes'])
    tutor = post(client, '/lectures/lec-published/tutor', student, {'question': 'DFS dùng ngăn xếp như thế nào?'})
    assert tutor['status'] == 'completed'
    assert [a['agent'] for a in tutor['agents']] == ['orchestrator','knowledge','tutor','verification']
    assert tutor['result']['citations']
    assert all(e['verified'] and e['valid'] and e['end'] <= 1109 and e['source_type'] == 'youtube_caption_annotation' for e in tutor['result']['citations'])
    outside = post(client, '/lectures/lec-published/tutor', student, {'question': 'Lập kế hoạch du lịch cho tôi'})
    assert outside['result']['citations'] == []
    assert 'Chưa có nguồn' in outside['result']['answer']
    other = login(client, 'student2')
    assert client.get('/api/jobs/' + tutor['id'], headers=other).status_code == 403
    admin = login(client, 'admin')
    admin_job = client.get('/api/jobs/' + tutor['id'], headers=admin).json()
    assert admin_job['result'] is None and 'redacted' in admin_job['input']


def test_assessment_approval_grading_privacy_and_evaluated_state(client):
    teacher = login(client)
    generated = post(client, '/lectures/lec-published/assessments/generate', teacher)
    aid = generated['result']['assessment_id']
    student = login(client, 'student')
    assert client.post('/api/assessments/' + aid + '/submit', headers=student, json={'answers': {}}).status_code == 403
    assert client.post('/api/assessments/' + aid + '/publish', headers=login(client, 'admin')).status_code == 403
    post(client, '/assessments/' + aid + '/publish', teacher)
    data = client.get('/api/lectures/lec-published', headers=student).json()
    questions = data['assessments'][0]['questions']
    assert all('correct_option_id' not in q and 'explanation' not in q for q in questions)
    answers = {'q-bfs':'a', 'q-dfs':'a', 'q-visited':'b'}
    attempt = post(client, '/assessments/' + aid + '/submit', student, {'answers': answers})
    assert attempt['score'] == 100 and attempt['correct_count'] == 3
    own = client.get('/api/lectures/lec-published/analytics', headers=student).json()
    other = client.get('/api/lectures/lec-published/analytics', headers=login(client, 'student2')).json()
    assert own['attempt_count'] == 1 and other['attempt_count'] == 0
    twin = client.get('/api/lectures/lec-published', headers=teacher).json()['twin']
    assert twin['evaluated']['attempt_count'] == 1
    assert any(s['event'] == 'evaluated' for s in twin['snapshots'])


def test_scenario_arithmetic_isolation_and_versioned_publication(client):
    teacher = login(client)
    student = login(client, 'student')
    before = client.get('/api/lectures/lec-published', headers=student).json()
    job = post(client, '/lectures/lec-published/scenarios', teacher, {'request':'Thêm 10 phút thực hành DFS, giữ tổng thời gian.', 'add_practice_minutes':10, 'total_limit':50})
    comparison = job['result']['comparison']
    assert comparison['feasible'] and comparison['baseline_total'] == comparison['scenario_total'] == 50
    assert comparison['practice_delta'] == 10
    assert not any('score' in key for key in comparison)
    unchanged = client.get('/api/lectures/lec-published', headers=teacher).json()
    assert unchanged['planned'] == before['planned']
    post(client, '/scenarios/' + job['result']['scenario_id'] + '/create-version', teacher)
    new = client.get('/api/lectures/lec-published', headers=teacher).json()
    public = client.get('/api/lectures/lec-published', headers=student).json()
    assert new['lecture']['version'] == 2 and new['lecture']['published_version'] == 1
    assert public['lecture']['version'] == 1 and public['planned'] == before['planned']
    bad = domain.evaluate_scenario(store.get('lectures','lec-bfs-dfs'), 60, 50)
    assert not bad['feasible'] and bad['violations']


def test_upload_invalid_and_new_video_cannot_inherit_sample_annotations(client):
    teacher = login(client)
    bad = client.post('/api/lectures/lec-bfs-dfs/assets', headers=teacher, data={'kind':'video'}, files={'file':('bad.exe',b'x','application/octet-stream')})
    assert bad.status_code == 422
    video = store.DATA / 'media' / 'sample-lecture.mp4'
    response = client.post('/api/lectures/lec-bfs-dfs/assets', headers=teacher, data={'kind':'video'}, files={'file':('custom.mp4',video.read_bytes(),'video/mp4')})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data['transcript'] == [] and data['slides'] == [] and not data['lecture']['sample_attached']
    job = post(client, '/lectures/lec-bfs-dfs/analyze', teacher)
    assert job['status'] == 'needs_review'
    assert store.get('lectures','lec-bfs-dfs')['concepts'] == []
    assert any(f['id'] == 'finding-provider' for f in store.get('lectures','lec-bfs-dfs')['findings'])


def test_real_media_metadata_frames_and_http_range(client):
    lecture = store.get('lectures','lec-published')
    source = ORIGINAL_PROBE(lecture)
    assert source['status'] == 'reference_only' and source['duration_seconds'] == 1109
    assert source['asr'] == source['vision'] == 'not_run' and source['annotation_count'] == 8
    local = deepcopy(lecture)
    local['sample_attached'] = False
    local['assets'] = [a for a in local['assets'] if a.get('source_type') != 'youtube_reference']
    report = ORIGINAL_PROBE(local)
    assert len(report['keyframes']) == 3 and report['asr'] == report['vision'] == 'unavailable'
    # Exercise the actual FFmpeg tool, not the stub used by orchestration unit tests.
    import subprocess
    path = store.DATA / 'media' / 'sample-lecture.mp4'
    metadata = subprocess.run(['ffprobe','-v','quiet','-show_format','-of','json',str(path)],capture_output=True,text=True,check=True)
    assert 49.9 <= float(json.loads(metadata.stdout)['format']['duration']) <= 50.1
    student = login(client, 'student')
    response = client.get('/api/lectures/lec-published/video', headers={**student,'Range':'bytes=0-99'})
    assert response.status_code == 206 and len(response.content) == 100
    assert response.headers['content-type'] == 'video/mp4'


def test_pause_cancel_and_no_review_bypass(client):
    teacher = login(client)
    lecture = store.get('lectures','lec-bfs-dfs')
    job = workflows.create_job(store.get('users','teacher'), lecture, 'analysis', run_async=False)
    post(client, '/jobs/' + job['id'] + '/control', teacher, {'action':'cancel'})
    assert client.get('/api/jobs/' + job['id'], headers=teacher).json()['status'] == 'cancelled'
    assert client.post('/api/jobs/' + job['id'] + '/control', headers=teacher, json={'action':'resume'}).status_code == 409
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=teacher).status_code == 409


def test_account_disable_invalidates_session_and_demo_can_be_disabled(client, monkeypatch):
    student = login(client, 'student')
    admin = login(client, 'admin')
    response = client.patch('/api/admin/users/student', headers=admin, json={'is_active':False})
    assert response.status_code == 200
    assert client.get('/api/auth/me', headers=student).status_code == 401
    assert client.patch('/api/admin/users/admin', headers=admin, json={'is_active':False}).status_code == 409
    import app.main as main
    monkeypatch.setattr(main, 'DEMO_MODE', False)
    assert client.post('/api/auth/demo-login', json={'role':'admin'}).status_code == 404


def test_paused_queue_requires_resume_and_published_tutor_uses_published_version(client, monkeypatch):
    teacher = login(client)
    monkeypatch.setattr(workflows, 'schedule', lambda jid: None)
    queued = post(client, '/lectures/lec-bfs-dfs/analyze', teacher)
    assert queued['status'] == 'queued'
    paused = post(client, '/jobs/' + queued['id'] + '/control', teacher, {'action':'pause'})
    assert paused['status'] == 'paused'
    workflows.execute(queued['id'])
    assert store.get('jobs', queued['id'])['status'] == 'paused'
    monkeypatch.setattr(workflows, 'schedule', lambda jid: workflows.execute(jid))
    resumed = post(client, '/jobs/' + queued['id'] + '/control', teacher, {'action':'resume'})
    assert resumed['status'] == 'needs_review'
    public = store.get('lectures','lec-published')
    public['version'] = 2
    store.put('lectures', public)
    job = post(client, '/lectures/lec-published/tutor', login(client,'student'), {'question':'BFS là gì?'})
    assert job['input']['version'] == 1
    assert job['status'] == 'completed'


def test_teacher_edits_remain_draft_and_reopen_evidence_review(client):
    teacher = login(client)
    admin = login(client, 'admin')
    path = '/api/lectures/lec-bfs-dfs'
    assert client.patch(path, headers=admin, json={'title': 'Admin cannot edit'}).status_code == 403
    assert client.patch(path, headers=teacher, json={'objectives': [' ']}).status_code == 422
    response = client.patch(path, headers=teacher, json={'title': 'BFS và DFS — phiên bản thực hành', 'objectives': ['So sánh BFS và DFS']})
    assert response.status_code == 200 and response.json()['objectives'] == ['So sánh BFS và DFS']
    job = analyzed(client, teacher)
    cid = client.get(path, headers=teacher).json()['concepts'][0]['id']
    edit = {'label': 'Đồ thị có đánh dấu', 'description': 'Nội dung giảng viên chỉnh sửa và cần đối chiếu nguồn.'}
    assert client.patch(path + '/concepts/' + cid, headers=admin, json=edit).status_code == 403
    changed = client.patch(path + '/concepts/' + cid, headers=teacher, json=edit)
    assert changed.status_code == 200
    concept = next(c for c in changed.json()['concepts'] if c['id'] == cid)
    assert concept['label'] == edit['label'] and not concept['verified']
    assert client.post(path + '/publish', headers=teacher).status_code == 409
    post(client, '/lectures/lec-bfs-dfs/review', teacher, {'exclude_unsupported': True, 'note': 'Giảng viên đã đối chiếu nội dung chỉnh sửa.'})
    assert client.get('/api/jobs/' + job['id'], headers=teacher).json()['status'] == 'completed'
    post(client, '/lectures/lec-bfs-dfs/publish', teacher)
    assert client.patch(path, headers=teacher, json={'title': 'Must create a draft first'}).status_code == 409


def test_objective_change_reports_that_ai_output_needs_reprocessing(client):
    teacher = login(client)
    job = analyzed(client, teacher)
    post(client, '/lectures/lec-bfs-dfs/review', teacher, {'exclude_unsupported': True, 'note': 'Đã kiểm tra nguồn trước khi sửa mục tiêu.'})
    assert client.get('/api/jobs/' + job['id'], headers=teacher).json()['status'] == 'completed'
    current = client.get('/api/lectures/lec-bfs-dfs', headers=teacher).json()
    assert current['lecture']['analysis_current'] is True
    edited = client.patch('/api/lectures/lec-bfs-dfs', headers=teacher, json={'objectives': ['Đối chiếu hàng đợi và ngăn xếp']})
    assert edited.status_code == 200 and edited.json()['analysis_current'] is False
    assert client.post('/api/lectures/lec-bfs-dfs/publish', headers=teacher).status_code == 409
