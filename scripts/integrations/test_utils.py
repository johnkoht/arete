"""
Tests for scripts/integrations/utils.py

Run with: python -m pytest scripts/integrations/test_utils.py -v
    or:   python -m unittest scripts.integrations.test_utils -v
"""

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

# Adjust path for imports
import sys
sys.path.insert(0, str(Path(__file__).parent))

from utils import (
    slugify,
    parse_date,
    format_duration,
    check_duplicate,
    render_template,
    load_credentials,
    load_integration_config,
    get_workspace_root,
    _is_arete_workspace,
    _simple_yaml_parse,
)


class TestSlugify(unittest.TestCase):
    """Tests for slugify()."""

    def test_basic_text(self):
        self.assertEqual(slugify("Hello World"), "hello-world")

    def test_special_characters(self):
        self.assertEqual(slugify("Product Review: Q4 2025!"), "product-review-q4-2025")

    def test_underscores_to_hyphens(self):
        self.assertEqual(slugify("some_file_name"), "some-file-name")

    def test_multiple_spaces(self):
        self.assertEqual(slugify("hello   world"), "hello-world")

    def test_leading_trailing_special_chars(self):
        self.assertEqual(slugify("--hello world--"), "hello-world")

    def test_empty_string(self):
        self.assertEqual(slugify(""), "untitled")

    def test_none_input(self):
        self.assertEqual(slugify(None), "untitled")

    def test_max_length(self):
        long_text = "this is a very long title that should be truncated"
        result = slugify(long_text, max_length=20)
        self.assertLessEqual(len(result), 20)

    def test_max_length_breaks_at_hyphen(self):
        result = slugify("word-another-more-extra", max_length=15)
        self.assertNotEqual(result[-1], "-")

    def test_unicode_stripped(self):
        result = slugify("café meeting")
        self.assertEqual(result, "caf-meeting")

    def test_all_special_chars(self):
        result = slugify("@#$%^&*()")
        self.assertEqual(result, "untitled")


class TestParseDate(unittest.TestCase):
    """Tests for parse_date()."""

    def test_iso_format(self):
        self.assertEqual(parse_date("2026-02-05"), "2026-02-05")

    def test_iso_with_time(self):
        self.assertEqual(parse_date("2026-02-05T14:30:00Z"), "2026-02-05")

    def test_slash_format(self):
        self.assertEqual(parse_date("2026/02/05"), "2026-02-05")

    def test_us_slash_format(self):
        self.assertEqual(parse_date("02/05/2026"), "2026-02-05")

    def test_long_month_format(self):
        self.assertEqual(parse_date("February 05, 2026"), "2026-02-05")

    def test_short_month_format(self):
        self.assertEqual(parse_date("Feb 05, 2026"), "2026-02-05")

    def test_empty_string(self):
        self.assertIsNone(parse_date(""))

    def test_none_input(self):
        self.assertIsNone(parse_date(None))

    def test_invalid_date(self):
        self.assertIsNone(parse_date("not-a-date"))

    def test_us_dash_format(self):
        self.assertEqual(parse_date("02-05-2026"), "2026-02-05")


class TestFormatDuration(unittest.TestCase):
    """Tests for format_duration()."""

    def test_minutes_only(self):
        self.assertEqual(format_duration(30), "30 minutes")

    def test_one_hour(self):
        self.assertEqual(format_duration(60), "1 hour")

    def test_multiple_hours(self):
        self.assertEqual(format_duration(120), "2 hours")

    def test_hours_and_minutes(self):
        self.assertEqual(format_duration(90), "1h 30m")

    def test_zero(self):
        self.assertEqual(format_duration(0), "0 minutes")

    def test_large_duration(self):
        result = format_duration(180)
        self.assertEqual(result, "3 hours")


