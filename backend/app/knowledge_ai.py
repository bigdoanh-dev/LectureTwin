"""Source-grounded graph extraction, hybrid retrieval and tutor generation."""
from collections import Counter
import hashlib
import math
import os
import re
import unicodedata

from pydantic import BaseModel, Field, ConfigDict
from . import ai_runtime, store


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Reference(StrictModel):
    source_id: str
    quote: str = Field(min_length=3, max_length=220)


class Node(StrictModel):
    key: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=2, max_length=120)
    description: str = Field(min_length=3, max_length=240)
    references: list[Reference] = Field(min_length=1, max_length=1)
    existing_concept_id: str | None = None


class Relation(StrictModel):
    source: str
    target: str
    type: str = Field(pattern='^(uses|prerequisite|part_of|explains|compared_in|related_to)$')
    label: str = Field(min_length=2, max_length=120)
    references: list[Reference] = Field(min_length=1, max_length=1)


class GraphBatch(StrictModel):
    concepts: list[Node] = Field(max_length=5)
    relations: list[Relation] = Field(max_length=4)


class TutorAnswer(StrictModel):
    answer: str = Field(min_length=1, max_length=1200)
    evidence_ids: list[str] = Field(max_length=4)
    insufficient_source: bool


class AnswerCheck(StrictModel):
    supported: bool
    reason: str = Field(min_length=3, max_length=700)


def verify_answer(result):
    if result.get('method') != 'local_rag':
        return {'valid_citations': not result.get('citations'), 'semantic_supported': False, 'note': 'Không sinh câu trả lời khi thiếu nguồn.'}
    response = ai_runtime.generate_verification(AnswerCheck,
        'Check whether ANSWER is supported entirely by EVIDENCE. Reject unsupported details, code, '
        'or conclusions even if the topic matches. Use no outside knowledge. '
        'Return supported=false when uncertain. This is a model check, not human certification.',
        {'answer': result['answer'], 'evidence': [{'id': e['id'], 'text': e['text']} for e in result['citations']]})
    return {'valid_citations': all(e.get('verified') and e.get('valid') for e in result['citations']),
            'semantic_supported': response.supported, 'note': response.reason}


class GeneratedQuestion(StrictModel):
    text: str = Field(min_length=10, max_length=1000)
    concept_id: str
    evidence_id: str
    options: list[str] = Field(min_length=3, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=5, max_length=1000)


class Questions(StrictModel):
    questions: list[GeneratedQuestion] = Field(min_length=1, max_length=8)


class ClaimCheck(StrictModel):
    id: str
    supported: bool
    reason: str = Field(min_length=3, max_length=240)


class Verification(StrictModel):
    checks: list[ClaimCheck] = Field(max_length=20)


class ObjectiveLink(StrictModel):
    objective: str
    concept_ids: list[str] = Field(max_length=12)
    explanation: str = Field(min_length=3, max_length=600)


class ObjectiveMapping(StrictModel):
    links: list[ObjectiveLink] = Field(max_length=8)


def verify_claims(lecture):
    evidence = {e['id']: e for e in lecture.get('evidence', []) if e.get('valid')}
    labels = {c['id']: c['label'] for c in lecture.get('concepts', [])}
    claims = [{'id': c['id'], 'claim': c['label'] + ': ' + c['description'],
        'quotes': [evidence[eid]['text'] for eid in c['evidence_ids'] if eid in evidence]} for c in lecture['concepts']]
    claims += [{'id': e['id'], 'claim': f"{labels.get(e['source'])} --{e['label']}--> {labels.get(e['target'])}",
        'quotes': [evidence[eid]['text'] for eid in e.get('evidence_ids', []) if eid in evidence]} for e in lecture['edges']]
    checks = {}
    def check_batch(batch):
        try:
            response = ai_runtime.generate_verification(Verification,
                'Review each CLAIM against only its QUOTES. supported=true only if quotes support the entire claim. '
                'A keyword match or co-occurrence is insufficient for a relation or prerequisite claim. '
                'Use no outside knowledge. Return exact supplied id and a Vietnamese reason under 80 characters. '
                'These checks assist a human teacher and do not certify correctness.', {'claims': batch})
        except ai_runtime.ProviderUnavailable:
            if len(batch) <= 10:
                raise
            middle = len(batch) // 2
            check_batch(batch[:middle]); check_batch(batch[middle:])
            return
        allowed = {claim['id'] for claim in batch}
        checks.update({check.id: check.model_dump() for check in response.checks if check.id in allowed})
    for start in range(0, len(claims), 20):
        check_batch(claims[start:start + 20])
    for claim in claims:
        checks.setdefault(claim['id'], {'id': claim['id'], 'supported': False, 'reason': 'Mô hình chưa trả kết quả đối chiếu cho nhận định này.'})
    return checks


