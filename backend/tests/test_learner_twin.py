from copy import deepcopy
import json

from app import learner_twin


TEACHER = {'id': 'teacher', 'role': 'teacher'}
STUDENT = {'id': 'student', 'role': 'student'}


def source():
    payload = {'id': 'lecture', 'version': 1, 'sample_attached': False,
        'concepts': [{'id': 'module', 'label': 'Module', 'verified': True},
                     {'id': 'package', 'label': 'Package', 'verified': True},
                     {'id': 'unreviewed', 'label': 'Unreviewed', 'verified': False}],
        'evidence': [{'id': 'ev-module', 'concept_id': 'module', 'text': 'Module source', 'valid': True, 'verified': True, 'source_version': 1},
                     {'id': 'ev-package', 'concept_id': 'package', 'text': 'Package source', 'valid': True, 'verified': True, 'source_version': 1},
                     {'id': 'ev-unreviewed', 'concept_id': 'unreviewed', 'text': 'Draft', 'valid': True, 'verified': False, 'source_version': 1}]}
    return {'id': 'lecture', 'owner_id': 'teacher', 'version': 1, 'published_version': 1,
        'published_payload': payload, 'planned': {'segments': []}}


def assessment(aid='quiz', *, version=1, status='published'):
    return {'id': aid, 'lecture_id': 'lecture', 'version': version, 'status': status,
        'questions': [{'id': 'q1', 'concept_id': 'module', 'evidence_id': 'ev-module',
            'options': [{'id': 'a', 'text': 'Correct'}, {'id': 'b', 'text': 'Wrong'}], 'correct_option_id': 'a'},
            {'id': 'q2', 'concept_id': 'package', 'evidence_id': 'ev-package',
            'options': [{'id': 'a', 'text': 'Correct'}, {'id': 'b', 'text': 'Wrong'}], 'correct_option_id': 'a'}]}


def attempt(aid='answer1', *, owner='student', quiz='quiz', answers=None, date='2026-11-02T00:00:00+00:00'):
    return {'id': aid, 'owner_id': owner, 'lecture_id': 'lecture', 'assessment_id': quiz,
        'answers': answers if answers is not None else {'q1': 'b', 'q2': 'a'}, 'submitted_at': date,
        'feedback': [{'question_id': 'q1', 'concept_id': 'wrong-concept', 'correct': True}], 'score': 100}


def test_no_answers_or_no_publication_does_not_fabricate_a_learner_profile():
    state = learner_twin.build_state(source(), [assessment()], [], TEACHER)
    assert state['status'] == 'insufficient_data'
    assert state['observed']['attempt_count'] == state['observed']['unique_learners'] == 0
    assert state['adaptive_proposals'] == [] and state['audit_rows'] == []
    assert all(row['state'] == 'no_observations' for row in state['concept_observations'])
    unpublished = source(); unpublished.pop('published_payload')
    assert learner_twin.build_state(unpublished, [assessment()], [attempt()], TEACHER)['state_id'] is None


def test_latest_answers_replace_repeats_and_ignore_untrusted_feedback_and_scores():
    first = attempt()
    latest = attempt('answer2', answers={'q1': 'a'}, date='2026-11-02T01:00:00+00:00')
    state = learner_twin.build_state(source(), [assessment()], [latest, first], TEACHER)
    assert state['observed'] == {'attempt_count': 2, 'repeat_attempt_count': 1, 'historical_answer_count': 3,
        'latest_answer_count': 2, 'correct': 2, 'incorrect': 0, 'unique_learners': 1,
        'last_observation_at': '2026-11-02T01:00:00+00:00'}
    assert state['adaptive_proposals'] == []
    assert {r['concept_id'] for r in state['audit_rows']} == {'module', 'package'}
    assert state['state_id'] == learner_twin.build_state(source(), [assessment()], [first, latest], TEACHER)['state_id']


def test_class_summary_and_proposal_use_current_published_source_and_need_teacher_review():
    lecture = source(); lecture['version'] = 2
    lecture['concepts'] = [{'id': 'module', 'label': 'New draft label', 'verified': False}]
    rows = [attempt(), attempt('other-answer', owner='student2', answers={'q1': 'a', 'q2': 'b'})]
    original = deepcopy((lecture, rows))
    state = learner_twin.build_state(lecture, [assessment()], rows, TEACHER)
    assert state['source_version'] == 1 and state['current_draft_version'] == 2 and state['requires_rebase']
    assert state['scope'] == 'class' and state['observed']['unique_learners'] == 2
    assert state['observed']['correct'] == 2 and state['observed']['incorrect'] == 2
    assert len(state['adaptive_proposals']) == 2
    for proposal in state['adaptive_proposals']:
        assert proposal['status'] == 'draft' and proposal['teacher_review_required'] and not proposal['auto_apply']
        assert proposal['requires_rebase'] and proposal['source_version'] == 1
        assert proposal['evidence_ids'] and proposal['supporting_attempt_ids']
        assert proposal['based_on_state_id'] == state['state_id']
    assert 'New draft label' not in json.dumps(state)
    assert 'student2' not in json.dumps(state) and 'correct_option_id' not in json.dumps(state)
    assert (lecture, rows) == original


