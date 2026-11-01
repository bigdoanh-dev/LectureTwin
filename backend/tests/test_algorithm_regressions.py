"""Focused regressions for source grounding, cross-batch graph extraction and retrieval."""
import hashlib
import json

import pytest

from app import ai_runtime, knowledge_ai, store


def setup_store(monkeypatch, tmp_path):
    monkeypatch.setattr(store, 'DATA', tmp_path)
    monkeypatch.setattr(store, 'DB_PATH', str(tmp_path / 'test.db'))
    store.initialize()


def test_relations_can_connect_concepts_discovered_in_different_batches(monkeypatch, tmp_path):
    setup_store(monkeypatch, tmp_path)
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    rows = [{'id': f'note-{i}', 'text': f'Đoạn nguồn số {i} nói về chủ đề học tập.', 'start': i, 'end': i + 1}
            for i in range(11)]
    rows[0]['text'] = 'Alpha là một khái niệm được giới thiệu.'
    rows[10]['text'] = 'Alpha được dùng cùng với Beta trong bài học.'
    lecture = {'id': 'cross-batch', 'version': 1, 'assets': [{'id': 'video', 'kind': 'video'}],
               'transcript': rows, 'slides': [], 'concepts': [], 'edges': [], 'evidence': []}
    alpha_id = 'concept-' + __import__('hashlib').sha256('alpha'.encode()).hexdigest()[:12]
    beta_id = 'concept-' + __import__('hashlib').sha256('beta'.encode()).hexdigest()[:12]

    def generate(schema, task, data, **kwargs):
        sources = data['sources']
        if schema is not knowledge_ai.GraphBatch:
            raise AssertionError(schema)
        if data.get('phase') == 'relations':
            if sources[0]['id'] != 'transcript-10-0':
                return schema(concepts=[], relations=[])
            return schema(concepts=[], relations=[{'source': alpha_id, 'target': beta_id, 'type': 'uses',
                'label': 'được dùng cùng', 'references': [{'source_id': sources[0]['id'],
                    'quote': 'Alpha được dùng cùng với Beta trong bài học.'}]}])
        source = sources[0]
        if source['id'] == 'transcript-0-0':
            return schema(concepts=[{'key': 'alpha', 'label': 'Alpha', 'description': 'Alpha là một khái niệm.',
                'references': [{'source_id': source['id'], 'quote': 'Alpha là một khái niệm được giới thiệu.'}]}], relations=[])
        if source['id'] == 'transcript-10-0':
            quote = 'Alpha được dùng cùng với Beta trong bài học.'
            return schema(concepts=[
                {'key': 'alpha-alias', 'label': 'Alpha', 'description': 'Tên gọi được nhắc lại cho Alpha.',
                 'existing_concept_id': alpha_id, 'references': [{'source_id': source['id'], 'quote': quote}]},
                {'key': 'beta', 'label': 'Beta', 'description': 'Beta là một khái niệm.',
                 'references': [{'source_id': source['id'], 'quote': quote}]}], relations=[])
        return schema(concepts=[], relations=[])

    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = knowledge_ai.extract_graph(lecture)
    assert result['relation_passes'] == 2
    assert len(lecture['concepts']) == 2
    alpha = next(concept for concept in lecture['concepts'] if concept['id'] == alpha_id)
    assert len(alpha['evidence_ids']) == 2
    assert len(lecture['edges']) == 1
    assert (lecture['edges'][0]['source'], lecture['edges'][0]['target']) == (alpha_id, beta_id)
    assert lecture['edges'][0]['evidence_ids']


def test_normalized_quote_stores_original_span_and_rejects_changed_code_or_negation():
    source = {'id': 's1', 'text': 'In this example, x == y means equal; the function does not return None.',
              'kind': 'transcript', 'start': 1, 'end': 2}
    sources = {'s1': source}
    match = knowledge_ai.supported(knowledge_ai.Reference(source_id='s1',
        quote='  In this example, x == y   means equal;  '), sources)
    assert match['matched_quote'] == 'In this example, x == y means equal;'
    assert match['quote_validation'] == 'normalized_quote_source_span'
    assert knowledge_ai.supported(knowledge_ai.Reference(source_id='s1',
        quote='In this example, x = y means equal'), sources) is None
    assert knowledge_ai.supported(knowledge_ai.Reference(source_id='s1',
        quote='the function returns None'), sources) is None


@pytest.mark.parametrize(('source_text', 'quote'), [
    ('The condition x != y is true.', 'The condition x = y is true.'),
    ('X > 10 is the stated threshold.', 'x > 10 is the stated threshold.'),
    ('The measured value is 1.5 units in this case.', 'The measured value is 1,5 units in this case.'),
])
def test_normalized_quote_rejects_changed_code_case_and_decimal(source_text, quote):
    source = {'id': 's1', 'text': source_text}
    assert knowledge_ai.supported(knowledge_ai.Reference(source_id='s1', quote=quote), {'s1': source}) is None