def map_objectives(lecture):
    concepts = [c for c in lecture['concepts'] if c.get('verified')]
    response = ai_runtime.generate(ObjectiveMapping,
        'Suggest links from the exact supplied OBJECTIVES to CONCEPTS using EVIDENCE. '
        'Do not claim student attainment. Use only supplied concept IDs and objective strings. '
        'If no evidence supports a link, return an empty concept_ids list for that objective.',
        {'objectives': lecture['objectives'], 'concepts': [{'id': c['id'], 'label': c['label']} for c in concepts],
         'evidence': [{'concept_id': e['concept_id'], 'text': e['text']} for e in lecture['evidence'] if e.get('verified')][:30]})
    allowed = {c['id'] for c in concepts}
    links = {link.objective: link for link in response.links if link.objective in lecture['objectives']}
    return {'coverage': [{'objective': objective,
        'evidence_concepts': [cid for cid in links[objective].concept_ids if cid in allowed] if objective in links else [],
        'status': 'needs_manual_mapping', 'note': links[objective].explanation if objective in links else 'Chưa có liên kết đề xuất.'}
        for objective in lecture['objectives']], 'method': 'local_llm_suggestion_pending_teacher'}


def normalized(text):
    return ' '.join(unicodedata.normalize('NFKC', text).casefold().split())


def source_segments(lecture):
    rows = []
    for kind, values in [('transcript', lecture.get('transcript', [])), ('slide', lecture.get('slides', []))]:
        for index, value in enumerate(values):
            text = value.get('text', '').strip()
            if not text:
                continue
            asset_id = value.get('asset_id') or next((a['id'] for a in lecture.get('assets', [])
                if a['kind'] == ('slides' if kind == 'slide' else 'transcript')), None)
            if kind == 'transcript' and not asset_id:
                asset_id = next((a['id'] for a in lecture.get('assets', []) if a['kind'] == 'video'), None)
            # Long pages are partitioned completely, with overlap and stable source identity.
            for offset in range(0, len(text), 2200):
                part = text[max(0, offset - 200):offset + 2200]
                visual_frame = value.get('source_type') == 'sampled_frame_ocr'
                rows.append({'id': f'{kind}-{index}-{offset}', 'asset_id': asset_id, 'kind': 'video' if visual_frame else kind,
                    'text': part, 'start': value.get('frame_timestamp') if visual_frame else (value.get('start') if kind == 'transcript' else None),
                    'end': value.get('end') if kind == 'transcript' else None,
                    'page': value.get('page') if kind == 'slide' and not visual_frame and not value.get('section_index') else None,
                    'section_index': value.get('section_index'),
                    'source_type': value.get('source_type', 'document_parser'), 'version': lecture['version']})
    return rows


def quote_projection(text, code=False):
    """Normalize presentation only; keep accents, numbers, negation and code operators."""
    chars, offsets = [], []
    for index, char in enumerate(text):
        normalized_char = unicodedata.normalize('NFKC', char)
        for value in normalized_char if code else normalized_char.casefold():
            value = ' ' if value.isspace() or (not code and value in '.,;:!?“”‘’"') else value
            if value == ' ' and (not chars or chars[-1] == ' '):
                continue
            chars.append(value)
            offsets.append(index)
    while chars and chars[-1] == ' ':
        chars.pop(); offsets.pop()
    return ''.join(chars), offsets


def supported(reference, sources):
    source = sources.get(reference.source_id)
    if not source:
        return None
    if reference.quote in source['text']:
        return {**source, 'matched_quote': reference.quote, 'quote_validation': 'exact_quote_match'}
    code = bool(re.search(r'[=<>+*/{}\[\]()]|\w\.\w', source['text'] + reference.quote))
    wanted, _ = quote_projection(reference.quote, code)
    actual, offsets = quote_projection(source['text'], code)
    if len(wanted) < 12:
        return None
    start = actual.find(wanted)
    while start >= 0:
        end = start + len(wanted)
        if (start == 0 or not actual[start - 1].isalnum()) and (end == len(actual) or not actual[end].isalnum()):
            quote = source['text'][offsets[start]:offsets[end - 1] + 1]
            return {**source, 'matched_quote': quote, 'quote_validation': 'normalized_quote_source_span'}
        start = actual.find(wanted, start + 1)
    return None


