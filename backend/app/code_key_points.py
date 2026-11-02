"""Conservative observations of visible Python syntax; never execute OCR code."""
import ast
import hashlib
import io
import re
import tokenize
import unicodedata


METHOD = 'deterministic_python_code_observation'
PUNCTUATION = str.maketrans({'（': '(', '）': ')', '，': ','})


def _normalize_punctuation(text):
    protected = set()
    try:
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.STRING:
                protected.update(range(token.start[1], token.end[1]))
    except (tokenize.TokenError, IndentationError):
        pass
    return ''.join(char if index in protected else char.translate(PUNCTUATION)
        for index, char in enumerate(text))


def _parse(line):
    text = _normalize_punctuation(line.strip())
    if not text or len(text) > 350 or re.match(r'^\d+[\s:.]', text):
        return None
    try:
        # Python normalizes some identifier spellings internally. Reject those
        # rather than silently renaming identifiers visible in the source.
        for token in tokenize.generate_tokens(io.StringIO(text).readline):
            if token.type == tokenize.NAME and unicodedata.normalize('NFKC', token.string) != token.string:
                return None
    except (tokenize.TokenError, IndentationError):
        # A header ending in ':' is intentionally incomplete until its body.
        return None
    scaffold = bool(re.match(r'^(?:class|(?:async\s+)?def)\s+', text) and text.endswith(':'))
    try:
        tree = ast.parse(text + '\n    pass' if scaffold else text)
    except (SyntaxError, ValueError, TypeError):
        return None
    if len(tree.body) != 1:
        return None
    return text, tree.body[0]


def _callee(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        base = _callee(node.value)
        return base + '.' + node.attr if base else None
    return None


def _scalar(node):
    if isinstance(node, ast.Constant):
        return type(node.value) in (str, int, float, bool, type(None))
    return (isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.UAdd, ast.USub))
        and isinstance(node.operand, ast.Constant) and type(node.operand.value) in (int, float))


def _observation(text, node):
    if isinstance(node, ast.ClassDef) and text.endswith(':'):
        return ('class', node.name), f'Khai báo lớp `{node.name}` trong mã Python', f'Đoạn mã hiển thị khai báo lớp có tên `{node.name}`.'
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and text.endswith(':'):
        # Documentation popups often show variadic/annotated built-in signatures.
        # Only simple visible definition headers are observed by this fallback.
        if (node.args.vararg or node.args.kwarg or node.args.kwonlyargs or node.args.posonlyargs
                or node.args.defaults or node.returns or any(arg.annotation for arg in node.args.args)):
            return None
        params = [arg.arg for arg in node.args.posonlyargs + node.args.args + node.args.kwonlyargs]
        if node.args.vararg: params.append('*' + node.args.vararg.arg)
        if node.args.kwarg: params.append('**' + node.args.kwarg.arg)
        signature = node.name + '(' + ', '.join(params) + ')'
        return ('definition', ast.dump(node, include_attributes=False)), f'Khai báo `{node.name}` trong đoạn mã', f'Đoạn mã hiển thị định nghĩa `{signature}`.'
    if (isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
            and isinstance(node.value, ast.Call) and _callee(node.value.func)
            and all(_scalar(arg) for arg in node.value.args)
            and all(keyword.arg is not None and _scalar(keyword.value) for keyword in node.value.keywords)):
        call = ast.get_source_segment(text, node.value)
        if not call:
            return None
        return {'type': 'assignment', 'target': node.targets[0].id, 'call': call,
            'callee': _callee(node.value.func), 'call_ast': ast.dump(node.value, include_attributes=False)}
    if (isinstance(node, ast.Return) and isinstance(node.value, ast.Tuple) and len(node.value.elts) == 2
            and all(isinstance(item, ast.Name) for item in node.value.elts)):
        names = [item.id for item in node.value.elts]
        return ('return', tuple(names)), f'Trả về các giá trị mang tên `{names[0]}` và `{names[1]}`', f'Lệnh `return` sử dụng hai tên `{names[0]}` và `{names[1]}` đúng như trong nguồn.'
    if (isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name)
            and node.value.func.id == 'print' and len(node.value.args) == 1 and not node.value.keywords):
        call = node.value.args[0]
        if (isinstance(call, ast.Call) and isinstance(call.func, ast.Attribute) and isinstance(call.func.value, ast.Name)
                and not call.args and not call.keywords):
            visible = ast.get_source_segment(text, call)
            owner, method = call.func.value.id, call.func.attr
            return ('print_method', owner, method), f'Gọi `{method}()` qua `{owner}` trong lệnh `print`', f'Lệnh `print` nhận kết quả lời gọi `{visible}` trong đoạn mã.'
    return None


