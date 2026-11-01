#!/usr/bin/env python3
"""Fine-tune a multilingual encoder on the exact grouped split of the baseline run."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))


def main():
    import numpy as np
    from datasets import Dataset
    from setfit import SetFitModel, Trainer, TrainingArguments
    from sklearn.metrics import f1_score, classification_report
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
        raise SystemExit('Dataset khác với lần chạy baseline; không được dùng lại split cũ.')
    rows = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
    if any(row.get('annotation_status') != 'human_reviewed' for row in rows) and not args.allow_synthetic:
        raise SystemExit('Nhãn chưa duyệt; --allow-synthetic chỉ dành cho thí nghiệm sơ bộ có ghi rõ giới hạn.')
    splits = json.loads((args.baseline / 'split-manifest.json').read_text())
    by_id = {row['id']: row for row in rows}
    def dataset(name):
        selected = [by_id[index] for index in splits[name]]
        return Dataset.from_dict({'text': [row['text'] for row in selected],
            'label': [[int(label in row['labels']) for label in LABELS] for row in selected]})
    train, validation, test = dataset('train'), dataset('validation'), dataset('test')
    args.output.mkdir(parents=True, exist_ok=True)
    model_name = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
    started = time.perf_counter()
    model = SetFitModel.from_pretrained(model_name, multi_target_strategy='one-vs-rest')
    training = TrainingArguments(output_dir=str(args.output / 'checkpoints'), max_steps=args.steps,
        batch_size=8, num_epochs=1, num_iterations=4, max_length=128,
        report_to='none', save_strategy='no', show_progress_bar=False, seed=42)
    trainer = Trainer(model=model, args=training, train_dataset=train, eval_dataset=validation)
    trainer.train()
    # Select a decision threshold on validation, never on test.
    val_probabilities = np.asarray(model.predict_proba(validation['text'], as_numpy=True))
    threshold = max((.3, .4, .5, .6), key=lambda t: f1_score(validation['label'], val_probabilities >= t, average='macro', zero_division=0))
    predicted = np.asarray(model.predict_proba(test['text'], as_numpy=True)) >= threshold
    report = {'method': 'setfit_multilingual_encoder_finetuning', 'base_model': model_name,
        'dataset_sha256': baseline['dataset_sha256'], 'training_provenance': baseline['provenance'],
        'steps': args.steps, 'seed': 42, 'threshold_selected_on_validation': threshold,
        'train_seconds': round(time.perf_counter() - started, 2),
        'test_macro_f1': f1_score(test['label'], predicted, average='macro', zero_division=0),
        'test_micro_f1': f1_score(test['label'], predicted, average='micro', zero_division=0),
        'per_label': classification_report(test['label'], predicted, target_names=LABELS, output_dict=True, zero_division=0),
        'limitations': baseline['limitations'] + ['Một seed huấn luyện sơ bộ; cần lặp thí nghiệm trên bộ nhãn được duyệt.']}
    model.save_pretrained(str(args.output / 'model'))
    (args.output / 'training-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