def extract_graph(lecture):
    rows = source_segments(lecture)
    if not rows:
        raise ValueError('Chưa đọc được nội dung nguồn để tạo bản đồ tri thức. Kiểm tra âm thanh, OCR hoặc cung cấp văn bản.')
    maximum = int(os.environ.get('LECTURE_MAX_SOURCE_SEGMENTS', '160'))
    if len(rows) > maximum:
        raise ValueError(f'Nguồn có {len(rows)} đoạn, vượt giới hạn xử lý {maximum}; chia học liệu thành các bài nhỏ hơn. Chưa tạo kết quả từ một phần nguồn.')
    concepts, edges, evidence, label_keys = {}, {}, {}, {}
    rejected = 0
    batches = []
    grouped = []
    current_batch = []
    characters = 0
    for row in rows:
        if current_batch and (len(current_batch) >= 10 or characters + len(row['text']) > 4000):
            grouped.append(current_batch)
            current_batch, characters = [], 0
        current_batch.append(row)
        characters += len(row['text'])
    if current_batch:
        grouped.append(current_batch)
    start = 0
    key_map, relation_batches, ambiguous_keys = {}, [], set()
    for batch in grouped:
        ai_runtime.checkpoint()
        sources = {row['id']: row for row in batch}
        local_keys = dict(key_map)
        result = ai_runtime.generate(GraphBatch,
            'Extract a concise knowledge graph of the computing lesson in SOURCES. '
            'Use at most 5 concepts and 4 relations per batch if supported; no predefined BFS/DFS vocabulary. '
            'Be concise: descriptions under 120 characters and quotes under 160 characters. '
            'Each concept AND each relation needs an exact verbatim quote and source_id from SOURCES. '
            'Reuse existing_concept_id from KNOWN_CONCEPTS only for exactly the same entity, including true naming aliases. '
            'Do not merge broader, narrower or merely related concepts. '
            'relations.source and relations.target may be concept.key values or known concept IDs, never source IDs. '
            'For example, if keys are module and import, use source=import,target=module,type=uses. '
            'Relations must be explicitly supported by their quotes, not merely co-occurrence. '
            'Use canonical concept names and stable short keys. Do not infer prerequisite order unless explicit. '
            'If sources have no educational facts, return empty arrays.', {'sources': batch, 'known_concepts': [{'id': c['id'], 'label': c['label'], 'description': c['description']} for c in concepts.values()]})
        for node in result.concepts:
            refs = [(ref, supported(ref, sources)) for ref in node.references]
            refs = [(ref, source) for ref, source in refs if source]
            if not refs:
                rejected += 1
                continue
            canonical = normalized(node.label)
            existing = node.existing_concept_id if node.existing_concept_id in concepts else None
            cid = existing or label_keys.get(canonical) or 'concept-' + hashlib.sha256(canonical.encode()).hexdigest()[:12]
            label_keys[canonical] = cid
            key_map[cid] = cid
            local_keys[cid] = cid
            # Model-local aliases must never shadow another canonical concept ID.
            if node.key not in concepts or node.key == cid:
                local_keys[node.key] = cid
                if node.key in key_map and key_map[node.key] != cid:
                    ambiguous_keys.add(node.key)
                    key_map.pop(node.key, None)
                if node.key not in ambiguous_keys:
                    key_map[node.key] = cid
            concept = concepts.setdefault(cid, {'id': cid, 'label': node.label, 'description': node.description,
                'verified': False, 'evidence_ids': [], 'method': 'local_llm', 'model': ai_runtime.model_name()})
            for ref, source in refs:
                eid = 'ev-' + hashlib.sha256((cid + source['id'] + source['matched_quote']).encode()).hexdigest()[:16]
                evidence[eid] = {'id': eid, 'concept_id': cid, 'kind': source['kind'],
                    'asset_id': source['asset_id'], 'source_segment_id': source['id'], 'source_version': lecture['version'],
                    'start': source['start'], 'end': source['end'], 'slide_page': source['page'],
                    'text': source['matched_quote'], 'source_type': source['source_type'], 'valid': True, 'verified': False,
                    'section_index': source.get('section_index'),
                    'validation': source['quote_validation'], 'semantic_review': 'pending_teacher'}
                if eid not in concept['evidence_ids']:
                    concept['evidence_ids'].append(eid)
        relation_batches.append((result.relations, sources, local_keys))
        batches.append({'offset': start, 'segments': len(batch), 'concepts_proposed': len(result.concepts)})
        start += len(batch)
    # A second relation pass can now reference concepts first discovered in later batches.
    if len(grouped) > 1 and concepts:
        memory = [{'id': c['id'], 'label': c['label'], 'description': c['description']} for c in concepts.values()]
        for batch in grouped:
            result = ai_runtime.generate(GraphBatch,
                'Extract only explicit relations supported by SOURCES between KNOWN_CONCEPTS. '
                'Return concepts=[]; use known concept IDs as source/target. A co-occurrence is not a relation. '
                'Each relation needs a verbatim quote and source_id from this SOURCES batch.',
                {'sources': batch, 'known_concepts': memory, 'phase': 'relations'})
            relation_batches.append((result.relations, {r['id']: r for r in batch}, dict(key_map)))
    for relations, sources, aliases in relation_batches:
        for relation in relations:
            source_id, target_id = aliases.get(relation.source), aliases.get(relation.target)
            refs = [(ref, supported(ref, sources)) for ref in relation.references]
            refs = [(ref, source) for ref, source in refs if source]
            if not source_id or not target_id or source_id == target_id or not refs:
                rejected += 1
                continue
            edge_id = 'edge-' + hashlib.sha256(f'{source_id}:{target_id}:{relation.type}'.encode()).hexdigest()[:12]
            edge_evidence = []
            for ref, source in refs:
                eid = 'ev-' + hashlib.sha256((edge_id + source['id'] + source['matched_quote']).encode()).hexdigest()[:16]
                evidence[eid] = {'id': eid, 'concept_id': source_id, 'edge_id': edge_id, 'kind': source['kind'],
                    'asset_id': source['asset_id'], 'source_segment_id': source['id'], 'source_version': lecture['version'],
                    'start': source['start'], 'end': source['end'], 'slide_page': source['page'],
                    'text': source['matched_quote'], 'source_type': source['source_type'], 'valid': True, 'verified': False,
                    'section_index': source.get('section_index'),
                    'validation': source['quote_validation'], 'semantic_review': 'pending_teacher'}
                edge_evidence.append(eid)
            edge_evidence = list(dict.fromkeys(edges.get(edge_id, {}).get('evidence_ids', []) + edge_evidence))
            edges[edge_id] = {'id': edge_id, 'source': source_id, 'target': target_id, 'type': relation.type,
                'label': relation.label, 'evidence_ids': edge_evidence, 'verified': False, 'method': 'local_llm'}
    for i, node in enumerate(concepts.values()):
        node.update(x=100 + (i % 4) * 180, y=60 + (i // 4) * 140)
    lecture.update(concepts=list(concepts.values()), edges=list(edges.values()), evidence=list(evidence.values()),
        knowledge_method='local_llm', source_segments=rows,
        extraction_report={'source_segments': len(rows), 'processed_segments': len(rows), 'rejected_unsupported': rejected,
            'batches': batches, 'relation_passes': 2 if len(grouped) > 1 else 1, 'entity_resolution': 'accumulated_ids_and_explicit_aliases_pending_teacher', 'model': ai_runtime.model_name(), 'semantic_review': 'pending_teacher'})
    ai_runtime.checkpoint()
    with store.LOCK:
        current = store.get('lectures', lecture['id'])
        if current and current['version'] != lecture['version']:
            raise ValueError('Nguồn đã đổi phiên bản; không lưu kết quả AI của nguồn cũ.')
        store.put('lectures', lecture)
    return {'concept_count': len(concepts), 'edge_count': len(edges), 'evidence_count': len(evidence),
        'method': 'local_llm_source_span_grounding', **lecture['extraction_report']}


def lexical_ranking(question, documents):
    """BM25 with document-frequency IDF, distinct from semantic embedding retrieval."""
    tokenize = lambda text: re.findall(r'\w+', normalized(text))
    terms = tokenize(question)
    docs = [tokenize(doc['text']) for doc in documents]
    average = sum(map(len, docs)) / len(docs) if docs else 1
    scores = []
    for index, tokens in enumerate(docs):
        counts = Counter(tokens)
        score = 0
        for term in terms:
            df = sum(term in doc for doc in docs)
            frequency = counts[term]
            score += math.log(1 + (len(docs) - df + .5) / (df + .5)) * frequency * 2.5 / (
                frequency + 1.5 * (.25 + .75 * len(tokens) / max(average, 1)))
        scores.append((index, score))
    return sorted(scores, key=lambda row: -row[1])


def retrieve(lecture, question):
    documents = [e for e in lecture.get('evidence', []) if e.get('verified') and e.get('valid')]
    # Deduplicate by actual asset/position/text, preserving separate resources.
    documents = list({(e.get('asset_id'), e.get('start'), e.get('slide_page'), e['text']): e for e in documents}.values())
    if not documents:
        return [], {'method': 'hybrid_bm25_embedding', 'reason': 'no_verified_source'}
    lexical = lexical_ranking(question, documents)
    query = ai_runtime.embeddings([question])[0]
    vectors = ai_runtime.cached_embeddings([e['text'] for e in documents])
    def cosine(a, b):
        if len(a) != len(b):
            raise ai_runtime.ProviderUnavailable('Kích thước embedding không khớp; kiểm tra phiên bản mô hình.')
        denominator = math.sqrt(sum(x*x for x in a) * sum(x*x for x in b))
        return sum(x*y for x, y in zip(a, b)) / denominator if denominator else 0
    threshold = float(os.environ.get('LECTURE_RETRIEVAL_MIN_COSINE', '.45'))
    semantic = sorted([(i, cosine(query, v)) for i, v in enumerate(vectors)], key=lambda row: -row[1])
    fused = Counter()
    for ranking in ([row for row in lexical if row[1] > 0], [row for row in semantic if row[1] >= threshold]):
        for rank, (index, _) in enumerate(ranking, 1):
            fused[index] += 1 / (60 + rank)
    chosen = [documents[i] for i, _ in fused.most_common(6)]
    return chosen, {'method': 'hybrid_bm25_embedding_rrf', 'candidate_count': len(documents),
        'retrieved_ids': [e['id'] for e in chosen], 'graph_context': [
            edge for edge in lecture.get('edges', []) if edge.get('verified') and
            any(e['concept_id'] in (edge['source'], edge['target']) for e in chosen)]}


def answer(lecture, question, citations):
    if not citations:
        return {'answer': 'Chưa có nguồn đã duyệt phù hợp để trả lời. Vui lòng bổ sung học liệu hoặc hỏi giảng viên.',
                'citations': [], 'limitation': 'Không có nguồn được phép sử dụng.', 'method': 'source_abstention'}
    response = ai_runtime.generate(TutorAnswer,
        'Answer QUESTION using only EVIDENCE. Cite only supplied evidence IDs. '
        'Answer in Vietnamese in at most 3 concise sentences; use only details in the supplied quotes. '
        'Do not add a long preface, general lecture, or unsupported step. '
        'If evidence does not support an answer, set insufficient_source=true and explain the missing information. '
        'Do not claim that the presence of a citation proves factual correctness.',
        {'question': question, 'evidence': [{'id': e['id'], 'text': e['text']} for e in citations]}, max_tokens=768)
    allowed = {e['id']: e for e in citations}
    if response.insufficient_source or not response.evidence_ids or any(eid not in allowed for eid in response.evidence_ids):
        return {'answer': 'Nguồn hiện tại chưa đủ để trả lời câu hỏi này một cách có căn cứ. Vui lòng hỏi giảng viên hoặc bổ sung tài liệu.',
            'citations': [], 'limitation': 'Từ chối trả lời vì thiếu nguồn hoặc mã dẫn chứng không hợp lệ.', 'method': 'source_abstention'}
    return {'answer': response.answer, 'citations': [allowed[eid] for eid in dict.fromkeys(response.evidence_ids)],
        'limitation': 'AI sinh từ nguồn đã duyệt; kiểm tra dẫn chứng và phản hồi giảng viên nếu có sai sót.',
        'method': 'local_rag', 'model': ai_runtime.model_name()}


def generate_questions(lecture):
    evidence = [e for e in lecture['evidence'] if e.get('valid') and e.get('verified')]
    response = ai_runtime.generate(Questions,
        'Create 3-5 multiple-choice questions strictly supported by EVIDENCE and CONCEPTS. '
        'Exactly one correct option per question. Use supplied concept_id and evidence_id only. '
        'Question and answer must be answerable from the cited passage. Return drafts for teacher review.',
        {'concepts': [{'id': c['id'], 'label': c['label']} for c in lecture['concepts'] if c.get('verified')],
         'evidence': [{'id': e['id'], 'concept_id': e['concept_id'], 'text': e['text']} for e in evidence[:18]]})
    allowed = {e['id']: e for e in evidence}
    questions = []
    for index, q in enumerate(response.questions):
        source = allowed.get(q.evidence_id)
        if not source or source['concept_id'] != q.concept_id or q.correct_index >= len(q.options) or len(set(q.options)) != len(q.options):
            continue
        questions.append({'id': f'question-{index}', 'text': q.text, 'concept_id': q.concept_id, 'evidence_id': q.evidence_id,
            'options': [{'id': str(i), 'text': text} for i, text in enumerate(q.options)],
            'correct_option_id': str(q.correct_index), 'explanation': q.explanation, 'method': 'local_llm_draft'})
    if not questions:
        raise ValueError('Không tạo được câu hỏi có dẫn chứng hợp lệ. Chưa có đề để phát hành.')
    return questions
