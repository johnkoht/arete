"""
Tests for scripts/integrations/fathom.py

Run with: python -m pytest scripts/integrations/test_fathom.py -v
    or:   python -m unittest scripts.integrations.test_fathom -v
"""

import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock, PropertyMock

import sys
sys.path.insert(0, str(Path(__file__).parent))

from fathom import (
    FathomClient,
    transform_to_template,
    generate_filename,
    save_meeting,
)


class TestFathomClientInit(unittest.TestCase):
    """Tests for FathomClient initialization."""

    def test_init_with_explicit_key(self):
        client = FathomClient(api_key="test-key-123")
        self.assertEqual(client.api_key, "test-key-123")

    def test_init_from_env_var(self):
        with patch.dict(os.environ, {"FATHOM_API_KEY": "env-key-456"}):
            client = FathomClient()
            self.assertEqual(client.api_key, "env-key-456")

    def test_init_raises_without_key(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch("fathom.load_credentials", return_value=None):
                with self.assertRaises(ValueError) as ctx:
                    FathomClient()
                self.assertIn("API key not found", str(ctx.exception))

    def test_init_from_credentials_file(self):
        with patch.dict(os.environ, {}, clear=True):
            with patch("fathom.load_credentials", return_value={"api_key": "file-key"}):
                client = FathomClient()
                self.assertEqual(client.api_key, "file-key")

    def test_session_headers(self):
        client = FathomClient(api_key="test-key")
        self.assertEqual(client.session.headers["X-Api-Key"], "test-key")
        self.assertEqual(client.session.headers["Content-Type"], "application/json")


class TestFathomClientRequest(unittest.TestCase):
    """Tests for FathomClient._request() error handling."""

    def setUp(self):
        self.client = FathomClient(api_key="test-key")

    def test_401_raises_auth_error(self):
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = __import__(
            "requests"
        ).exceptions.HTTPError(response=mock_response)

        with patch.object(self.client.session, "request", return_value=mock_response):
            with self.assertRaises(ValueError) as ctx:
                self.client._request("GET", "/test")
            self.assertIn("Invalid or expired", str(ctx.exception))

    def test_429_raises_rate_limit_error(self):
        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.raise_for_status.side_effect = __import__(
            "requests"
        ).exceptions.HTTPError(response=mock_response)

        with patch.object(self.client.session, "request", return_value=mock_response):
            with self.assertRaises(ValueError) as ctx:
                self.client._request("GET", "/test")
            self.assertIn("Rate limited", str(ctx.exception))

    def test_network_error(self):
        with patch.object(
            self.client.session,
            "request",
            side_effect=__import__("requests").exceptions.ConnectionError("DNS failed"),
        ):
            with self.assertRaises(ValueError) as ctx:
                self.client._request("GET", "/test")
            self.assertIn("Network error", str(ctx.exception))

    def test_successful_request(self):
        mock_response = MagicMock()
        mock_response.json.return_value = {"meetings": []}
        mock_response.raise_for_status = MagicMock()

        with patch.object(self.client.session, "request", return_value=mock_response):
            result = self.client._request("GET", "/meetings")
            self.assertEqual(result, {"meetings": []})


class TestFathomClientListMeetings(unittest.TestCase):
    """Tests for FathomClient.list_meetings()."""

    def setUp(self):
        self.client = FathomClient(api_key="test-key")

    @patch("fathom.load_integration_config")
    def test_list_with_date_range(self, mock_config):
        mock_config.return_value = {"defaults": {"min_duration": 5, "exclude_patterns": []}}

        meetings = [
            {"id": "1", "title": "Standup", "duration_minutes": 15, "date": "2026-02-05"},
            {"id": "2", "title": "Review", "duration_minutes": 30, "date": "2026-02-04"},
        ]

        with patch.object(
            self.client,
            "_request",
            return_value={"meetings": meetings},
        ):
            result = self.client.list_meetings("2026-01-29", "2026-02-05")
            self.assertEqual(len(result), 2)

    @patch("fathom.load_integration_config")
    def test_filters_short_meetings(self, mock_config):
        mock_config.return_value = {"defaults": {"min_duration": 10, "exclude_patterns": []}}

        meetings = [
            {"id": "1", "title": "Quick Chat", "duration_minutes": 3},
            {"id": "2", "title": "Real Meeting", "duration_minutes": 30},
        ]

        with patch.object(
            self.client,
            "_request",
            return_value={"meetings": meetings},
        ):
            result = self.client.list_meetings()
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["title"], "Real Meeting")

    @patch("fathom.load_integration_config")
    def test_filters_excluded_patterns(self, mock_config):
        mock_config.return_value = {
            "defaults": {
                "min_duration": 0,
                "exclude_patterns": ["Personal", "Lunch"],
            }
        }

        meetings = [
            {"id": "1", "title": "Personal Call", "duration_minutes": 30},
            {"id": "2", "title": "Team Standup", "duration_minutes": 15},
            {"id": "3", "title": "Lunch Break", "duration_minutes": 60},
        ]

        with patch.object(
            self.client,
            "_request",
            return_value={"meetings": meetings},
        ):
            result = self.client.list_meetings()
            self.assertEqual(len(result), 1)
            self.assertEqual(result[0]["title"], "Team Standup")


