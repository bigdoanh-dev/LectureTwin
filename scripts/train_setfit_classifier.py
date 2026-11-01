#!/usr/bin/env python3
"""Fine-tune independent development folds, tune per-label OOF thresholds, test frozen holdout."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from train_question_classifier import select_thresholds, validate_dataset


def main():
    import numpy as np
    from datasets import Dataset
    from setfit import SetFitModel, Trainer, TrainingArguments
    from sklearn.metrics import f1_score, hamming_loss, classification_report
    from app.question_model import LABELS
    parser = argparse.ArgumentParser()
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--baseline', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--allow-synthetic', action='store_true')
    parser.add_argument('--steps', type=int, default=40)
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    baseline = json.loads((args.baseline / 'training-report.json').read_text())
    if hashlib.sha256(raw).hexdigest() != baseline['dataset_sha256']:
        raise SystemExit('Dataset khác baseline; không được dùng lại split cũ.')
    rows = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
    validate_dataset(rows, args.allow_synthetic)
    splits = json.loads((args.baseline / 'split-manifest.json').read_text())
    if not splits.get('development_folds'):
        raise SystemExit('Baseline cũ có validation một nhóm; chạy lại baseline với development OOF trước.')
    by_id = {row['id']: row for row in rows}
    development_ids, test_ids = splits['development'], splits['test']
    if set(development_ids) & set(test_ids) or {by_id[i]['group'] for i in development_ids} & {by_id[i]['group'] for i in test_ids}:
        raise SystemExit('Split bị trùng nhóm giữa development và test.')
    def dataset(indices):
        selected = [by_id[index] for index in indices]
        return Dataset.from_dict({'text': [row['text'] for row in selected],
            'label': [[int(label in row['labels']) for label in LABELS] for row in selected]})
    args.output.mkdir(parents=True, exist_ok=True)
    model_name = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
    started = time.perf_counter()
    def fit(indices, name):
        # A fresh encoder per fold prevents representation leakage from validation examples.
        model = SetFitModel.from_pretrained(model_name, multi_target_strategy='one-vs-rest')
        training = TrainingArguments(output_dir=str(args.output / ('checkpoints-' + name)), max_steps=args.steps,
            batch_size=8, num_epochs=1, num_iterations=4, max_length=128,
            report_to='none', save_strategy='no', show_progress_bar=False, seed=42)
        Trainer(model=model, args=training, train_dataset=dataset(indices)).train()
        return model
    probabilities = {}
    for number, fold in enumerate(splits['development_folds']):
        train_ids, validation_ids = fold['train'], fold['validation']
        if set(train_ids) & set(validation_ids) or set(train_ids + validation_ids) != set(development_ids):
            raise SystemExit('Fold không phân hoạch development.')
        if {by_id[i]['group'] for i in train_ids} & {by_id[i]['group'] for i in validation_ids}:
            raise SystemExit('Fold bị trùng nhóm nguồn.')
        if set(validation_ids) & probabilities.keys():
            raise SystemExit('Mỗi development sample chỉ được xuất hiện ngoài fold một lần.')
        model = fit(train_ids, str(number))
        fold_probabilities = np.asarray(model.predict_proba(dataset(validation_ids)['text'], as_numpy=True))
        probabilities.update(dict(zip(validation_ids, fold_probabilities)))
        del model
    if set(probabilities) != set(development_ids):
        raise SystemExit('Thiếu dự đoán ngoài fold.')
    development = dataset(development_ids)
    thresholds = select_thresholds(np.asarray(development['label']), np.asarray([probabilities[i] for i in development_ids]))
    model = fit(development_ids, 'final')
    test = dataset(test_ids)
    predicted = np.asarray(model.predict_proba(test['text'], as_numpy=True)) >= thresholds
    report = {'method': 'setfit_multilingual_encoder_finetuning', 'base_model': model_name,
        'dataset_sha256': baseline['dataset_sha256'], 'training_provenance': baseline['provenance'],
        'split_method': baseline['split_method'], 'development_folds': len(splits['development_folds']),
        'steps_per_fit': args.steps, 'seed': 42, 'thresholds_selected_on_development_oof': dict(zip(LABELS, thresholds)),
        'train_seconds': round(time.perf_counter() - started, 2),
        'test_macro_f1': f1_score(test['label'], predicted, average='macro', zero_division=0),
        'test_micro_f1': f1_score(test['label'], predicted, average='micro', zero_division=0),
        'test_hamming_loss': hamming_loss(test['label'], predicted),
        'test_predicted_positive_counts': predicted.sum(axis=0).tolist(),
        'per_label': classification_report(test['label'], predicted, target_names=LABELS, output_dict=True, zero_division=0),
        'limitations': baseline['limitations'] + ['Mỗi fold tái khởi tạo encoder; chỉ một seed; chưa đủ dữ liệu để chứng minh tổng quát hóa.']}
    model.save_pretrained(str(args.output / 'model'))
    (args.output / 'decision-thresholds.json').write_text(json.dumps({'labels': LABELS, 'thresholds': thresholds}))
    (args.output / 'training-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
