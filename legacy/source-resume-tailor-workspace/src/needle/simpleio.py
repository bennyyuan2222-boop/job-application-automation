import json
from pathlib import Path
from typing import Any, Dict, List


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(read_text(path))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")


def read_simple_yaml(path: Path) -> Dict[str, Any]:
    """Minimal YAML reader for the small config/data files used in this MVP.

    Supports:
    - nested dictionaries via indentation
    - lists with '- item'
    - scalar strings / booleans / null

    Does not support full YAML syntax.
    """
    lines = path.read_text(encoding="utf-8").splitlines()

    def parse_scalar(value: str):
        value = value.strip()
        if value in {"null", "Null", "NULL", "~"}:
            return None
        if value == "true":
            return True
        if value == "false":
            return False
        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            return value[1:-1]
        return value

    root: Dict[str, Any] = {}
    stack: List[tuple[int, Any]] = [(-1, root)]

    i = 0
    while i < len(lines):
        raw = lines[i]
        i += 1
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue

        indent = len(raw) - len(raw.lstrip(" "))
        text = raw.strip()

        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]

        if text.startswith("- "):
            if not isinstance(parent, list):
                raise ValueError(f"Unexpected list item in {path}: {raw}")
            parent.append(parse_scalar(text[2:]))
            continue

        if ":" not in text:
            raise ValueError(f"Unsupported YAML line in {path}: {raw}")

        key, remainder = text.split(":", 1)
        key = key.strip()
        remainder = remainder.strip()

        if remainder:
            if not isinstance(parent, dict):
                raise ValueError(f"Expected dict parent for line in {path}: {raw}")
            parent[key] = parse_scalar(remainder)
            continue

        # determine whether child block is dict or list by peeking ahead
        child = None
        for j in range(i, len(lines)):
            nxt = lines[j]
            if not nxt.strip() or nxt.lstrip().startswith("#"):
                continue
            nxt_indent = len(nxt) - len(nxt.lstrip(" "))
            nxt_text = nxt.strip()
            if nxt_indent <= indent:
                child = {}
            elif nxt_text.startswith("- "):
                child = []
            else:
                child = {}
            break
        if child is None:
            child = {}

        if not isinstance(parent, dict):
            raise ValueError(f"Expected dict parent for block in {path}: {raw}")
        parent[key] = child
        stack.append((indent, child))

    return root
