"""Bounded proposal/challenge/revision protocol; messages are public artifacts, not reasoning."""
from copy import deepcopy
from . import ai_runtime, store


def deliberate(proposals, review, revise, *, version, checkpoint=lambda: None):
    """One feedback round, fail closed, with immutable provenance and a hard stop."""
    messages = []
    def emit(sender, recipient, kind, payload, parent=None):
        message = {'id': store.uid('msg'), 'sender': sender, 'recipient': recipient,
            'kind': kind, 'source_version': version, 'parent_id': parent,
            'created_at': store.now(), 'payload': deepcopy(payload)}
        messages.append(message)
        return message['id']
    initial = emit('knowledge', 'verification', 'proposal', proposals)
    checkpoint()
    first = review(deepcopy(proposals))
    challenge = emit('verification', 'knowledge', 'review', first, initial)
    disputed = [p for p in proposals if not first.get(p['id'], {}).get('supported', False)]
    final = [p for p in proposals if first.get(p['id'], {}).get('supported', False)]
    if disputed:
        checkpoint()
        replacements = revise(deepcopy(disputed), deepcopy(first))
        # A revision can address only challenged artifacts; no unrelated new claims.
        allowed = {p['id'] for p in disputed}
        replacements = [p for p in replacements if p['id'] in allowed]
        unique = {p['id']: p for p in replacements}
        replacements = list(unique.values())
        revision = emit('knowledge', 'verification', 'revision', replacements, challenge)
        if replacements:
            checkpoint()
            second = review(deepcopy(replacements))
            emit('verification', 'orchestrator', 'recheck', second, revision)
            final.extend(p for p in replacements if second.get(p['id'], {}).get('supported', False))
    emit('orchestrator', 'teacher', 'review_required', {'retained_ids': [p['id'] for p in final],
        'abstained_ids': [p['id'] for p in proposals if p['id'] not in {p['id'] for p in final}]}, messages[-1]['id'])
    return final, {'protocol': 'bounded_proposal_challenge_revision_v1', 'source_version': version,
        'max_revision_rounds': 1, 'revision_rounds': int(bool(disputed)),
        'generator_model': ai_runtime.model_name(), 'verifier_model': ai_runtime.verifier_name(),
        'independent_models': ai_runtime.model_name() != ai_runtime.verifier_name(),
        'teacher_review_required': True, 'messages': messages}
