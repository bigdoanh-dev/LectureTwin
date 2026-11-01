#!/usr/bin/env python3
"""Generate explicitly synthetic, source-grounded pilot questions for later human annotation."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from difflib import SequenceMatcher
import unicodedata
from typing import Literal
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import ai_runtime


class PilotQuestion(BaseModel):
    text: str = Field(min_length=8, max_length=600)
    source_id: str
    quote: str = Field(min_length=3, max_length=220)


class Batch(BaseModel):
    questions: list[PilotQuestion] = Field(min_length=1, max_length=7)


class SuggestedLabel(BaseModel):
    question_id: str
    labels: list[Literal['recall', 'explain', 'apply']] = Field(min_length=1, max_length=3)


class Labels(BaseModel):
    annotations: list[SuggestedLabel] = Field(min_length=1, max_length=7)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source_results', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--augment-existing', action='store_true')
    args = parser.parse_args()
    rows = ([json.loads(line) for line in args.output.read_text().splitlines() if line.strip()]
            if args.augment_existing and args.output.exists() else [])
    seen = {' '.join(row['text'].casefold().split()) for row in rows}
    counts_by_group = {}
    for row in rows:
        counts_by_group[row['group']] = counts_by_group.get(row['group'], 0) + 1
    diagnostics = []

    def normalized(text):
        return ' '.join(unicodedata.normalize('NFC', text).casefold().split())

    for artifact in sorted(args.source_results.glob('source-*.json')):
        if artifact.name == 'source-results.json':
            continue
        document = json.loads(artifact.read_text())
        lecture = document['lecture']
        sources = lecture.get('source_segments', [])
        if not sources:
            continue
        if counts_by_group.get(lecture['id'], 0) >= 5:
            continue
        # Sample distinct, information-rich segments and keep each clip as its own split group.
        transcript = [source for source in sources if source.get('kind') == 'transcript']
        candidates = [source for source in transcript if len(source['text'].strip()) >= 24
                      and 'subscribe' not in normalized(source['text'])]
        if not candidates:
            candidates = [source for source in sources if source.get('kind') != 'video'
                          and len(source['text'].strip()) >= 40]
        selected = candidates[::max(1, len(candidates) // 7)][:7]
        requested_levels = ['recall', 'explain', 'apply']
        tasks = [{**source, 'requested_level': requested_levels[index % 3]} for index, source in enumerate(selected)]
        response = ai_runtime.generate(Batch,
            'Generate exactly one concise Vietnamese student question for EACH source segment. '
            'Copy its source_id exactly; the quote MUST be a verbatim substring of that same segment. '
            'If a segment is unclear or only noise/code fragments, omit it. Never invent a quote or source ID. '
            'Follow each source task requested_level: recall=definition/facts, explain=why/how/comparison, apply=solve a concrete example or code problem. '
            'Do not merely include a level keyword; an apply task must actually require applying knowledge. '
            'Do not put source IDs or level labels in question text. Do not generate labels. '
            'Do not generate answers.',
            {'sources': tasks})
        question_ids = ['q-' + str(index) for index in range(len(response.questions))]
        labeling = ai_runtime.generate(Labels,
            'Independently classify each Vietnamese student QUESTION by the cognitive work it requires. '
            'recall=retrieve a fact/definition; explain=reason about why/how or compare; '
            'apply=solve a concrete example/code/problem using knowledge. A question may have multiple labels. '
            'Do not classify by isolated words. Do not infer the generator intent. Return exact question_id. '
            'These are synthetic suggested labels requiring human review.',
            {'questions': [{'question_id': identifier, 'text': question.text}
                for identifier, question in zip(question_ids, response.questions)]})
        labels = {entry.question_id: entry.labels for entry in labeling.annotations if entry.question_id in question_ids}
        level_by_source = {task['id']: task['requested_level'] for task in tasks}
        lookup = {source['id']: source for source in selected}
        all_sources = {source['id']: source for source in sources}
        counts = {'model_returned': len(response.questions), 'unknown_source': 0, 'quote_not_found': 0,
                  'exact_duplicates': 0, 'near_duplicates': 0, 'missing_annotation': 0, 'accepted': 0}
        for identifier, q in zip(question_ids, response.questions):
            if identifier not in labels:
                counts['missing_annotation'] += 1
                continue
            text_key = ' '.join(q.text.casefold().split())
            quote = normalized(q.quote)
            source = lookup.get(q.source_id)
            if not source or quote not in normalized(source['text']):
                # Models sometimes corrupt an opaque segment ID. Recover it only when
                # the verbatim quote identifies a real source segment in this video.
                matches = [row for row in all_sources.values() if len(quote) >= 3 and quote in normalized(row['text'])]
                source = matches[0] if len(matches) == 1 else None
            if not source:
                if q.source_id not in all_sources:
                    counts['unknown_source'] += 1
                counts['quote_not_found'] += 1
                continue
            if text_key in seen:
                counts['exact_duplicates'] += 1
                continue
            if any(SequenceMatcher(None, text_key, previous).ratio() >= .88 for previous in seen):
                counts['near_duplicates'] += 1
                continue
            seen.add(text_key)
            rows.append({'id': 'pilot-' + hashlib.sha256(q.text.encode()).hexdigest()[:16], 'text': q.text,
                'labels': sorted(set(labels[identifier])), 'requested_level': level_by_source.get(source['id']),
                'group': lecture['id'], 'source_segment_id': source['id'],
                'source_sha256': document['stats']['source_sha256'], 'quote': q.quote,
                'provenance': 'local_llm_generated_from_user_video_asr', 'annotation_status': 'synthetic_pending_human_review',
                'generator_model': ai_runtime.model_name(), 'labeler_model': ai_runtime.model_name(),
                'labeling_method': 'separate_call_blinded_to_requested_level',
                'label_limitations': 'Same model family labels remain correlated and synthetic; human review required.'})
            counts['accepted'] += 1
            counts_by_group[lecture['id']] = counts_by_group.get(lecture['id'], 0) + 1
        diagnostics.append({'source': lecture['title'], **counts})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
        print(json.dumps({'source': lecture['title'], 'total_questions': len(rows),
            'annotation_status': 'synthetic_pending_human_review', **counts}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
