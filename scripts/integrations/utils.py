"""
Shared utilities for Areté integration scripts.

Provides common functionality for:
- Credential loading from environment or files
- Integration config loading
- Template rendering
- Deduplication checking
- String utilities (slugify, etc.)
"""

import os
import re
from pathlib import Path
from typing import Any, Optional

try:
    import yaml
except ImportError:
    yaml = None


def get_workspace_root() -> Path:
    """
    Find the Areté workspace root directory.

    Resolution order:
    1. ARETE_WORKSPACE_ROOT environment variable (set by CLI)
    2. Walk up from current working directory
    3. Walk up from script location (fallback)

    Returns:
        Path to workspace root
    """
    # 1. Check environment variable (set by the Node CLI)
    env_root = os.environ.get("ARETE_WORKSPACE_ROOT")
    if env_root:
        env_path = Path(env_root)
        if env_path.is_dir():
            return env_path

    # 2. Walk up from current working directory
    current = Path.cwd()
    for _ in range(10):
        if _is_arete_workspace(current):
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent

    # 3. Walk up from script location (fallback for direct invocation)
    current = Path(__file__).parent
    for _ in range(10):
        if _is_arete_workspace(current):
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent

    # Last resort: assume scripts/integrations/ is in workspace
    return Path(__file__).parent.parent.parent


def _is_arete_workspace(directory: Path) -> bool:
    """Check if a directory looks like an Areté workspace."""
    # Must have context/ and memory/ (characteristic of a workspace, not the CLI repo)
    if (directory / "context").is_dir() and (directory / "memory").is_dir():
        return True
    # Or an explicit arete.yaml manifest
    if (directory / "arete.yaml").is_file():
        return True
    return False


def load_credentials(integration_name: str) -> Optional[dict]:
    """
    Load credentials for an integration.

    Checks in order:
    1. Environment variables (e.g., FATHOM_API_KEY)
    2. .credentials/credentials.yaml in workspace
    3. ~/.arete/credentials.yaml

    Args:
        integration_name: Name of the integration (e.g., 'fathom')

    Returns:
        Dict of credentials or None if not found
    """
    # Check environment variables
    env_prefix = integration_name.upper()
    env_creds = {}
    for key in ["API_KEY", "TOKEN", "SECRET", "CLIENT_ID", "CLIENT_SECRET"]:
        env_key = f"{env_prefix}_{key}"
        if os.environ.get(env_key):
            env_creds[key.lower()] = os.environ[env_key]
    if env_creds:
        return env_creds

    # Check workspace credentials file
    workspace = get_workspace_root()
    creds_paths = [
        workspace / ".credentials" / "credentials.yaml",
        workspace / ".credentials" / "credentials.yml",
        Path.home() / ".arete" / "credentials.yaml",
        Path.home() / ".arete" / "credentials.yml",
    ]

    for creds_path in creds_paths:
        if creds_path.is_file():
            creds = _load_yaml(creds_path)
            if creds and integration_name in creds:
                return creds[integration_name]

    return None


def load_integration_config(integration_name: str) -> dict:
    """
    Load integration configuration from .cursor/integrations/configs/.

    Args:
        integration_name: Name of the integration (e.g., 'fathom')

    Returns:
        Dict of configuration, or empty dict if not found
    """
    workspace = get_workspace_root()
    config_paths = [
        workspace / ".cursor" / "integrations" / "configs" / f"{integration_name}.yaml",
        workspace / ".cursor" / "integrations" / "configs" / f"{integration_name}.yml",
    ]

    for config_path in config_paths:
        if config_path.is_file():
            return _load_yaml(config_path) or {}

    return {}


def _load_yaml(path: Path) -> Optional[dict]:
    """Load a YAML file, returning None on error."""
    if yaml is None:
        # Fallback: simple YAML parsing for basic configs
        return _simple_yaml_parse(path)

    try:
        with open(path, "r") as f:
            return yaml.safe_load(f)
    except Exception:
        return None