def test_student_state_is_independent_of_other_learners_and_has_no_teaching_proposals():
    own = attempt()
    other = attempt('other-private-attempt', owner='student2', answers={'q1': 'b', 'q2': 'b'})
    state = learner_twin.build_state(source(), [assessment()], [own, other], STUDENT)
    assert state == learner_twin.build_state(source(), [assessment()], [own], STUDENT)
    assert state['scope'] == 'self' and state['observed']['unique_learners'] == 1
    assert state['observed']['incorrect'] == 1 and state['adaptive_proposals'] == []
    assert 'other-private-attempt' not in json.dumps(state)
    for user in ({'id': 'admin', 'role': 'admin'}, {'id': 'other-teacher', 'role': 'teacher'}):
        forbidden = learner_twin.build_state(source(), [assessment()], [own, other], user)
        assert forbidden['status'] == 'unavailable' and forbidden['audit_rows'] == []


def test_version_publication_and_source_verification_gates_exclude_unsupported_observations():
    lecture = source()
    active = assessment()
    active['questions'][1]['evidence_id'] = 'ev-unreviewed'
    old = assessment('old', version=0)
    draft = assessment('draft', status='draft')
    attempts = [attempt(), attempt('old-answer', quiz='old'), attempt('draft-answer', quiz='draft')]
    state = learner_twin.build_state(lecture, [active, old, draft], attempts, TEACHER)
    assert state['observed']['attempt_count'] == 1 and state['observed']['latest_answer_count'] == 1
    assert state['audit_rows'][0]['evidence_id'] == 'ev-module'
    lecture['published_payload']['evidence'][0]['source_version'] = 99
    assert learner_twin.build_state(lecture, [active], [attempt()], TEACHER)['status'] == 'insufficient_data'
    requested = learner_twin.build_state(source(), [assessment()], [attempt()], TEACHER, version=2)
    assert requested['status'] == 'insufficient_data' and requested['audit_rows'] == []


def test_invalid_choices_dates_and_conflicting_duplicate_attempt_ids_are_not_evidence():
    rows = [attempt('invalid-option', answers={'q1': 'made-up'}), attempt('invalid-date', date='yesterday'),
        attempt('collision', answers={'q1': 'a'}), attempt('collision', answers={'q1': 'b'})]
    state = learner_twin.build_state(source(), [assessment()], rows, TEACHER)
    assert state['observed']['attempt_count'] == 0 and state['conflicting_attempt_records_excluded'] == 1
    assert state['status'] == 'insufficient_data' and not state['adaptive_proposals']
    assert state == learner_twin.build_state(source(), [assessment()], list(reversed(rows)), TEACHER)


def test_question_ids_are_assessment_scoped_and_audit_and_proposals_are_bounded():
    quizzes = [assessment(), assessment('quiz2')]
    rows = [attempt('answer-' + str(i), owner='learner-' + str(i)) for i in range(4)]
    rows.append(attempt('second-quiz', quiz='quiz2'))
    state = learner_twin.build_state(source(), quizzes, rows, TEACHER, max_audit_rows=2, max_proposals=1)
    assert state['observed']['latest_answer_count'] == 10
    assert len(state['audit_rows']) == 2 and state['audit_omitted_rows'] == 8
    assert len(state['adaptive_proposals']) == 1
    proposal = state['adaptive_proposals'][0]
    assert len(proposal['supporting_attempt_ids']) == 2 and proposal['supporting_attempt_ids_omitted'] == 3
    assert state['observed']['repeat_attempt_count'] == 0


def test_store_wrapper_reads_scoped_records_without_writing(monkeypatch):
    from app import store
    calls = []
    def items(kind, lid):
        calls.append((kind, lid))
        return [assessment()] if kind == 'assessments' else [attempt()]
    monkeypatch.setattr(store, 'items', items)
    monkeypatch.setattr(store, 'put', lambda *a, **k: (_ for _ in ()).throw(AssertionError('Read model wrote data')))
    assert learner_twin.view(source(), STUDENT)['observed']['attempt_count'] == 1
    assert calls == [('assessments', 'lecture'), ('attempts', 'lecture'), ('teaching_decisions', 'lecture')]
    calls.clear()
    assert learner_twin.view(source(), {'id': 'admin', 'role': 'admin'})['status'] == 'unavailable'
    assert not calls


