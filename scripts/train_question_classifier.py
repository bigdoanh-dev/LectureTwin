#!/usr/bin/env python3
"""Tune on grouped out-of-fold development predictions; evaluate once on held-out groups."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))


def select_thresholds(truth, probabilities):
    """Per-label F1 tuning on development OOF only; conservative tie break, no test access."""
    import numpy as np
    from sklearn.metrics import f1_score
    selected = []
    for column in range(truth.shape[1]):
        target = truth[:, column]
        if np.count_nonzero(target) < 2 or np.count_nonzero(1 - target) < 2:
            selected.append(.5)  # Not enough support to tune this label.
            continue
        candidates = [round(value, 2) for value in np.arange(.35, .751, .05)]
        selected.append(float(max(candidates, key=lambda threshold: (
            f1_score(target, probabilities[:, column] >= threshold, zero_division=0),
            -abs(round(float(threshold), 2) - .5), float(threshold)))))
    return [round(value, 2) for value in selected]


def development_folds(indices, groups):
    from sklearn.model_selection import GroupKFold
    count = len(set(groups[indices]))
    if count < 3:
        raise ValueError('Cần ít nhất 3 nhóm development để tạo dự đoán ngoài fold.')
    return [(indices[train], indices[validation]) for train, validation in
            GroupKFold(n_splits=count).split(indices, groups=groups[indices])]


def validate_dataset(rows, allow_synthetic):
    from app.question_model import LABELS
    if len(rows) < 30:
        raise ValueError('Cần tối thiểu 30 câu hỏi và đủ nhóm độc lập để chia tập.')
    if any(not row.get('id') for row in rows) or len({row['id'] for row in rows}) != len(rows):
        raise ValueError('Mỗi câu cần ID duy nhất để kiểm tra split manifest.')
    texts = [row['text'].strip() for row in rows]
    if any(not text for text in texts):
        raise ValueError('Câu hỏi không được rỗng.')
    if len({' '.join(text.casefold().split()) for text in texts}) != len(texts):
        raise ValueError('Dữ liệu có câu hỏi trùng; loại trùng trước khi chia tập.')
    if any(not row.get('labels') or not set(row['labels']) <= set(LABELS) or not row.get('group') or not row.get('provenance') for row in rows):
        raise ValueError('Mỗi câu cần labels hợp lệ, group và provenance.')
    synthetic = any(row.get('annotation_status') != 'human_reviewed' for row in rows)
    if synthetic and not allow_synthetic:
        raise ValueError('Nhãn chưa được chuyên môn duyệt; --allow-synthetic chỉ dành cho thử nghiệm sơ bộ.')
    if len({row['group'] for row in rows}) < 6:
        raise ValueError('Cần ít nhất 6 nhóm nguồn độc lập; giữ biến thể cùng nguồn trong một nhóm.')
    return texts, synthetic


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
    parser.add_argument('--allow-synthetic', action='store_true')
    args = parser.parse_args()
    raw = args.dataset.read_bytes()
    rows = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
    try:
        texts, synthetic = validate_dataset(rows, args.allow_synthetic)
    except ValueError as error:
        raise SystemExit(str(error))
    labels = np.array([[int(label in row['labels']) for label in LABELS] for row in rows])
    groups = np.array([row['group'] for row in rows])
    # Freeze outer test before fitting vocabulary, coefficients, C, or thresholds.
    development, test = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=42).split(texts, groups=groups))
    folds = development_folds(development, groups)
    if any(labels[development, i].min() == labels[development, i].max() for i in range(len(LABELS))):
        raise SystemExit('Development cần cả ví dụ dương và âm cho từng nhãn; bổ sung dữ liệu trước khi train.')
    def vectorizer():
        return TfidfVectorizer(ngram_range=(1, 2), strip_accents='unicode', sublinear_tf=True, max_features=20000)
    def estimator(c):
        # Unweighted probabilities avoid combining class balancing with a second prior correction in thresholds.
        return OneVsRestClassifier(LogisticRegression(C=c, class_weight=None, max_iter=1000, random_state=42))
    candidates = []
    for c in (.5, 1, 3, 10):
        probabilities = np.full(labels.shape, np.nan)
        for train, validation in folds:
            vocabulary = vectorizer()
            model = estimator(c).fit(vocabulary.fit_transform([texts[i] for i in train]), labels[train])
            probabilities[validation] = model.predict_proba(vocabulary.transform([texts[i] for i in validation]))
        thresholds = select_thresholds(labels[development], probabilities[development])
        score = f1_score(labels[development], probabilities[development] >= thresholds, average='macro', zero_division=0)
        candidates.append((score, c, thresholds))
    score, c, thresholds = max(candidates, key=lambda item: (item[0], -item[1]))
    vocabulary = vectorizer()
    model = estimator(c).fit(vocabulary.fit_transform([texts[i] for i in development]), labels[development])
    predicted = model.predict_proba(vocabulary.transform([texts[i] for i in test])) >= thresholds
    baseline = np.array([[int(label in classify(texts[i], [], use_model=False)['levels']) for label in LABELS] for i in test])
    def metrics(values):
        return {'macro_f1': f1_score(labels[test], values, average='macro', zero_division=0),
            'micro_f1': f1_score(labels[test], values, average='micro', zero_division=0),
            'hamming_loss': hamming_loss(labels[test], values),
            'predicted_positive_counts': values.sum(axis=0).tolist(), 'expected_positive_counts': labels[test].sum(axis=0).tolist(),
            'per_label': classification_report(labels[test], values, target_names=LABELS, output_dict=True, zero_division=0)}
    digest = hashlib.sha256(raw).hexdigest()
    provenance = 'synthetic_pilot_pending_human_review' if synthetic else 'human_reviewed_dataset'
    artifact = {'schema_version': 2, 'model_id': 'question-tfidf-' + digest[:12], 'labels': LABELS,
        'training_provenance': provenance, 'dataset_sha256': digest, 'thresholds': thresholds,
        'vocabulary': {key: int(value) for key, value in vocabulary.vocabulary_.items()}, 'idf': vocabulary.idf_.tolist(),
        'coefficients': [entry.coef_[0].tolist() for entry in model.estimators_],
        'intercepts': [float(entry.intercept_[0]) for entry in model.estimators_]}
    report = {'dataset_sha256': digest, 'provenance': provenance, 'samples': len(rows),
        'split_method': 'frozen_group_holdout_seed42_then_leave_one_development_group_out',
        'split_counts': {'development': len(development), 'test': len(test)},
        'split_groups': {name: sorted(set(groups[indices])) for name, indices in [('development', development), ('test', test)]},
        'selected_on_development_oof': {'C': c, 'thresholds': dict(zip(LABELS, thresholds)), 'class_weight': None,
            'selection_macro_f1_not_unbiased_test': score, 'folds': len(folds)},
        'test': {'rules': metrics(baseline), 'trained_tfidf_logistic': metrics(predicted)},
        'runtime': {'python': platform.python_version(), 'sklearn': sklearn.__version__},
        'limitations': ['Development OOF dùng chọn siêu tham số; chỉ holdout ngoài mới là số đo test.',
            'Holdout ít nhóm; cần nhiều khóa học, lặp outer group split và nhãn chuyên gia để đánh giá ổn định.',
            'Holdout cùng seed có thể đã được báo cáo ở thí nghiệm trước; cần tập external chưa từng xem cho đánh giá xác nhận.',
            'Không có ngưỡng nào bảo đảm loại bỏ false positive; báo cáo Hamming loss và phân bố dự đoán thực tế.',
            'Nhãn tổng hợp có thể lệch và tương quan với mô hình sinh; chưa đại diện học viên thật.' if synthetic else 'Chỉ áp dụng trong miền dữ liệu đã đánh giá.'],
        'errors': [{'id': rows[i].get('id', str(i)), 'text': texts[i], 'expected': rows[i]['labels'],
            'predicted': [label for label, hit in zip(LABELS, prediction) if hit]}
            for i, prediction in zip(test, predicted) if not np.array_equal(labels[i], prediction)]}
    ids = lambda indices: [rows[i].get('id', str(i)) for i in indices]
    manifest = {'development': ids(development), 'test': ids(test),
        'development_folds': [{'train': ids(train), 'validation': ids(validation)} for train, validation in folds]}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / 'question-classifier.json').write_text(json.dumps(artifact, ensure_ascii=False))
    (args.output / 'training-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    (args.output / 'split-manifest.json').write_text(json.dumps(manifest, indent=2))
    print(json.dumps({key: report[key] for key in ('provenance', 'samples', 'split_counts', 'selected_on_development_oof', 'test')}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
