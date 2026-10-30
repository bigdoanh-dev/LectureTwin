from copy import deepcopy
from .conftest import login
from .test_workflows import post, publish_fixture
from app import domain, research, store, workflows


def test_clo_suggestions_do_not_map_every_concept_or_claim_attainment(client):
    teacher=login(client)
    initial=client.get('/api/lectures/lec-bfs-dfs',headers=teacher).json()['research']
    assert not initial['source_processed']
    assert not initial['signals'] and all(not o['missing_concept_ids'] for o in initial['objectives'])
    post(client, '/lectures/lec-bfs-dfs/analyze', teacher)
    data=client.get('/api/lectures/lec-bfs-dfs',headers=teacher).json()['research']
    first=data['objectives'][0]; second=data['objectives'][1]
    assert first['found_concept_ids']==['graph']
    assert {'bfs','dfs','queue','stack'}<=set(second['found_concept_ids'])
    assert first['confirmed_concept_ids']==[] and first['status']=='suggested'
    assert not any(row['objective_ids'] for row in data['concepts'])
    assert all(row['source_status']=='needs_review' for row in data['concepts'])


def test_mapping_teacher_only_versioned_and_snapshot_preserved(client):
    teacher=login(client);publish_fixture(client,teacher)
    before=deepcopy(store.get('lectures','lec-bfs-dfs')['published_payload'])
    body={'version':before['version'],'concept_ids':['bfs'],'expected_concept_ids':['bfs','complexity']}
    url='/api/lectures/lec-bfs-dfs/objectives/clo-1/mapping'
    assert client.put(url,headers=login(client,'admin'),json=body).status_code==403
    assert client.put(url,headers=login(client,'student'),json=body).status_code==403
    assert client.put(url,headers=teacher,json={**body,'version':99}).status_code==409
    assert client.put(url,headers=teacher,json={**body,'concept_ids':['complexity']}).status_code==422
    response=client.put(url,headers=teacher,json=body)
    assert response.status_code==200,response.text
    objective=response.json()['research']['objectives'][0]
    assert objective['confirmed_concept_ids']==['bfs'] and objective['status']=='confirmed'
    assert objective['missing_concept_ids']==['complexity']
    assert any(s['kind']=='missing_source' for s in response.json()['research']['signals'])
    assert store.get('lectures','lec-bfs-dfs')['published_payload']==before
    student=client.get('/api/lectures/lec-bfs-dfs',headers=login(client,'student')).json()
    assert student['research']['objectives'][0]['confirmed_concept_ids']==[]
    post(client,'/lectures/lec-bfs-dfs/publish',teacher)
    student=client.get('/api/lectures/lec-bfs-dfs',headers=login(client,'student')).json()
    assert student['research']['objectives'][0]['confirmed_concept_ids']==['bfs']
    lecture=store.get('lectures','lec-bfs-dfs');lecture['version']+=1;store.put('lectures',lecture)
    assert client.get('/api/lectures/lec-bfs-dfs',headers=teacher).json()['research']['objectives'][0]['status']!='confirmed'


def test_ranges_merge_overlapping_citations_and_exclude_slide_times():
    rows=[{'kind':'transcript','start':0,'end':10},{'kind':'transcript','start':5,'end':20},
        {'kind':'slide','start':0,'end':50},{'kind':'transcript','start':30,'end':40},
        {'kind':'transcript','start':None,'end':None}]
    assert research.merged_ranges(rows)==[{'start':0,'end':20},{'start':30,'end':40}]


def test_complexity_requires_supplied_source_and_explanatory_citation_is_preferred(client):
    teacher=login(client)
    post(client, '/lectures/lec-bfs-dfs/analyze', teacher)
    lecture=store.get('lectures','lec-bfs-dfs')
    assert 'complexity' not in {c['id'] for c in lecture['concepts']}
    data=research.view(lecture, {'role':'teacher','id':'user-teacher'})
    preferred=next(c for c in data['concepts'] if c['concept_id']=='dfs')['evidence_ids'][0]
    assert next(e for e in lecture['evidence'] if e['id']==preferred)['start']==730
    lecture['transcript'].append({'id':'added-source','start':1000,'end':1020,'text':'Phân tích độ phức tạp thuật toán theo số đỉnh và cạnh.','source_type':'user_upload'})
    workflows.extract_knowledge(lecture);workflows.verify_lecture(lecture)
    assert any(c['id']=='complexity' for c in lecture['concepts'])
    assert not any(f['id']=='finding-extension' for f in lecture['findings'])


