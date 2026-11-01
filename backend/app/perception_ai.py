"""Real local speech recognition and OCR, preserving source provenance."""
import os
import re
from difflib import SequenceMatcher
from pathlib import Path

from . import ai_runtime, store


def repeated_ocr_text(previous, current):
    """Conservative adjacent OCR dedup; retain changed numbers/code results."""
    normalized = lambda text: ' '.join(text.casefold().split())
    left, right = normalized(previous), normalized(current)
    if not left or not right:
        return False
    if left == right:
        return True
    # Even a one-character code/operator change may alter the lesson result.
    if re.search(r'[=<>+*/{}\[\]()]', left + right):
        return False
    left_words, right_words = re.findall(r'\w+', left), re.findall(r'\w+', right)
    negations = {'không', 'chưa', 'not', 'never', 'no'}
    if [w for w in left_words if w in negations] != [w for w in right_words if w in negations]:
        return False
    a, b = set(left_words), set(right_words)
    # Short text or changed numbers often represents a meaningful code result.
    if min(len(a), len(b)) < 20 or re.findall(r'\d+', left) != re.findall(r'\d+', right):
        return False
    return SequenceMatcher(None, left_words, right_words).ratio() >= .98 and len(a & b) / max(1, len(a | b)) >= .98 and min(len(left), len(right)) / max(len(left), len(right)) >= .98


def read_sources(lecture, report, tool=None):
    if lecture.get('sample_attached') or not ai_runtime.enabled():
        return report
    failures = []
    invoke = tool or (lambda name, data, function: function())
    video = next((a for a in lecture.get('assets', []) if a['kind'] == 'video'), None)
    if report.get('has_audio') and not any(row.get('source_type') == 'manual_uploaded_transcript' for row in lecture.get('transcript', [])):
        audio = store.DATA / 'audio' / lecture['id'] / f"v{lecture['version']}.wav"
        if audio.exists():
            try:
                segments = invoke('transcribe_audio', {'asset_id': video['id'], 'duration_seconds': report['duration_seconds']},
                    lambda: ai_runtime.transcribe(audio, report['duration_seconds']))
                for row in segments:
                    row['asset_id'] = video['id']
                lecture['transcript'] = segments
                report['asr'] = 'completed' if segments else 'no_speech_detected'
                report['asr_model'] = os.environ.get('LECTURE_ASR_MODEL', 'mlx-community/whisper-small-mlx')
            except ai_runtime.ProviderUnavailable as error:
                report['asr'] = 'unavailable'
                failures.append(str(error))
    elif lecture.get('transcript'):
        report['asr'] = 'provided_transcript'

    # PDF pages with no text layer are rendered and OCRed; never invent page timestamps.
    for asset in lecture.get('assets', []):
        if asset['kind'] != 'slides' or Path(asset.get('path', '')).suffix.lower() != '.pdf':
            continue
        blank = [page for page in lecture.get('slides', []) if not page.get('text', '').strip()]
        if not blank:
            continue
        try:
            import pypdfium2 as pdfium
            path = store.DATA / 'media' / Path(asset['path']).name
            store.restore_media(path)
            document = pdfium.PdfDocument(path)
            try:
                for page in blank:
                    ai_runtime.checkpoint()
                    index = page['page'] - 1
                    pdf_page = document[index]
                    try:
                        bitmap = pdf_page.render(scale=1.5)
                        image = bitmap.to_pil()
                        folder = store.DATA / 'ocr' / lecture['id']
                        folder.mkdir(parents=True, exist_ok=True)
                        rendered = folder / f"v{lecture['version']}-page-{index}.png"
                        image.save(rendered)
                        text = invoke('ocr_document', {'asset_id': asset['id'], 'page': page['page']}, lambda: ai_runtime.read_image(rendered))
                        page.update(text=text, source_type='local_ocr', asset_id=asset['id'])
                    finally:
                        pdf_page.close()
            finally:
                document.close()
            report['document_ocr'] = 'completed'
        except (ImportError, ai_runtime.ProviderUnavailable, RuntimeError) as error:
            report['document_ocr'] = 'unavailable'
            failures.append(str(error))

    # Sampled frames give visual text, not a claim of full visual/diagram understanding.
    ocr_pages = []
    previous_text = ''
    duplicate_frames = 0
    for index, frame in enumerate(report.get('keyframes', [])):
        try:
            path = store.DATA / 'frames' / lecture['id'] / frame['file']
            text = invoke('ocr_frame', {'timestamp': frame['timestamp']}, lambda: ai_runtime.read_image(path))
            if text.strip():
                duplicate = repeated_ocr_text(previous_text, text)
                previous_text = text
                if duplicate:
                    duplicate_frames += 1
                    continue
                ocr_pages.append({'page': index + 1, 'title': f"Chữ trong khung hình {frame['timestamp']} giây",
                    'text': text, 'start': None, 'end': None, 'frame_timestamp': frame['timestamp'],
                    'asset_id': video['id'] if video else None, 'source_type': 'sampled_frame_ocr'})
        except (ai_runtime.ProviderUnavailable, RuntimeError) as error:
            failures.append(str(error))
            break
    lecture['slides'] = [p for p in lecture.get('slides', []) if p.get('source_type') != 'sampled_frame_ocr'] + ocr_pages
    if report.get('frame_sampling', {}).get('limit_reached'):
        failures.append('Đã đạt giới hạn khung hình chuyển cảnh; các cảnh sau giới hạn có thể chưa được đọc.')
    report.update(vision='sampled_frame_ocr' if ocr_pages else 'not_run',
        visual_scope='OCR khung đầu, cảnh thay đổi và mốc dự phòng; lọc văn bản OCR gần trùng liền kề, chưa suy luận sơ đồ hoặc chứng nhận bao phủ toàn video.',
        transcript_segments=len(lecture.get('transcript', [])),
        slide_pages=sum(p.get('source_type') != 'sampled_frame_ocr' for p in lecture.get('slides', [])),
        sampled_frames=len(report.get('keyframes', [])), sampled_ocr_frames=len(ocr_pages), duplicate_ocr_frames=duplicate_frames,
        processing_limitations=failures,
        semantic_source='uploaded_sources_local_ai')
    ai_runtime.checkpoint()
    return report
