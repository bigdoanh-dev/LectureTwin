from app import question_insights as qi, store
from .conftest import login


def test_multilabel_ideas_and_exact_regions(client):
    lecture=store.get('lectures','lec-published')
    for i,q in enumerate(['BFS là gì? Tại sao BFS dùng hàng đợi? Cho ví dụ BFS', 'BFS là gì?', 'Xin chào']):
        store.put('jobs', {'id':f'question-{i}','lecture_id':lecture['id'],'owner_id':'student','workflow':'tutor','status':'completed',
            'input':{'role':'student','version':lecture['version'],'question':q},'created_at':store.now(),
            'result':{'answer':'DFS là gì? Viết code DFS'}})
    data=qi.report(lecture,lecture['version'])
    assert data['total']==3 and data['unclassified']==1
    assert data['regions'][6]['count']==1 and data['regions'][0]['count']==1
    assert sum(r['count'] for r in data['regions'])+data['unclassified']==data['total']
    assert len(data['questions'][0]['ideas'])==3
    assert next(t for t in data['topics'] if t['id']=='dfs')['count']==0
    assert 'owner_id' not in data['questions'][0] and 'answer' not in str(data['questions'])


def test_endpoint_is_teacher_owned_versioned_and_question_only(client):
    teacher=login(client); student=login(client,'student'); admin=login(client,'admin')
    lecture=store.get('lectures','lec-published');v=lecture['version']
    for i,(role,workflow,version) in enumerate([('teacher','tutor',v),('student','analysis',v),('student','tutor',v+1),('student','tutor',v)]):
        store.put('jobs',{'id':f'q-{i}','lecture_id':lecture['id'],'owner_id':role,'workflow':workflow,
            'input':{'role':role,'version':version,'question':'BFS là gì?'},'created_at':store.now()})
    url=f'/api/lectures/{lecture["id"]}/question-insights?version={v}'
    assert client.get(url,headers=student).status_code==403
    assert client.get(url,headers=admin).status_code==403
    data=client.get(url,headers=teacher).json()
    assert data['total']==1 and data['questions'][0]['id']=='q-3'
    assert client.get(url.replace(f'version={v}',f'version={v+1}'),headers=teacher).json()['total']==1
    lecture['owner_id']='another-teacher';store.put('lectures',lecture)
    assert client.get(url,headers=teacher).status_code==403


def test_question_rules_do_not_guess_level_or_match_substrings():
    assert not qi.classify('queue BFS',[])['levels']
    assert not qi.classify('exampleless',[])['levels']
    assert qi.classify('What is BFS? Compare BFS and DFS; implement BFS',[])['levels']==['apply','explain','recall']
