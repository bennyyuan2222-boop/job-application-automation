from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = WORKSPACE_ROOT / "data"
PROFILE_DIR = DATA_DIR / "profile"
EXPERIENCE_DIR = DATA_DIR / "experience"
JOBS_DIR = DATA_DIR / "jobs"
INDEX_DIR = DATA_DIR / "index"
INTEGRATIONS_DIR = DATA_DIR / "integrations"
BASE_RESUMES_DIR = WORKSPACE_ROOT / "resumes" / "base"

LEAD_REGISTRY_CONFIG = INTEGRATIONS_DIR / "lead_registry.yaml"
MASTER_PROFILE_PATH = PROFILE_DIR / "master_profile.yaml"
ROLES_PATH = EXPERIENCE_DIR / "roles.yaml"
PROJECTS_PATH = EXPERIENCE_DIR / "projects.yaml"
ACHIEVEMENTS_PATH = EXPERIENCE_DIR / "achievements.yaml"
METADATA_DB_PATH = INDEX_DIR / "metadata.db"
