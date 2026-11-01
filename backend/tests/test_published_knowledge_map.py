from copy import deepcopy
from .conftest import login
from .test_workflows import post, analyzed
from app import store


def test_learner_receives_approved_graph_after_publication_and_keeps_snapshot(client):
    teacher = login(client)
    student = login(client, 'student')
    path = '/api/lectures/lec-bfs-dfs'
    analyzed(client, teacher)
    assert client.get(path + '/graph', headers=student).status_code == 403
    post(client, '/lectures/lec-bfs-dfs/review', teacher, {
        'exclude_unsupported': True, 'note': 'Đối chiếu nguồn để xuất bản bản đồ kiến thức.'})
    reviewed = client.get(path + '/graph', headers=teacher).json()
    assert reviewed['nodes'] and reviewed['edges']
    assert client.get(path + '/graph', headers=student).status_code == 403
    post(client, '/lectures/lec-bfs-dfs/publish', teacher)
    published = client.get(path + '/graph', headers=student).json()
    assert published == reviewed
    workspace = client.get(path, headers=student).json()
    assert workspace['concepts'] == published['nodes']
    assert workspace['edges'] == published['edges']
    ids = {node['id'] for node in published['nodes']}
    assert all(node['verified'] for node in published['nodes'])
    assert all(edge['source'] in ids and edge['target'] in ids for edge in published['edges'])
    assert all(e['valid'] and e['verified'] for e in published['evidence'])
    assert 'unsupported-extension' not in ids

    draft = deepcopy(store.get('lectures', 'lec-bfs-dfs'))
    draft['version'] += 1
    draft['status'] = 'draft_changes'
    draft['concepts'][0]['label'] = 'Private next-version map label'
    draft['concepts'][0]['verified'] = False
    draft['edges'] = []
    store.put('lectures', draft)
    assert client.get(path + '/graph', headers=student).json() == published
    assert client.get(path + '/graph', headers=teacher).json() != published
    assert client.post(path + '/publish', headers=student).status_code == 403