class TestCheckDuplicate(unittest.TestCase):
    """Tests for check_duplicate()."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tmppath = Path(self.tmpdir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_no_duplicate_empty_dir(self):
        self.assertFalse(check_duplicate(self.tmppath, "abc123", "test.md"))

    def test_duplicate_by_filename(self):
        (self.tmppath / "test.md").write_text("content")
        self.assertTrue(check_duplicate(self.tmppath, None, "test.md"))

    def test_duplicate_by_meeting_id(self):
        (self.tmppath / "meeting.md").write_text("**Meeting ID**: abc123\nSome content")
        self.assertTrue(check_duplicate(self.tmppath, "abc123"))

    def test_no_duplicate_different_id(self):
        (self.tmppath / "meeting.md").write_text("**Meeting ID**: xyz789\nSome content")
        self.assertFalse(check_duplicate(self.tmppath, "abc123"))

    def test_nonexistent_directory(self):
        self.assertFalse(check_duplicate(Path("/nonexistent"), "abc123", "test.md"))

    def test_no_args(self):
        self.assertFalse(check_duplicate(self.tmppath))


class TestRenderTemplate(unittest.TestCase):
    """Tests for render_template()."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tmppath = Path(self.tmpdir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_basic_substitution(self):
        template_path = self.tmppath / "template.md"
        template_path.write_text("# {title}\n\nBy {author}")
        result = render_template(template_path, {"title": "Hello", "author": "Alice"})
        self.assertEqual(result, "# Hello\n\nBy Alice")

    def test_missing_variable_left_as_is(self):
        template_path = self.tmppath / "template.md"
        template_path.write_text("# {title}\n\n{missing}")
        result = render_template(template_path, {"title": "Hello"})
        self.assertEqual(result, "# Hello\n\n{missing}")

    def test_none_value_becomes_empty(self):
        template_path = self.tmppath / "template.md"
        template_path.write_text("Value: {key}")
        result = render_template(template_path, {"key": None})
        self.assertEqual(result, "Value: ")

    def test_nonexistent_template_raises(self):
        with self.assertRaises(FileNotFoundError):
            render_template(Path("/nonexistent/template.md"), {})

    def test_empty_variables(self):
        template_path = self.tmppath / "template.md"
        template_path.write_text("No vars here")
        result = render_template(template_path, {})
        self.assertEqual(result, "No vars here")


class TestLoadCredentials(unittest.TestCase):
    """Tests for load_credentials()."""

    def test_loads_from_env_vars(self):
        with patch.dict(os.environ, {"FATHOM_API_KEY": "test-key-123"}):
            creds = load_credentials("fathom")
            self.assertIsNotNone(creds)
            self.assertEqual(creds["api_key"], "test-key-123")

    def test_returns_none_when_no_creds(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch("utils.get_workspace_root", return_value=Path("/nonexistent")):
                creds = load_credentials("nonexistent_integration")
                self.assertIsNone(creds)


class TestIsAreteWorkspace(unittest.TestCase):
    """Tests for _is_arete_workspace()."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tmppath = Path(self.tmpdir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_with_arete_yaml(self):
        (self.tmppath / "arete.yaml").write_text("schema: 1")
        self.assertTrue(_is_arete_workspace(self.tmppath))

    def test_with_context_and_memory(self):
        (self.tmppath / "context").mkdir()
        (self.tmppath / "memory").mkdir()
        self.assertTrue(_is_arete_workspace(self.tmppath))

    def test_empty_dir(self):
        self.assertFalse(_is_arete_workspace(self.tmppath))

    def test_only_context(self):
        (self.tmppath / "context").mkdir()
        self.assertFalse(_is_arete_workspace(self.tmppath))


class TestGetWorkspaceRoot(unittest.TestCase):
    """Tests for get_workspace_root()."""

    def test_env_var_override(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch.dict(os.environ, {"ARETE_WORKSPACE_ROOT": tmpdir}):
                result = get_workspace_root()
                self.assertEqual(result, Path(tmpdir))

    def test_env_var_with_nonexistent_path(self):
        with patch.dict(os.environ, {"ARETE_WORKSPACE_ROOT": "/nonexistent/path"}):
            # Should fall through to walking up from cwd
            result = get_workspace_root()
            # Returns something (fallback), doesn't crash
            self.assertIsNotNone(result)


class TestSimpleYamlParse(unittest.TestCase):
    """Tests for _simple_yaml_parse()."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.tmppath = Path(self.tmpdir)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    def test_basic_key_value(self):
        path = self.tmppath / "test.yaml"
        path.write_text("name: fathom\nstatus: active\n")
        result = _simple_yaml_parse(path)
        self.assertEqual(result["name"], "fathom")
        self.assertEqual(result["status"], "active")

    def test_nested_sections(self):
        path = self.tmppath / "test.yaml"
        path.write_text("parent:\n  child: value\n")
        result = _simple_yaml_parse(path)
        self.assertEqual(result["parent"]["child"], "value")

    def test_quoted_values(self):
        path = self.tmppath / "test.yaml"
        path.write_text('key: "quoted value"\n')
        result = _simple_yaml_parse(path)
        self.assertEqual(result["key"], "quoted value")

    def test_comments_ignored(self):
        path = self.tmppath / "test.yaml"
        path.write_text("# comment\nkey: value\n# another comment\n")
        result = _simple_yaml_parse(path)
        self.assertEqual(result["key"], "value")
        self.assertNotIn("#", str(result))

    def test_nonexistent_file(self):
        result = _simple_yaml_parse(Path("/nonexistent"))
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