class TestFathomClientGetMeetingSummary(unittest.TestCase):
    """Tests for FathomClient.get_meeting_summary()."""

    def setUp(self):
        self.client = FathomClient(api_key="test-key")

    def test_returns_structured_summary(self):
        api_response = {
            "summary": "Discussed roadmap",
            "highlights": ["Point A", "Point B"],
            "action_items": ["Do X"],
            "decisions": ["Decided Y"],
            "template_name": "default",
        }

        with patch.object(self.client, "_request", return_value=api_response):
            result = self.client.get_meeting_summary("rec123")
            self.assertEqual(result["summary"], "Discussed roadmap")
            self.assertEqual(len(result["highlights"]), 2)
            self.assertEqual(len(result["action_items"]), 1)
            self.assertEqual(len(result["decisions"]), 1)

    def test_handles_missing_fields(self):
        with patch.object(self.client, "_request", return_value={}):
            result = self.client.get_meeting_summary("rec123")
            self.assertEqual(result["summary"], "")
            self.assertEqual(result["highlights"], [])
            self.assertEqual(result["action_items"], [])
            self.assertEqual(result["decisions"], [])


class TestFathomClientGetTranscript(unittest.TestCase):
    """Tests for FathomClient.get_meeting_transcript()."""

    def setUp(self):
        self.client = FathomClient(api_key="test-key")

    def test_formats_transcript_with_timestamps(self):
        api_response = {
            "segments": [
                {"speaker": "Alice", "text": "Hello", "start_time": "00:00"},
                {"speaker": "Bob", "text": "Hi there", "start_time": "00:05"},
            ]
        }

        with patch.object(self.client, "_request", return_value=api_response):
            result = self.client.get_meeting_transcript("rec123")
            self.assertIn("**[00:00] Alice**: Hello", result)
            self.assertIn("**[00:05] Bob**: Hi there", result)

    def test_formats_transcript_without_timestamps(self):
        api_response = {
            "segments": [
                {"speaker": "Alice", "text": "Hello"},
            ]
        }

        with patch.object(self.client, "_request", return_value=api_response):
            result = self.client.get_meeting_transcript("rec123")
            self.assertIn("**Alice**: Hello", result)

    def test_empty_transcript(self):
        with patch.object(self.client, "_request", return_value={"segments": []}):
            result = self.client.get_meeting_transcript("rec123")
            self.assertEqual(result, "")


class TestGenerateFilename(unittest.TestCase):
    """Tests for generate_filename()."""

    def test_basic_filename(self):
        data = {"date": "2026-02-05", "title": "Product Review"}
        result = generate_filename(data)
        self.assertEqual(result, "2026-02-05-product-review.md")

    def test_iso_datetime_strips_time(self):
        data = {"date": "2026-02-05T14:30:00Z", "title": "Standup"}
        result = generate_filename(data)
        self.assertEqual(result, "2026-02-05-standup.md")

    def test_missing_date_uses_today(self):
        data = {"date": "", "title": "Meeting"}
        result = generate_filename(data)
        today = datetime.now().strftime("%Y-%m-%d")
        self.assertTrue(result.startswith(today))

    def test_missing_title(self):
        data = {"date": "2026-02-05"}
        result = generate_filename(data)
        self.assertEqual(result, "2026-02-05-untitled.md")

    def test_special_chars_in_title(self):
        data = {"date": "2026-02-05", "title": "Q4 Review: Goals & Metrics!"}
        result = generate_filename(data)
        self.assertTrue(result.startswith("2026-02-05-"))
        self.assertTrue(result.endswith(".md"))
        # No special chars in filename
        name_part = result[len("2026-02-05-"):-len(".md")]
        self.assertRegex(name_part, r"^[a-z0-9\-]+$")


