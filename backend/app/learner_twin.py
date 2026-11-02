"""Auditable learner observations and teacher proposals from published quiz answers.

This read model does not infer mastery, ability, learning gains, or causes of an
incorrect answer. It neither changes a lesson nor publishes an intervention.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json


METHOD = 'deterministic_latest_answer_rules_v1'


def _timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc).isoformat()
    except (AttributeError, TypeError, ValueError):
        return None


def _empty(lecture, user, reason, version=None):
    return {'schema_version': 1, 'method': METHOD, 'source_version': version,
        'current_draft_version': lecture.get('version'),
        'scope': 'self' if user.get('role') == 'student' else 'class' if user.get('role') == 'teacher' else 'unavailable',
        'status': 'insufficient_data', 'reason': reason, 'state_id': None,
        'observed': {'attempt_count': 0, 'repeat_attempt_count': 0, 'historical_answer_count': 0,
            'latest_answer_count': 0, 'correct': 0, 'incorrect': 0, 'unique_learners': 0,
            'last_observation_at': None}, 'concept_observations': [], 'adaptive_proposals': [], 'audit_rows': [],
        'teacher_review_required': True, 'auto_apply': False,
        'approved_strategy': [], 'reviewed_proposals': [],
        'limitations': ['Chỉ mô tả câu trả lời đã lưu trên phiên bản được xuất bản; không dự đoán năng lực, mức thành thạo hoặc nguyên nhân trả lời sai.']}


def build_state(lecture, assessments, attempts, user, *, version=None, max_audit_rows=100, max_proposals=8):
    """Pure, deterministic projection. Callers must enforce normal lecture access.

    Student ownership is additionally enforced here before counters or hashes are
    computed. Teacher access requires the lecture owner. Admins get no learner data.
    Question IDs are scoped to their assessment, so reused IDs cannot collide.
    """
    published_version = lecture.get('published_version')
    state = _empty(lecture, user, 'no_published_source', published_version)
    if user.get('role') not in ('student', 'teacher'):
        state.update(status='unavailable', reason='academic_view_not_available_for_role')
        return state
    if user['role'] == 'teacher' and user.get('id') != lecture.get('owner_id'):
        state.update(status='unavailable', reason='lecture_owner_required')
        return state
    if version is not None and version != published_version:
        state['reason'] = 'requested_version_is_not_active_publication'
        return state
    source = lecture.get('published_payload') or {}
    if not published_version or source.get('version') != published_version or source.get('id') != lecture.get('id'):
        return state
    state['reason'] = 'no_eligible_assessment_answers'
    state['requires_rebase'] = lecture.get('version') != published_version
    state['source_mode'] = 'prepared_demo_fixture' if source.get('sample_attached') else 'published_uploaded_source'
    state['record_provenance'] = 'stored_assessment_submissions; participant identity and study validity are not independently certified'
    concepts = {c['id']: c for c in source.get('concepts', []) if c.get('verified')}
    evidence = {e['id']: e for e in source.get('evidence', []) if e.get('verified') and e.get('valid')
        and e.get('concept_id') in concepts and e.get('source_version', published_version) == published_version
        and not e.get('edge_id')}
    questions = {}
    for assessment in assessments:
        if (assessment.get('lecture_id') != lecture['id'] or assessment.get('version') != published_version
                or assessment.get('status') != 'published'):
            continue
        counts = Counter(q.get('id') for q in assessment.get('questions', []))
        for question in assessment.get('questions', []):
            qid, cid, eid = question.get('id'), question.get('concept_id'), question.get('evidence_id')
            options = {o.get('id') for o in question.get('options', [])}
            if (qid and counts[qid] == 1 and cid in concepts and eid in evidence
                    and evidence[eid].get('concept_id') == cid and question.get('correct_option_id') in options):
                questions[(assessment['id'], qid)] = question
    observations, valid_attempts, conflicting_ids = [], {}, set()
    for attempt in attempts:
        if user['role'] == 'student' and attempt.get('owner_id') != user.get('id'):
            continue
        if (attempt.get('lecture_id') != lecture['id'] or not attempt.get('owner_id')
                or not attempt.get('id') or not isinstance(attempt.get('answers'), dict)
                or attempt.get('source_version', published_version) != published_version):
            continue
        stamp = _timestamp(attempt.get('submitted_at'))
        if not stamp:
            continue
        rows = []
        for qid, answer in attempt['answers'].items():
            question = questions.get((attempt.get('assessment_id'), qid))
            if not question or answer not in {o.get('id') for o in question.get('options', [])}:
                continue
            rows.append({'attempt_id': attempt['id'], 'assessment_id': attempt['assessment_id'], 'question_id': qid,
                'concept_id': question['concept_id'], 'evidence_id': question['evidence_id'],
                'source_version': published_version, 'correct': answer == question['correct_option_id'], 'submitted_at': stamp,
                '_owner': attempt['owner_id']})
        if rows:
            # Store records have unique IDs; identical duplicated input records count once.
            rows.sort(key=lambda row: row['question_id'])
            if attempt['id'] in valid_attempts and valid_attempts[attempt['id']] != rows:
                conflicting_ids.add(attempt['id'])
            else:
                valid_attempts.setdefault(attempt['id'], rows)
    for aid in conflicting_ids:
        valid_attempts.pop(aid, None)
    state['conflicting_attempt_records_excluded'] = len(conflicting_ids)
    for rows in valid_attempts.values():
        observations.extend(rows)
    latest = {}
    for row in sorted(observations, key=lambda r: (r['submitted_at'], r['attempt_id'])):
        latest[(row['_owner'], row['assessment_id'], row['question_id'])] = row
    current = sorted(latest.values(), key=lambda r: (r['concept_id'], r['assessment_id'], r['question_id'], r['_owner']))
    metrics = defaultdict(list)
    for row in current:
        metrics[row['concept_id']].append(row)
    groups = {(rows[0]['_owner'], rows[0]['assessment_id']) for rows in valid_attempts.values()}
    state['observed'] = {'attempt_count': len(valid_attempts),
        'repeat_attempt_count': len(valid_attempts) - len(groups),
        'historical_answer_count': len(observations), 'latest_answer_count': len(current),
        'correct': sum(row['correct'] for row in current), 'incorrect': sum(not row['correct'] for row in current),
        'unique_learners': len({row['_owner'] for row in current}),
        'last_observation_at': max((row['submitted_at'] for row in current), default=None)}
    for cid, concept in sorted(concepts.items()):
        rows = metrics[cid]
        incorrect = [row for row in rows if not row['correct']]
        state['concept_observations'].append({'concept_id': cid, 'label': concept['label'],
            'state': 'no_observations' if not rows else 'observed_errors' if incorrect else 'observed_correct_answers',
            'latest_total': len(rows), 'latest_correct': len(rows) - len(incorrect), 'latest_incorrect': len(incorrect),
            'observed_learners': len({row['_owner'] for row in rows}),
            'question_count': len({(row['assessment_id'], row['question_id']) for row in rows}),
            'evidence_ids': sorted({row['evidence_id'] for row in rows})})
    audit = [{key: value for key, value in row.items() if key != '_owner'} for row in current]
    audit_limit = max(1, min(500, int(max_audit_rows)))
    state['audit_rows'] = sorted(audit, key=lambda row: (row['submitted_at'], row['attempt_id'], row['question_id']), reverse=True)[:audit_limit]
    state['audit_omitted_rows'] = max(0, len(audit) - audit_limit)
    if current:
        state.update(status='observed', reason=None)
    digest_payload = {'source_version': published_version, 'scope': state['scope'],
        'observed': state['observed'], 'source_concepts': sorted(concepts), 'source_evidence': sorted(evidence), 'audit': current}
    state['state_id'] = hashlib.sha256(json.dumps(digest_payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    if user['role'] == 'teacher':
        priorities = sorted((row for row in state['concept_observations'] if row['latest_incorrect']),
            key=lambda row: (-row['latest_incorrect'], row['concept_id']))
        proposal_limit = max(1, min(20, int(max_proposals)))
        for metric in priorities[:proposal_limit]:
            cid = metric['concept_id']
            wrong = [row for row in metrics[cid] if not row['correct']]
            state['adaptive_proposals'].append({'id': 'adapt-' + state['state_id'][:16] + '-' + cid,
                'status': 'draft', 'method': METHOD, 'based_on_state_id': state['state_id'],
                'source_version': published_version, 'concept_id': cid,
                'title': f'Đối chiếu nguồn và luyện lại: {metric["label"]}',
                'reason': f'{len(wrong)}/{metric["latest_total"]} câu trả lời gần nhất ở nội dung này chưa đúng; chưa xác định nguyên nhân.',
                'action': 'review_source_then_targeted_practice',
                'evidence_ids': sorted({row['evidence_id'] for row in wrong}),
                'assessment_question_refs': [{'assessment_id': aid, 'question_id': qid}
                    for aid, qid in sorted({(row['assessment_id'], row['question_id']) for row in wrong})[:audit_limit]],
                'supporting_attempt_ids': sorted({row['attempt_id'] for row in wrong})[:audit_limit],
                'supporting_attempt_ids_omitted': max(0, len({row['attempt_id'] for row in wrong}) - audit_limit),
                'teacher_review_required': True, 'auto_apply': False, 'requires_rebase': state['requires_rebase']})
        state['proposal_omitted_concepts'] = max(0, len(priorities) - proposal_limit)
    return state


def view(lecture, user, *, version=None):
    """Convenience entry point for domain.workspace after normal lecture access."""
    from . import store
    if user.get('role') not in ('teacher', 'student'):
        return build_state(lecture, [], [], user, version=version)
    assessments, attempts = store.items('assessments', lecture['id']), store.items('attempts', lecture['id'])
    state = build_state(lecture, assessments, attempts, user, version=version)
    if state['status'] == 'unavailable' or not state.get('state_id'):
        return state
    # Student self-state differs from the teacher class-state. Recompute the latter
    # privately solely to invalidate stale approvals; never return its learner data.
    class_state = state if user['role'] == 'teacher' else build_state(lecture, assessments, attempts,
        {'id': lecture.get('owner_id'), 'role': 'teacher'}, version=version)
    proposals = {proposal['id']: proposal for proposal in class_state['adaptive_proposals']}
    eligible = []
    for decision in store.items('teaching_decisions', lecture['id']):
        pid = (decision.get('proposal') or {}).get('id')
        stamp = _timestamp(decision.get('reviewed_at'))
        if (decision.get('lecture_id') == lecture['id'] and decision.get('state_id') == class_state['state_id']
                and decision.get('source_version') == class_state['source_version'] and pid in proposals
                and stamp and decision.get('decision') in ('confirm', 'reject')
                and decision.get('reviewed_by') == lecture.get('owner_id')):
            eligible.append((stamp, decision.get('id', ''), pid, decision))
    latest = {}
    for _, _, pid, decision in sorted(eligible, key=lambda row: row[:3]):
        latest[pid] = decision
    own_errors = {row['concept_id'] for row in state['concept_observations'] if row['latest_incorrect']}
    for pid, decision in sorted(latest.items()):
        proposal = proposals[pid]
        if user['role'] == 'teacher':
            state['reviewed_proposals'].append({'decision_id': decision['id'], 'proposal_id': pid,
                'concept_id': proposal['concept_id'], 'decision': decision['decision'],
                'note': decision.get('note', ''), 'reviewed_at': decision['reviewed_at'],
                'reviewed_by': decision['reviewed_by']})
        if decision['decision'] == 'confirm' and (user['role'] == 'teacher' or proposal['concept_id'] in own_errors):
            state['approved_strategy'].append({'decision_id': decision['id'], 'source_version': state['source_version'],
                'concept_id': proposal['concept_id'], 'title': proposal['title'], 'action': proposal['action'],
                'evidence_ids': proposal['evidence_ids'], 'teacher_reviewed': True,
                'method': METHOD, 'auto_apply': False})
    return state


def tutor_context(lecture, user):
    """Minimal teacher-approved strategy for this student's observed errors only.

    This changes explanation style, never assessment grades or academic content.
    No class counts, other learners, raw answers or teacher notes enter a prompt.
    """
    if user.get('role') != 'student':
        return {}
    state = view(lecture, user)
    if state['status'] != 'observed' or state.get('requires_rebase') or not state['approved_strategy']:
        return {}
    own_errors = {row['concept_id'] for row in state['concept_observations'] if row['latest_incorrect']}
    strategies = [{'concept_id': row['concept_id'], 'action': 'review_source_then_targeted_practice',
        'evidence_ids': row['evidence_ids']} for row in state['approved_strategy']
        if row['concept_id'] in own_errors and row['action'] == 'review_source_then_targeted_practice']
    if not strategies:
        return {}
    return {'method': METHOD, 'self_state_id': state['state_id'], 'source_version': state['source_version'],
        'concept_ids': sorted({row['concept_id'] for row in strategies}), 'strategies': strategies}
