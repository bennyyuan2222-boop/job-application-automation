from typing import Any, Dict, List

from .config import ACHIEVEMENTS_PATH, PROJECTS_PATH, ROLES_PATH, MASTER_PROFILE_PATH
from .simpleio import read_json, read_simple_yaml


def load_master_profile() -> Dict[str, Any]:
    return read_simple_yaml(MASTER_PROFILE_PATH)


def load_roles() -> List[Dict[str, Any]]:
    json_path = ROLES_PATH.with_suffix('.json')
    if json_path.exists():
        return read_json(json_path).get('roles', [])
    return read_simple_yaml(ROLES_PATH).get('roles', [])


def load_projects() -> List[Dict[str, Any]]:
    json_path = PROJECTS_PATH.with_suffix('.json')
    if json_path.exists():
        return read_json(json_path).get('projects', [])
    return read_simple_yaml(PROJECTS_PATH).get('projects', [])


def load_achievements() -> List[Dict[str, Any]]:
    json_path = ACHIEVEMENTS_PATH.with_suffix('.json')
    if json_path.exists():
        return read_json(json_path).get('achievements', [])
    return read_simple_yaml(ACHIEVEMENTS_PATH).get('achievements', [])