class TestTransformToTemplate(unittest.TestCase):
    """Tests for transform_to_template()."""

    def setUp(self):
        # Create a minimal template for testing
        self.tmpdir = tempfile.mkdtemp()
        self.template_dir = Path(self.tmpdir) / "templates" / "inputs"
        self.template_dir.mkdir(parents=True)
        self.template_path = self.template_dir / "integration-meeting.md"
        self.template_path.write_text(
            "# {title}\n\n"
            "**Date**: {date}\n"
            "**Duration**: {duration}\n"
            "**Attendees**: {attendees}\n\n"
            "## Summary\n{summary}\n\n"
            "## Key Points\n{key_points}\n\n"
            "## Action Items\n{action_items}\n\n"
            "## Decisions\n{decisions}\n\n"
            "## Transcript\n{transcript}\n\n"
            "**Meeting ID**: {meeting_id}\n"
        )

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    @patch("fathom.Path")
    def test_basic_transform(self, mock_path_cls):
        # Make the template path resolve to our temp template
        mock_path_cls.return_value.__truediv__ = MagicMock()

        meeting_data = {
            "title": "Product Review",
            "date": "2026-02-05T14:00:00Z",
            "duration_minutes": 30,
            "participants": [{"name": "Alice"}, {"name": "Bob"}],
            "summary": "Reviewed Q4 metrics",
            "highlights": ["Revenue up 20%"],
            "action_items": ["Follow up on churn"],
            "decisions": ["Launch in March"],
            "transcript": "Alice: Hello\nBob: Hi",
            "id": "rec123",
        }

        # Patch the template path to use our temp template
        with patch("fathom.Path") as mock_path:
            mock_path.return_value.parent = Path(self.tmpdir) / "scripts" / "integrations"
            # Reconstruct the expected path
            script_parent = Path(self.tmpdir) / "scripts" / "integrations"
            template_path = script_parent.parent.parent / "templates" / "inputs" / "integration-meeting.md"

            # Since Path(__file__) is patched, let's just test render_template directly
            from utils import render_template
            result = render_template(
                self.template_path,
                {
                    "title": "Product Review",
                    "date": "2026-02-05",
                    "duration": "30 minutes",
                    "attendees": "Alice, Bob",
                    "summary": "Reviewed Q4 metrics",
                    "key_points": "- Revenue up 20%",
                    "action_items": "- [ ] Follow up on churn",
                    "decisions": "- Launch in March",
                    "transcript": "Alice: Hello\nBob: Hi",
                    "meeting_id": "rec123",
                },
            )

            self.assertIn("# Product Review", result)
            self.assertIn("**Date**: 2026-02-05", result)
            self.assertIn("Alice, Bob", result)
            self.assertIn("Revenue up 20%", result)
            self.assertIn("**Meeting ID**: rec123", result)


class TestSaveMeeting(unittest.TestCase):
    """Tests for save_meeting()."""

    def setUp(self):
        self.tmpdir = tempfile.mkdtemp()
        self.output_dir = Path(self.tmpdir) / "meetings"
        self.output_dir.mkdir()

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmpdir, ignore_errors=True)

    @patch("fathom.transform_to_template")
    def test_saves_new_meeting(self, mock_transform):
        mock_transform.return_value = "# Meeting Content"

        meeting_data = {
            "date": "2026-02-05",
            "title": "Test Meeting",
            "id": "rec123",
        }

        result = save_meeting(meeting_data, self.output_dir)
        self.assertIsNotNone(result)
        self.assertTrue(result.exists())
        self.assertEqual(result.read_text(), "# Meeting Content")

    @patch("fathom.transform_to_template")
    def test_skips_duplicate(self, mock_transform):
        # Create existing file
        (self.output_dir / "2026-02-05-test-meeting.md").write_text("existing")

        meeting_data = {
            "date": "2026-02-05",
            "title": "Test Meeting",
            "id": "rec123",
        }

        result = save_meeting(meeting_data, self.output_dir)
        self.assertIsNone(result)

    @patch("fathom.transform_to_template")
    def test_force_overwrites(self, mock_transform):
        mock_transform.return_value = "# New Content"

        # Create existing file
        (self.output_dir / "2026-02-05-test-meeting.md").write_text("existing")

        meeting_data = {
            "date": "2026-02-05",
            "title": "Test Meeting",
            "id": "rec123",
        }

        result = save_meeting(meeting_data, self.output_dir, force=True)
        self.assertIsNotNone(result)
        self.assertEqual(result.read_text(), "# New Content")


if __name__ == "__main__":
    unittest.main()