def _simple_yaml_parse(path: Path) -> Optional[dict]:
    """
    Simple YAML parser for basic key-value configs.
    Used when PyYAML is not installed.
    """
    try:
        result = {}
        current_section = result
        section_stack = [result]
        indent_stack = [-1]

        with open(path, "r") as f:
            for line in f:
                # Skip comments and empty lines
                stripped = line.strip()
                if not stripped or stripped.startswith("#"):
                    continue

                # Calculate indentation
                indent = len(line) - len(line.lstrip())

                # Handle indentation changes
                while indent <= indent_stack[-1] and len(section_stack) > 1:
                    section_stack.pop()
                    indent_stack.pop()
                    current_section = section_stack[-1]

                # Parse key: value
                if ":" in stripped:
                    key, _, value = stripped.partition(":")
                    key = key.strip()
                    value = value.strip()

                    # Remove quotes
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    elif value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]

                    if value:
                        # Simple value
                        current_section[key] = value
                    else:
                        # Nested section
                        current_section[key] = {}
                        section_stack.append(current_section[key])
                        indent_stack.append(indent)
                        current_section = current_section[key]

        return result
    except Exception:
        return None


def render_template(template_path: Path, variables: dict) -> str:
    """
    Render a template file with variable substitution.

    Replaces {variable_name} placeholders with values from variables dict.

    Args:
        template_path: Path to template file
        variables: Dict of variable names to values

    Returns:
        Rendered template string
    """
    if not template_path.is_file():
        raise FileNotFoundError(f"Template not found: {template_path}")

    template = template_path.read_text()

    # Replace {variable} placeholders
    for key, value in variables.items():
        placeholder = "{" + key + "}"
        template = template.replace(placeholder, str(value) if value else "")

    return template


def slugify(text: str, max_length: int = 50) -> str:
    """
    Convert text to a URL/filename-safe slug.

    Args:
        text: Input text
        max_length: Maximum length of slug

    Returns:
        Slugified string (lowercase, hyphens, no special chars)
    """
    if not text:
        return "untitled"

    # Convert to lowercase
    slug = text.lower()

    # Replace spaces and underscores with hyphens
    slug = re.sub(r"[\s_]+", "-", slug)

    # Remove non-alphanumeric characters (except hyphens)
    slug = re.sub(r"[^a-z0-9\-]", "", slug)

    # Collapse multiple hyphens
    slug = re.sub(r"-+", "-", slug)

    # Remove leading/trailing hyphens
    slug = slug.strip("-")

    # Truncate to max length (at word boundary if possible)
    if len(slug) > max_length:
        truncated = slug[:max_length]
        # Try to break at a hyphen
        if "-" in truncated:
            truncated = truncated.rsplit("-", 1)[0]
        slug = truncated.rstrip("-")

    return slug or "untitled"


def check_duplicate(
    directory: Path,
    meeting_id: Optional[str] = None,
    filename: Optional[str] = None,
) -> bool:
    """
    Check if a meeting already exists in the directory.

    Checks by:
    1. Exact filename match
    2. Meeting ID in file metadata (if meeting_id provided)

    Args:
        directory: Directory to check
        meeting_id: Optional meeting ID to search for in metadata
        filename: Optional filename to check for

    Returns:
        True if duplicate exists, False otherwise
    """
    if not directory.is_dir():
        return False

    # Check exact filename
    if filename:
        if (directory / filename).is_file():
            return True

    # Check meeting ID in existing files
    if meeting_id:
        for file_path in directory.glob("*.md"):
            try:
                content = file_path.read_text()
                # Look for meeting ID in metadata section
                if f"**Meeting ID**: {meeting_id}" in content:
                    return True
            except Exception:
                continue

    return False


def format_duration(minutes: int) -> str:
    """Format duration in minutes to human-readable string."""
    if minutes < 60:
        return f"{minutes} minutes"
    hours = minutes // 60
    remaining = minutes % 60
    if remaining == 0:
        return f"{hours} hour{'s' if hours > 1 else ''}"
    return f"{hours}h {remaining}m"


def parse_date(date_str: str) -> Optional[str]:
    """
    Parse various date formats to YYYY-MM-DD.

    Args:
        date_str: Date string in various formats

    Returns:
        Date string in YYYY-MM-DD format, or None if unparseable
    """
    if not date_str:
        return None

    # Already in correct format
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str

    # ISO format with time
    if "T" in date_str:
        return date_str.split("T")[0]

    # Try common formats
    from datetime import datetime

    formats = [
        "%Y-%m-%d",
        "%Y/%m/%d",
        "%m/%d/%Y",
        "%m-%d-%Y",
        "%B %d, %Y",
        "%b %d, %Y",
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            return dt.strftime("%Y-%m-%d")
        except ValueError:
            continue

    return None
