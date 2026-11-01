"""Regression checks for group leakage, threshold selection and synthetic label provenance."""
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np

SCRIPTS = Path(__file__).resolve().parents[2] / 'scripts'


def load_script(name):
    spec = importlib.util.spec_from_file_location(name, SCRIPTS / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_development_oof_never_reuses_source_group_or_holdout():
    training = load_script('train_question_classifier')
    groups = np.repeat(np.arange(7), 3)
    development = np.arange(15)
    holdout = set(range(15, 21))
    seen = []
    for train, validation in training.development_folds(development, groups):
        assert not set(groups[train]) & set(groups[validation])
        assert set(train) | set(validation) == set(development)
        assert not (set(train) | set(validation)) & holdout
        seen.extend(validation)
    assert sorted(seen) == list(development)


def test_thresholds_are_label_specific_and_sparse_label_is_not_tuned():
    training = load_script('train_question_classifier')
    truth = np.array([[1, 1, 1], [1, 1, 0], [1, 1, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]])
    probabilities = np.array([[.7, .4, .1], [.8, .45, .1], [.9, .5, .1], [.6, .1, .1], [.65, .2, .1], [.3, .3, .1]])
    thresholds = training.select_thresholds(truth, probabilities)
    assert thresholds == [.7, .4, .5]
    assert np.array_equal(probabilities[:, :2] >= thresholds[:2], truth[:, :2])


def test_generator_labels_in_separate_blinded_call_and_rejects_ambiguous_source(tmp_path, monkeypatch):
    generation = load_script('generate_question_pilot')
    sources = [
        {'id': 'a', 'kind': 'transcript', 'text': 'Mô đun là một tệp Python. Nó chứa hàm và biến.'},
        {'id': 'b', 'kind': 'transcript', 'text': 'Mô đun là một tệp Python. Ví dụ này tạo tệp mới.'},
    ]
    (tmp_path / 'source-one.json').write_text(json.dumps({'lecture': {'id': 'lecture1', 'title': 'Nguồn thử',
        'source_segments': sources}, 'stats': {'source_sha256': 'hash'}}))
    calls = []
    def generate(schema, prompt, payload):
        calls.append((schema.__name__, payload))
        if schema is generation.Batch:
            return schema(questions=[
                {'text': 'Mô đun là gì trong Python?', 'source_id': 'a', 'quote': 'Mô đun là một tệp Python.'},
                {'text': 'Hãy tạo một tệp mô đun chứa biến x.', 'source_id': 'wrong', 'quote': 'Mô đun là một tệp Python.'},
            ])
        assert schema is generation.Labels
        assert all(set(question) == {'question_id', 'text'} for question in payload['questions'])
        return schema(annotations=[{'question_id': 'q-0', 'labels': ['recall']}, {'question_id': 'q-1', 'labels': ['apply']}])
    monkeypatch.setattr(generation.ai_runtime, 'generate', generate)
    monkeypatch.setattr(generation.ai_runtime, 'model_name', lambda: 'test-model')
    output = tmp_path / 'pilot.jsonl'
    monkeypatch.setattr(sys, 'argv', ['generate', str(tmp_path), '--output', str(output)])
    generation.main()
    rows = [json.loads(line) for line in output.read_text().splitlines()]
    assert [name for name, _ in calls] == ['Batch', 'Labels']
    assert len(rows) == 1  # Ambiguous quote cannot repair the unknown source ID.
    assert rows[0]['labels'] == ['recall']
    assert rows[0]['labeling_method'] == 'separate_call_blinded_to_requested_level'
    assert rows[0]['annotation_status'] == 'synthetic_pending_human_review'
    assert 'labels' not in generation.PilotQuestion.model_fields


def test_training_artifact_never_fits_test_vocabulary(tmp_path, monkeypatch):
    training = load_script('train_question_classifier')
    rows = [{'id': f'{group}-{number}', 'text': f'groupunique{group} question variant{number} topic',
             'labels': [['recall'], ['explain'], ['apply']][number % 3], 'group': f'video-{group}',
             'provenance': 'synthetic_test_fixture', 'annotation_status': 'synthetic_pending_human_review'}
            for group in range(7) for number in range(6)]
    data = tmp_path / 'fixture.jsonl'
    data.write_text(''.join(json.dumps(row) + '\n' for row in rows))
    output = tmp_path / 'trained'
    monkeypatch.setattr(sys, 'argv', ['train', str(data), '--output', str(output), '--allow-synthetic'])
    training.main()
    artifact = json.loads((output / 'question-classifier.json').read_text())
    report = json.loads((output / 'training-report.json').read_text())
    manifest = json.loads((output / 'split-manifest.json').read_text())
    assert artifact['schema_version'] == 2 and len(artifact['thresholds']) == 3
    assert not set(report['split_groups']['development']) & set(report['split_groups']['test'])
    assert not set(manifest['development']) & set(manifest['test'])
    for group in report['split_groups']['test']:
        assert 'groupunique' + group.split('-')[-1] not in artifact['vocabulary']
    assert len(manifest['development_folds']) == len(report['split_groups']['development'])