def test_targeted_simulation_adds_to_theory_preserves_total_and_minima(client):
    teacher=login(client);publish_fixture(client,teacher)
    lecture=store.get('lectures','lec-bfs-dfs');before=deepcopy(lecture['planned'])
    target=next(s for s in before['segments'] if s['kind']=='theory')
    job=post(client,'/lectures/lec-bfs-dfs/scenarios',teacher,{'request':'Thêm thời gian giải thích BFS','target_segment_id':target['id'],'add_minutes':5,'total_limit':lecture['total_minutes']})
    result=job['result']['comparison']
    assert result['target_segment_id']==target['id'] and result['added_minutes']==5
    assert result['practice_delta']==0 and result['feasible']
    assert result['scenario_total']==result['baseline_total']==lecture['total_minutes']
    assert next(s for s in result['scenario_segments'] if s['id']==target['id'])['minutes']==target['minutes']+5
    assert all(s['minutes']>=(5 if s['kind'] in ('theory','practice') else 2) for s in result['scenario_segments'])
    assert store.get('lectures',lecture['id'])['planned']==before
    assert client.post('/api/lectures/lec-bfs-dfs/scenarios',headers=teacher,json={'request':'Thêm complexity','target_segment_id':'invented-complexity','add_minutes':15}).status_code==422


def test_grouped_prerequisites_use_all_concepts_without_summary_overwrite():
    lecture={'planned':{'segments':[
        {'id':'a','kind':'theory','concept_id':'bfs','concept_ids':['bfs','graph'],'minutes':20,'title':'Nền tảng'},
        {'id':'b','kind':'theory','concept_id':'dfs','minutes':20,'title':'DFS'},
        {'id':'p','kind':'practice','concept_id':'dfs','minutes':10,'title':'Thực hành'},
        {'id':'s','kind':'summary','concept_id':'graph','minutes':10,'title':'Tổng kết'},
    ]},'edges':[{'type':'prerequisite','source':'graph','target':'dfs'}]}
    assert domain.evaluate_scenario(lecture,5,60,'b')['feasible']


def test_quiz_signals_are_real_and_bound_to_version(client):
    teacher=login(client)
    job=post(client,'/lectures/lec-published/assessments/generate',teacher)
    aid=job['result']['assessment_id'];post(client,f'/assessments/{aid}/publish',teacher)
    post(client,f'/assessments/{aid}/submit',login(client,'student'),{'answers':{'q-bfs':'b','q-dfs':'b','q-visited':'a'}})
    research_data=client.get('/api/lectures/lec-published',headers=teacher).json()['research']
    assert any(s['kind']=='quiz_errors' for s in research_data['signals'])
    other=client.get('/api/lectures/lec-published',headers=login(client,'student2')).json()['research']
    assert not any(s['kind']=='quiz_errors' for s in other['signals'])
    lecture=store.get('lectures','lec-published');lecture['version']+=1;store.put('lectures',lecture)
    updated=client.get('/api/lectures/lec-published',headers=teacher).json()['research']
    assert not any(s['kind']=='quiz_errors' for s in updated['signals'])
    assert client.get('/api/lectures/lec-published/analytics',headers=teacher).json()['attempt_count']==0
    assert client.get('/api/lectures/lec-published/analytics',headers=login(client,'student')).json()['attempt_count']==1


def test_new_sample_revision_does_not_overwrite_saved_teacher_decisions(client):
    from app.main import migrate_seeded_youtube_samples
    teacher=login(client);publish_fixture(client,teacher)
    lecture=store.get('lectures','lec-bfs-dfs')
    lecture['sample_data_revision']='youtube-bfs-dfs-caption-notes-v2'
    store.put('lectures',lecture);before=deepcopy(lecture)
    migrate_seeded_youtube_samples()
    assert store.get('lectures',lecture['id'])==before
    assert client.get('/api/lectures/'+lecture['id'],headers=teacher).json()['research']['sample_notes_outdated']