def test_approved_strategy_is_current_teacher_reviewed_and_student_specific(monkeypatch):
    from app import store
    lecture, quizzes = source(), [assessment()]
    attempts = [attempt(), attempt('other', owner='student2', answers={'q1': 'a', 'q2': 'b'})]
    class_state = learner_twin.build_state(lecture, quizzes, attempts, TEACHER)
    decisions = [{'id': 'decision-' + proposal['concept_id'], 'lecture_id': 'lecture',
        'source_version': 1, 'state_id': class_state['state_id'], 'decision': 'confirm', 'proposal': proposal,
        'reviewed_by': 'teacher', 'note': 'Private teacher note', 'reviewed_at': '2026-11-02T01:00:00+00:00'}
        for proposal in class_state['adaptive_proposals']]
    def items(kind, lid):
        return {'assessments': quizzes, 'attempts': attempts, 'teaching_decisions': decisions}[kind]
    monkeypatch.setattr(store, 'items', items)
    student = learner_twin.view(lecture, STUDENT)
    assert [row['concept_id'] for row in student['approved_strategy']] == ['module']
    assert student['reviewed_proposals'] == []
    text = json.dumps(student)
    assert 'Private teacher note' not in text and 'decision-package' not in text and 'student2' not in text
    teacher = learner_twin.view(lecture, TEACHER)
    assert len(teacher['approved_strategy']) == len(teacher['reviewed_proposals']) == 2
    assert teacher['reviewed_proposals'][0]['note'] == 'Private teacher note'
    # A later observation changes the class state even if this learner's state is unchanged.
    attempts.append(attempt('new-other', owner='student2', answers={'q1': 'a', 'q2': 'a'}, date='2026-11-02T02:00:00+00:00'))
    assert learner_twin.view(lecture, STUDENT)['approved_strategy'] == []
    assert learner_twin.view(lecture, TEACHER)['reviewed_proposals'] == []


def test_later_rejection_and_unapproved_reviewer_cannot_supply_instructional_strategy(monkeypatch):
    from app import store
    lecture, quizzes, answers = source(), [assessment()], [attempt()]
    state = learner_twin.build_state(lecture, quizzes, answers, TEACHER)
    proposal = state['adaptive_proposals'][0]
    base = {'id': 'first', 'lecture_id': 'lecture', 'source_version': 1, 'state_id': state['state_id'],
        'decision': 'confirm', 'proposal': proposal, 'reviewed_by': 'teacher', 'note': 'Reviewed source.',
        'reviewed_at': '2026-11-02T01:00:00+00:00'}
    decisions = [base, {**base, 'id': 'second', 'decision': 'reject', 'reviewed_at': '2026-11-02T02:00:00+00:00'},
        {**base, 'id': 'third', 'reviewed_by': 'admin', 'reviewed_at': '2026-11-02T03:00:00+00:00'}]
    monkeypatch.setattr(store, 'items', lambda kind, lid: {'assessments': quizzes, 'attempts': answers, 'teaching_decisions': decisions}[kind])
    result = learner_twin.view(lecture, TEACHER)
    assert result['approved_strategy'] == [] and result['reviewed_proposals'][0]['decision'] == 'reject'


def test_tutor_context_uses_only_current_approved_own_errors_and_excludes_private_class_data(monkeypatch):
    from app import store
    lecture, quizzes = source(), [assessment()]
    attempts = [attempt(), attempt('other-private', owner='student2', answers={'q1': 'a', 'q2': 'a'})]
    state = learner_twin.build_state(lecture, quizzes, attempts, TEACHER)
    proposal = state['adaptive_proposals'][0]
    decisions = [{'id': 'decision', 'lecture_id': 'lecture', 'source_version': 1, 'state_id': state['state_id'],
        'decision': 'confirm', 'proposal': proposal, 'reviewed_by': 'teacher', 'note': 'Private note',
        'reviewed_at': '2026-11-02T01:00:00+00:00'}]
    monkeypatch.setattr(store, 'items', lambda kind, lid: {'assessments': quizzes, 'attempts': attempts, 'teaching_decisions': decisions}[kind])
    context = learner_twin.tutor_context(lecture, STUDENT)
    assert context['concept_ids'] == ['module'] and context['source_version'] == 1
    assert context['strategies'] == [{'concept_id': 'module', 'action': 'review_source_then_targeted_practice', 'evidence_ids': ['ev-module']}]
    text = json.dumps(context)
    assert all(word not in text for word in ('other-private', 'Private note', 'attempt_count', 'supporting_attempt_ids', 'unique_learners'))
    assert learner_twin.tutor_context(lecture, {'id': 'student2', 'role': 'student'}) == {}
    assert learner_twin.tutor_context(lecture, TEACHER) == {}
    lecture['version'] = 2
    assert learner_twin.tutor_context(lecture, STUDENT) == {}
    lecture['version'] = 1
    attempts.append(attempt('new', answers={'q1': 'a', 'q2': 'a'}, date='2026-11-02T02:00:00+00:00'))
    assert learner_twin.tutor_context(lecture, STUDENT) == {}
    attempts.pop()
    decisions.clear()
    assert learner_twin.tutor_context(lecture, STUDENT) == {}
