#!/usr/bin/env python3
"""Generate explicitly synthetic, source-grounded pilot questions for later human annotation."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
from difflib import SequenceMatcher
from typing import Literal
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from app import ai_runtime


class PilotQuestion(BaseModel):
    text: str = Field(min_length=8, max_length=600)
    labels: list[Literal['recall', 'explain', 'apply']] = Field(min_length=1, max_length=3)
    source_id: str
    quote: str = Field(min_length=3, max_length=800)


class Batch(BaseModel):
    questions: list[PilotQuestion] = Field(min_length=12, max_length=28)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source_results', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows = []
    seen = set()
    for artifact in sorted(args.source_results.glob('source-*.json')):
        if artifact.name == 'source-results.json':
            continue
        document = json.loads(artifact.read_text())
        lecture = document['lecture']
        sources = lecture.get('source_segments', [])
        if not sources:
            continue
        # Questions remain grouped by the originating clip to prevent paraphrase leakage.
        selected = sources[::max(1, len(sources) // 10)][:12]
        response = ai_runtime.generate(Batch,
            'Generate 21 varied Vietnamese student questions about these Python lesson sources. '
            'Include 3 questions for EACH nonempty label combination of recall, explain, apply. '
            'recall=definition or recalling facts; explain=why/how/comparison; apply=code/example/problem solving. '
            'Include informal wording and questions with multiple requests. '
            'Use only topics supported by the supplied SOURCES; copy a supporting quote verbatim and its source_id. '
            'Labels are synthetic training suggestions, not human annotations. Do not generate answers.',
            {'sources': selected})
        lookup = {source['id']: source for source in selected}
        for q in response.questions:
            source = lookup.get(q.source_id)
            text_key = ' '.join(q.text.casefold().split())
            if not source or q.quote not in source['text'] or text_key in seen or any(SequenceMatcher(None, text_key, previous).ratio() >= .88 for previous in seen):
                continue
            seen.add(text_key)
            rows.append({'id': 'pilot-' + hashlib.sha256(q.text.encode()).hexdigest()[:16], 'text': q.text,
                'labels': sorted(set(q.labels)), 'group': lecture['id'], 'source_segment_id': q.source_id,
                'source_sha256': document['stats']['source_sha256'], 'quote': q.quote,
                'provenance': 'local_llm_generated_from_user_video_asr', 'annotation_status': 'synthetic_pending_human_review',
                'generator_model': ai_runtime.model_name()})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(''.join(json.dumps(row, ensure_ascii=False) + '\n' for row in rows))
        print(json.dumps({'source': lecture['title'], 'total_questions': len(rows),
            'annotation_status': 'synthetic_pending_human_review'}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