def _candidates(row):
    lines = row['text'].splitlines(keepends=True)
    # An explicit documentation popup can contain perfectly valid tutorial code.
    # It is editor chrome rather than corroborated lesson code: stop at its marker,
    # preserving declarations/assignments visibly preceding the popup.
    for index, line in enumerate(lines):
        if re.match(r'^(?:class\s+definitions\b|quick\s+documentation\b|parameters\s*:|signature\s*:|'
                    r'a\s+class\s+definition\s+defines\b|inheritance\s*::)', line.strip(), re.I):
            lines = lines[:index]
            break
    candidates, index, assigned_names = [], 0, set()
    while index < len(lines):
        original = lines[index].rstrip('\r\n')
        parsed = _parse(original)
        observation = _observation(*parsed) if parsed else None
        if not observation:
            index += 1
            continue
        if not isinstance(observation, dict):
            key, title, explanation = observation
            if key[0] in ('class', 'definition'):
                assigned_names.clear()
            if key[0] == 'return' and not set(key[1]) <= assigned_names:
                index += 1
                continue
            candidates.append((key, title, explanation, original))
            index += 1
            continue
        # Adjacent assignments with the same visible call form one observation.
        # Cite the original contiguous span, retaining all OCR punctuation.
        start, assignments = index, [observation]
        index += 1
        while index < len(lines) and len(assignments) < 4:
            lookahead = index
            while lookahead < len(lines) and (not lines[lookahead].strip() or lines[lookahead].strip().isdigit()):
                lookahead += 1
            if lookahead == len(lines):
                break
            next_parsed = _parse(lines[lookahead].rstrip('\r\n'))
            following = _observation(*next_parsed) if next_parsed else None
            if not isinstance(following, dict) or following['call_ast'] != observation['call_ast']:
                break
            assignments.append(following)
            index = lookahead + 1
        targets = list(dict.fromkeys(item['target'] for item in assignments))
        assigned_names.update(targets)
        names = ', '.join('`' + name + '`' for name in targets)
        title = f'Gán kết quả gọi `{observation["callee"]}` cho {names}'
        statements = '; '.join(f'`{item["target"]} = {item["call"]}`' for item in assignments)
        explanation = f'Đoạn mã có {len(assignments)} lệnh gán: {statements}.'
        quote = ''.join(lines[start:index]).rstrip('\r\n')
        candidates.append((('assignments', observation['call_ast'], tuple(targets)), title, explanation, quote))
    return candidates


def generate(rows, version):
    points, existing = [], {}
    collected = []
    for row in rows:
        if (row.get('source_type') not in ('sampled_frame_ocr', 'local_ocr')
                or not row.get('id') or not isinstance(row.get('text'), str)
                or row.get('version', version) != version):
            continue
        collected.extend((row, *candidate) for candidate in _candidates(row))
    assignment_groups = [(structure[1], set(structure[2])) for _, structure, *_ in collected if structure[0] == 'assignments']
    for row, structure, title, explanation, quote in collected:
        if structure[0] == 'assignments' and any(structure[1] == call and set(structure[2]) < targets
                for call, targets in assignment_groups):
            continue
        if len(title) > 180 or len(explanation) > 350 or not quote or quote not in row['text']:
            continue
        identity = repr((version, structure))
        identifier = 'code-point-' + hashlib.sha256(identity.encode()).hexdigest()[:16]
        point = existing.get(identifier)
        if point is None:
            if len(points) >= 6:
                continue
            point = {'id': identifier, 'title': title, 'explanation': explanation, 'method': METHOD, 'evidence': []}
            points.append(point)
            existing[identifier] = point
        if len(point['evidence']) >= 2 or any(e['source_segment_id'] == row['id'] and e['text'] == quote for e in point['evidence']):
            continue
        point['evidence'].append({'id': 'code-ev-' + hashlib.sha256((identifier + row['id'] + quote).encode()).hexdigest()[:16],
            'concept_id': identifier, 'key_point_id': identifier, 'kind': row.get('kind', 'slide'),
            'asset_id': row.get('asset_id'), 'source_segment_id': row['id'], 'source_version': version,
            'start': row.get('start'), 'end': row.get('end'), 'slide_page': row.get('page'),
            'section_index': row.get('section_index'), 'text': quote,
            'source_type': row['source_type'], 'valid': True, 'verified': False,
            'validation': 'code_structure_observation', 'semantic_review': 'pending_teacher'})
    return points
