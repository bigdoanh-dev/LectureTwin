from .conftest import login


def test_admin_account_assignment_and_status_contract(client):
    admin = login(client, 'admin')
    body = {'username': 'admin_ui_learner', 'full_name': 'Học viên kiểm thử', 'password': 'local-test-password', 'role': 'student', 'course_ids': ['course-algo']}
    response = client.post('/api/admin/users', headers=admin, json=body)
    assert response.status_code == 200, response.text
    user = response.json()
    assert user['role'] == 'student' and user['is_active']
    assert user['course_ids'] == ['course-algo']
    assert 'password' not in user and 'password_hash' not in user
    assert client.post('/api/admin/users', headers=admin, json=body).status_code == 409
    assert client.post('/api/admin/users', headers=admin, json={**body, 'username': 'invalid_course', 'course_ids': ['invented']}).status_code == 422

    path = '/api/admin/users/' + user['id']
    updated = client.patch(path, headers=admin, json={'course_ids': ['course-other'], 'is_active': False})
    assert updated.status_code == 200
    assert updated.json()['course_ids'] == ['course-other'] and not updated.json()['is_active']
    assert client.patch(path, headers=admin, json={'is_active': True, 'course_ids': []}).json()['course_ids'] == []
    assert client.patch('/api/admin/users/admin', headers=admin, json={'is_active': False}).status_code == 409
    actions = [entry['action'] for entry in client.get('/api/admin/monitoring', headers=admin).json()['audit']]
    assert 'CREATE_USER' in actions and 'UPDATE_USER' in actions


def test_admin_monitoring_excludes_private_tutor_content_and_non_admins(client):
    student = login(client, 'student')
    response = client.post('/api/lectures/lec-published/tutor', headers=student, json={'question': 'BFS dùng hàng đợi FIFO thế nào? private-admin-qa-marker'})
    assert response.status_code == 200, response.text
    job_id = response.json()['id']
    admin = login(client, 'admin')
    monitoring = client.get('/api/admin/monitoring', headers=admin)
    assert monitoring.status_code == 200
    assert 'private-admin-qa-marker' not in monitoring.text
    job = next(job for job in monitoring.json()['jobs'] if job['id'] == job_id)
    assert job['result'] is None and job['input'].get('redacted')
    assert all(agent['input'] == {} and agent['output'] == {} and agent['tools'] == [] for agent in job['agents'])
    assert monitoring.json()['metrics']['model_calls'] == 0
    assert monitoring.json()['metrics']['tokens'] is None
    for role in ['teacher', 'student']:
        headers = login(client, role)
        assert client.get('/api/admin/users', headers=headers).status_code == 403
        assert client.get('/api/admin/monitoring', headers=headers).status_code == 403
