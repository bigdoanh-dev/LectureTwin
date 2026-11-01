"""Safe JSON model loading for an explicitly trained question classifier."""
from functools import lru_cache
import json
import math
import os
from pathlib import Path

LABELS = ['recall', 'explain', 'apply']


def configured_path():
    from . import store
    return Path(os.environ.get('LECTURE_CLASSIFIER_PATH', str(store.DATA / 'models' / 'question-classifier.json')))


@lru_cache(maxsize=4)
def load_model(path, modified):
    model = json.loads(Path(path).read_text())
    if model.get('schema_version') != 1 or model.get('labels') != LABELS:
        raise ValueError('Phiên bản mô hình phân loại không được hỗ trợ')
    return model


def predict(text):
    path = configured_path()
    if not path.is_file():
        return None
    model = load_model(str(path), path.stat().st_mtime_ns)
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    vectorizer = TfidfVectorizer(vocabulary=model['vocabulary'], ngram_range=(1, 2),
        strip_accents='unicode', sublinear_tf=True)
    vectorizer.idf_ = np.array(model['idf'])
    vector = vectorizer.transform([text])
    logits = np.asarray(vector @ np.array(model['coefficients']).T).ravel() + np.array(model['intercepts'])
    scores = [1 / (1 + math.exp(-max(-700, min(700, float(value))))) for value in logits]
    return {'levels': [label for label, score in zip(LABELS, scores) if score >= model['threshold']],
        'method': 'trained_tfidf_logistic_multilabel', 'model_id': model['model_id'],
        'training_provenance': model['training_provenance'],
        'limitation': 'Phân loại yêu cầu trong câu hỏi; không đánh giá năng lực người học. Điểm quyết định chưa được hiệu chuẩn thành độ tin cậy.'}
