from app import code_key_points


def row(text, sid='frame1', **extra):
    return {'id': sid, 'text': text, 'kind': 'slide', 'asset_id': 'video',
        'source_type': 'sampled_frame_ocr', 'start': 15, 'end': None, **extra}


def test_fullwidth_punctuation_is_parsed_but_exact_evidence_and_identifiers_are_preserved():
    text = 'class Exemple:\n    def lire(self):\n        valeur1 = module.faire（0，9)\n        valeur2 = module.faire（0，9)\n        return valeur1, valeur2\nprint(objet.lire（))'
    points = code_key_points.generate([row(text)], 3)
    assert len(points) == 5
    assignment = next(p for p in points if 'Gán kết quả' in p['title'])
    assert 'valeur1' in assignment['explanation'] and 'valeur2' in assignment['explanation']
    assert 'module.faire(0,9)' in assignment['explanation']
    assert assignment['evidence'][0]['text'] == '        valeur1 = module.faire（0，9)\n        valeur2 = module.faire（0，9)'
    for point in points:
        assert point['method'] == 'deterministic_python_code_observation'
        assert point['explanation'].endswith('.')
        assert point['evidence'] and all(e['text'] in text for e in point['evidence'])
        for evidence in point['evidence']:
            assert evidence['source_version'] == 3 and evidence['asset_id'] == 'video'
            assert evidence['validation'] == 'code_structure_observation'
            assert evidence['valid'] and not evidence['verified'] and evidence['semantic_review'] == 'pending_teacher'
    assert all(word not in str(points).lower() for word in ['ngẫu nhiên', 'tuple', 'kiểu dữ liệu'])


def test_popup_prose_line_numbers_incomplete_and_operator_repairs_are_rejected():
    text = ('Quick documentation\nrandint(a, b) -> int\nParameters: self, a, b\n'
        '1 class Wrong:\n2 x = f(1, 2)\nclass Incomplete\n'
        'def __init__(self, /, *args, **kwargs):\n'
        'x => f(0, 9)\nx == f(0, 9)\nx = f(0 ? 9)\nreturn x,\n'
        'print(obj.method(\nprint(Factory().method())\nprint(obj.method(5))')
    assert code_key_points.generate([row(text)], 1) == []


def test_identifiers_and_numbers_are_never_guessed_or_normalized():
    text = 'Ｒandom = module.faire(0, 9)\nx = module.faire(O, 9)\ny = module.faire(0, I)\nz = module.faire(0, 9O)'
    assert code_key_points.generate([row(text)], 1) == []


def test_repeated_frames_deduplicate_structural_observations_and_bound_evidence():
    text = 'class Compteur:\n    def obtenir(self):\n        x = outil.calculer(1, 2)\n        y = outil.calculer(1, 2)\n        return x, y\nprint(instance.obtenir())'
    rows = [row(text, 'frame' + str(i), start=i * 15) for i in range(4)]
    points = code_key_points.generate(rows, 1)
    assert len(points) == 5
    assert all(len(p['evidence']) == 2 for p in points)
    assert len({p['id'] for p in points}) == 5
    assert {e['source_segment_id'] for p in points for e in p['evidence']} == {'frame0', 'frame1'}
    assert {p['id'] for p in points}.isdisjoint({p['id'] for p in code_key_points.generate(rows, 2)})


def test_string_literals_are_preserved_while_only_syntax_punctuation_is_repaired():
    text = 'mot = texte.formater（"a（b，c）"， 4)'
    points = code_key_points.generate([row(text)], 1)
    assert len(points) == 1
    assert 'texte.formater("a（b，c）", 4)' in points[0]['explanation']
    assert points[0]['evidence'][0]['text'] == text


def test_non_ocr_sources_are_not_silently_interpreted_as_visible_code_and_limit_is_six():
    text = '\n'.join(f'class Classe{i}:' for i in range(10))
    assert code_key_points.generate([row(text, source_type='local_asr')], 1) == []
    assert code_key_points.generate([row(text, version=2)], 1) == []
    assert len(code_key_points.generate([row(text)], 1)) == 6


def test_keyword_and_non_scalar_call_arguments_do_not_become_inferred_facts():
    text = 'x = f(other.value)\ny = f(g())\nz = f(*args)\nu = f(**kwargs)\nreturn x, 3\n'
    assert code_key_points.generate([row(text)], 1) == []


def test_numeric_ocr_line_markers_group_assignments_and_later_complete_frame_suppresses_subsets():
    early = 'class Exemple:\n3\ndef obtenir(self):\n4\nso1=random.randint（0,9)'
    intermediate = 'so2=random.randint（0,9)'
    full = ('class Exemple:\n3\ndef obtenir(self):\n4\nso1=random.randint（0,9)\n5\n\n'
        'so2=random.randint（0,9)\n6\nreturn so1，so2\n7\n'
        'nn=Exemple()\n8\nprint(nn.obtenir())')
    points = code_key_points.generate([row(early), row(intermediate, 'frame2'), row(full, 'frame3')], 1)
    assert len(points) == 6
    assignments = [point for point in points if 'random.randint' in point['title']]
    assert len(assignments) == 1
    assert 'so1' in assignments[0]['title'] and 'so2' in assignments[0]['title']
    assert assignments[0]['evidence'][0]['text'] == 'so1=random.randint（0,9)\n5\n\nso2=random.randint（0,9)'
    assert assignments[0]['evidence'][0]['source_segment_id'] == 'frame3'
    assert any('lệnh `print`' in point['title'] for point in points)
    assert any('return' in point['explanation'] for point in points)


def test_documentation_popup_code_is_not_a_lesson_point_but_preceding_code_survives():
    text = ('class Exemple:\n3\ndef obtenir(self):\n4\nx=outil.calculer(0,9)\n'
        'Class definitions\nA class definition defines a class object\nclass Tutoriel:\npass\n')
    points = code_key_points.generate([row(text)], 1)
    assert len(points) == 3
    assert 'Tutoriel' not in str(points)
    assert any('Exemple' in point['title'] for point in points)
    for marker in ('Quick documentation', 'Parameters:', 'A class definition defines a class object'):
        assert code_key_points.generate([row(marker + '\nclass Tutoriel:\npass')], 1) == []


def test_returned_names_require_same_frame_assignments_without_guessing_letter_o_or_l():
    code = 'so1=outil.calculer(0,9)\n5\nso2=outil.calculer(0,9)\n6\n'
    valid = code_key_points.generate([row(code + 'return so1，so2')], 1)
    assert any('return' in point['explanation'] for point in valid)
    invalid = code_key_points.generate([row(code + 'return sol,so2')], 1)
    assert not any('return' in point['explanation'] for point in invalid)
    assert not code_key_points.generate([row('return so1,so2')], 1)
    cross_frame = code_key_points.generate([row(code), row('return so1,so2', 'later')], 1)
    assert not any('return' in point['explanation'] for point in cross_frame)
    # A new visible method begins a new assignment scope.
    different_method = code_key_points.generate([row(code + 'def autre(self):\nreturn so1,so2')], 1)
    assert not any('return' in point['explanation'] for point in different_method)
