#!/usr/bin/env python3
"""Train/evaluate grouped multilabel baselines; private data and artifacts stay outside Git."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))


def main():
    import numpy as np
    import sklearn
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.multiclass import OneVsRestClassifier
    from sklearn.model_selection import GroupShuffleSplit
    from sklearn.metrics import f1_score, hamming_loss, classification_report
    from app.question_insights import classify
    from app.question_model import LABELS

    parser = argparse.ArgumentParser()
    parser.add_argument('dataset', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--allow-synthetic', action='store_true', help='Report results as a synthetic pilot, never student validation')
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    rows = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
    if len(rows) < 30:
        raise SystemExit('Cần tối thiểu 30 câu hỏi và đủ nhóm độc lập để chia tập.')
    texts = [r['text'].strip() for r in rows]
    if len({text.casefold() for text in texts}) != len(texts):
        raise SystemExit('Dữ liệu có câu hỏi trùng; loại trùng trước khi chia tập.')
    if any(not set(r['labels']) <= set(LABELS) or not r.get('group') or not r.get('provenance') for r in rows):
        raise SystemExit('Mỗi câu cần labels hợp lệ, group và provenance.')
    synthetic = any(r.get('annotation_status') != 'human_reviewed' for r in rows)
    if synthetic and not args.allow_synthetic:
        raise SystemExit('Nhãn chưa được người chuyên môn duyệt. Dùng --allow-synthetic chỉ cho thí nghiệm sơ bộ có ghi rõ giới hạn.')
    labels = np.array([[int(label in r['labels']) for label in LABELS] for r in rows])
    groups = np.array([r['group'] for r in rows])
    if len(set(groups)) < 6:
        raise SystemExit('Cần ít nhất 6 nhóm nguồn/chủ đề độc lập; không chia ngẫu nhiên các biến thể cùng câu.')
    trainval, test = next(GroupShuffleSplit(n_splits=1, test_size=.15, random_state=42).split(texts, groups=groups))
    train_relative, val_relative = next(GroupShuffleSplit(n_splits=1, test_size=.18, random_state=43).split(trainval, groups=groups[trainval]))
    train, val = trainval[train_relative], trainval[val_relative]
    if any(labels[train, i].min() == labels[train, i].max() for i in range(len(LABELS))):
        raise SystemExit('Tập train phải có cả ví dụ dương và âm cho từng nhãn.')
    vectorizer = TfidfVectorizer(ngram_range=(1, 2), strip_accents='unicode', sublinear_tf=True, max_features=20000)
    features = vectorizer.fit_transform([texts[i] for i in train])
    val_features = vectorizer.transform([texts[i] for i in val])
    candidates = []
    for c in (.5, 1, 3, 10):
        estimator = OneVsRestClassifier(LogisticRegression(C=c, class_weight='balanced', max_iter=1000, random_state=42))
        estimator.fit(features, labels[train])
        for threshold in (.3, .4, .5, .6):
            score = f1_score(labels[val], estimator.predict_proba(val_features) >= threshold, average='macro', zero_division=0)
            candidates.append((score, c, threshold, estimator))
    score, c, threshold, estimator = max(candidates, key=lambda item: item[0])
    predicted = estimator.predict_proba(vectorizer.transform([texts[i] for i in test])) >= threshold
    baseline = np.array([[int(label in classify(texts[i], [], use_model=False)['levels']) for label in LABELS] for i in test])
    def metrics(values):
        return {'macro_f1': f1_score(labels[test], values, average='macro', zero_division=0),
            'micro_f1': f1_score(labels[test], values, average='micro', zero_division=0),
            'hamming_loss': hamming_loss(labels[test], values),
            'per_label': classification_report(labels[test], values, target_names=LABELS, output_dict=True, zero_division=0)}
    digest = hashlib.sha256(raw).hexdigest()
    provenance = 'synthetic_pilot_pending_human_review' if synthetic else 'human_reviewed_dataset'
    model = {'schema_version': 1, 'model_id': 'question-tfidf-' + digest[:12], 'labels': LABELS,
        'training_provenance': provenance, 'dataset_sha256': digest, 'threshold': threshold,
        'vocabulary': {key: int(value) for key, value in vectorizer.vocabulary_.items()}, 'idf': vectorizer.idf_.tolist(),
        'coefficients': [model.coef_[0].tolist() for model in estimator.estimators_],
        'intercepts': [float(model.intercept_[0]) for model in estimator.estimators_]}
    report = {'dataset_sha256': digest, 'provenance': provenance, 'samples': len(rows),
        'split_method': 'group_holdout_42_then_43_no_group_overlap',
        'split_counts': {'train': len(train), 'validation': len(val), 'test': len(test)},
        'split_groups': {name: sorted(set(groups[indices])) for name, indices in [('train', train), ('validation', val), ('test', test)]},
        'selected_on_validation': {'C': c, 'threshold': threshold, 'macro_f1': score},
        'test': {'rules': metrics(baseline), 'trained_tfidf_logistic': metrics(predicted)},
        'runtime': {'python': platform.python_version(), 'sklearn': sklearn.__version__},
        'limitations': ['Một lần chia tập theo nhóm; chưa chứng minh độ ổn định trên nhiều khóa học.',
            'Số liệu sơ bộ từ câu hỏi tổng hợp, chưa đại diện học viên thật.' if synthetic else 'Chỉ áp dụng trong miền dữ liệu đã đánh giá.'],
        'errors': [{'id': rows[i].get('id', str(i)), 'text': texts[i], 'expected': rows[i]['labels'],
            'predicted': [label for label, hit in zip(LABELS, prediction) if hit]}
            for i, prediction in zip(test, predicted) if not np.array_equal(labels[i], prediction)]}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'question-classifier.json').write_text(json.dumps(model, ensure_ascii=False))
    (args.output / 'training-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    (args.output / 'split-manifest.json').write_text(json.dumps({name: [rows[i].get('id', str(i)) for i in indices]
        for name, indices in [('train', train), ('validation', val), ('test', test)]}, indent=2))
    print(json.dumps({key: report[key] for key in ('provenance', 'samples', 'split_counts', 'test')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