def test_document_embedding_cache_persists_between_retrievals(monkeypatch, tmp_path):
    monkeypatch.setattr(store, 'DATA', tmp_path)
    monkeypatch.setenv('LECTURE_AI_PROVIDER', 'ollama')
    document = {'id': 'ev1', 'text': 'Quadratic functions can be written in standard form.',
                'verified': True, 'valid': True, 'concept_id': 'quadratic'}
    lecture = {'evidence': [document], 'edges': []}
    embedded_batches = []

    def embed(texts):
        embedded_batches.append(list(texts))
        return [[1.0, 0.0] for _ in texts]

    monkeypatch.setattr(ai_runtime, 'embeddings', embed)
    for question in ('What is the form?', 'Explain the form'):
        citations, _ = knowledge_ai.retrieve(lecture, question)
        assert [item['id'] for item in citations] == ['ev1']
    assert sum(batch.count(document['text']) for batch in embedded_batches) == 1
    assert len(embedded_batches) == 3  # each query is embedded; the document is embedded only once


def test_irrelevant_query_with_zero_bm25_and_low_cosine_abstains(monkeypatch):
    lecture = {'evidence': [{'id': 'ev1', 'text': 'quadratic function parabola roots',
        'verified': True, 'valid': True, 'concept_id': 'quadratic'}], 'edges': []}
    monkeypatch.setattr(ai_runtime, 'embeddings', lambda texts: [[0.0, 1.0]])
    monkeypatch.setattr(ai_runtime, 'cached_embeddings', lambda texts: [[1.0, 0.0]])
    citations, report = knowledge_ai.retrieve(lecture, 'volcano tectonic eruption')
    assert citations == []
    assert report['retrieved_ids'] == []


def test_claim_checks_retry_in_halved_batches_and_default_missing_or_unknown_ids(monkeypatch):
    claims = [{'id': f'claim-{i}', 'label': f'Concept {i}', 'description': 'Supported statement.', 'evidence_ids': []}
              for i in range(21)]
    lecture = {'concepts': claims, 'edges': [], 'evidence': []}
    sizes = []

    def generate(schema, task, data, **kwargs):
        batch = data['claims']
        sizes.append(len(batch))
        if len(batch) > 10:
            raise ai_runtime.ProviderUnavailable('mock batch limit')
        checks = [{'id': claim['id'], 'supported': True, 'reason': 'Được nguồn hỗ trợ.'}
                  for claim in batch if claim['id'] != 'claim-0']
        checks.append({'id': 'unknown-id', 'supported': True, 'reason': 'Không thuộc lô này.'})
        return schema(checks=checks)

    monkeypatch.setattr(ai_runtime, 'generate', generate)
    result = knowledge_ai.verify_claims(lecture)
    assert sizes == [20, 10, 10, 1]
    assert len(result) == 21
    assert result['claim-0']['supported'] is False
    assert all(result[f'claim-{i}']['supported'] for i in range(1, 21))
    assert 'unknown-id' not in result


def test_document_cache_invalidates_for_model_and_revision_and_repairs_corruption(monkeypatch, tmp_path):
    monkeypatch.setattr(store, 'DATA', tmp_path)
    monkeypatch.setenv('LECTURE_EMBEDDING_MODEL', 'model-a')
    monkeypatch.setenv('LECTURE_EMBEDDING_REVISION', '1')
    calls = []

    def embed(texts):
        calls.append(list(texts))
        return [[float(len(calls)), 1.0] for _ in texts]

    monkeypatch.setattr(ai_runtime, 'embeddings', embed)
    text = 'A persistent document vector.'
    assert ai_runtime.cached_embeddings([text]) == [[1.0, 1.0]]
    assert ai_runtime.cached_embeddings([text]) == [[1.0, 1.0]]
    monkeypatch.setenv('LECTURE_EMBEDDING_MODEL', 'model-b')
    assert ai_runtime.cached_embeddings([text]) == [[2.0, 1.0]]
    monkeypatch.setenv('LECTURE_EMBEDDING_REVISION', '2')
    assert ai_runtime.cached_embeddings([text]) == [[3.0, 1.0]]

    identity = [ai_runtime.base_url(), 'model-b', '2']
    key = hashlib.sha256(json.dumps([identity, text], ensure_ascii=False).encode()).hexdigest()
    cache_file = tmp_path / 'embedding-cache' / f'{key}.json'
    cache_file.write_text('{corrupt cache')
    assert ai_runtime.cached_embeddings([text]) == [[4.0, 1.0]]
    assert len(calls) == 4

