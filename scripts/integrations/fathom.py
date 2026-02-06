#!/usr/bin/env python3
"""
Fathom API Client for Areté

Fetches meeting recordings, summaries, and transcripts from Fathom.
Used by the sync skill and seed-context tool.

API Documentation: https://developers.fathom.ai

Usage:
    python fathom.py list --days 7
    python fathom.py list --start 2026-01-01 --end 2026-02-01
    python fathom.py get <recording_id>
    python fathom.py get <recording_id> --output resources/meetings/
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    import requests
except ImportError:
    print("Error: requests library not installed. Run: pip install requests")
    sys.exit(1)

from utils import (
    load_credentials,
    load_integration_config,
    render_template,
    slugify,
    check_duplicate,
)


# Fathom API Configuration
FATHOM_API_BASE = "https://api.fathom.video/v1"


class FathomClient:
    """Client for interacting with Fathom API."""

    def __init__(self, api_key: Optional[str] = None):
        """Initialize with API key from args, env, or credentials file."""
        self.api_key = api_key or self._load_api_key()
        if not self.api_key:
            raise ValueError(
                "Fathom API key not found. Set FATHOM_API_KEY environment variable "
                "or add to .credentials/credentials.yaml"
            )
        self.session = requests.Session()
        self.session.headers.update({
            "X-Api-Key": self.api_key,
            "Content-Type": "application/json",
        })

    def _load_api_key(self) -> Optional[str]:
        """Load API key from environment or credentials file."""
        # Try environment variable first
        api_key = os.environ.get("FATHOM_API_KEY")
        if api_key:
            return api_key

        # Try credentials file
        creds = load_credentials("fathom")
        if creds and "api_key" in creds:
            return creds["api_key"]

        return None

    def _request(self, method: str, endpoint: str, **kwargs) -> dict:
        """Make an API request with error handling."""
        url = f"{FATHOM_API_BASE}{endpoint}"
        try:
            response = self.session.request(method, url, **kwargs)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            if response.status_code == 401:
                raise ValueError("Invalid or expired Fathom API key")
            elif response.status_code == 429:
                raise ValueError("Rate limited by Fathom API. Please wait and retry.")
            else:
                raise ValueError(f"Fathom API error: {e}")
        except requests.exceptions.RequestException as e:
            raise ValueError(f"Network error connecting to Fathom: {e}")

    def list_meetings(
        self,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        filters: Optional[dict] = None,
    ) -> list:
        """
        List meetings from Fathom.

        Args:
            start_date: ISO date string (YYYY-MM-DD) for range start
            end_date: ISO date string (YYYY-MM-DD) for range end
            filters: Optional dict with 'participants', 'keywords', 'min_duration'

        Returns:
            List of meeting metadata dicts
        """
        params = {}
        if start_date:
            params["start"] = start_date
        if end_date:
            params["end"] = end_date

        # Apply filters if provided
        if filters:
            if filters.get("participants"):
                params["participants"] = ",".join(filters["participants"])
            if filters.get("keywords"):
                params["keywords"] = ",".join(filters["keywords"])
            if filters.get("min_duration"):
                params["min_duration"] = filters["min_duration"]

        result = self._request("GET", "/meetings", params=params)
        meetings = result.get("meetings", result) if isinstance(result, dict) else result

        # Filter out short meetings and excluded patterns (from config)
        config = load_integration_config("fathom")
        defaults = config.get("defaults", {})
        min_duration = defaults.get("min_duration", 5)
        exclude_patterns = defaults.get("exclude_patterns", [])

        filtered = []
        for meeting in meetings:
            # Skip short meetings
            duration = meeting.get("duration_minutes", 0)
            if duration < min_duration:
                continue

            # Skip excluded patterns
            title = meeting.get("title", "")
            if any(pattern.lower() in title.lower() for pattern in exclude_patterns):
                continue

            filtered.append(meeting)

        return filtered

    def get_meeting_summary(self, recording_id: str) -> dict:
        """
        Get AI-generated summary for a recording.

        Args:
            recording_id: The Fathom recording ID

        Returns:
            Dict with summary, highlights, action_items, decisions
        """
        result = self._request("GET", f"/recordings/{recording_id}/summary")
        return {
            "summary": result.get("summary", ""),
            "highlights": result.get("highlights", []),
            "action_items": result.get("action_items", []),
            "decisions": result.get("decisions", []),
            "template_name": result.get("template_name", "default"),
        }

    def get_meeting_transcript(self, recording_id: str) -> str:
        """
        Get full transcript for a recording.

        Args:
            recording_id: The Fathom recording ID

        Returns:
            Formatted transcript string with speaker labels
        """
        result = self._request("GET", f"/recordings/{recording_id}/transcript")

        # Format transcript with speaker labels
        segments = result.get("segments", result) if isinstance(result, dict) else result
        if not segments:
            return ""

        lines = []
        for segment in segments:
            speaker = segment.get("speaker", "Unknown")
            text = segment.get("text", "")
            timestamp = segment.get("start_time", "")
            if timestamp:
                lines.append(f"**[{timestamp}] {speaker}**: {text}")
            else:
                lines.append(f"**{speaker}**: {text}")

        return "\n\n".join(lines)

    def get_meeting_details(self, recording_id: str) -> dict:
        """
        Get full meeting details including metadata, summary, and transcript.

        Args:
            recording_id: The Fathom recording ID

        Returns:
            Complete meeting data dict
        """
        # Get basic meeting info
        meeting = self._request("GET", f"/recordings/{recording_id}")

        # Get summary
        try:
            summary_data = self.get_meeting_summary(recording_id)
            meeting.update(summary_data)
        except Exception as e:
            print(f"Warning: Could not fetch summary for {recording_id}: {e}")

        # Get transcript
        try:
            transcript = self.get_meeting_transcript(recording_id)
            meeting["transcript"] = transcript
        except Exception as e:
            print(f"Warning: Could not fetch transcript for {recording_id}: {e}")
            meeting["transcript"] = ""

        return meeting


def transform_to_template(meeting_data: dict) -> str:
    """
    Transform Fathom meeting data to the integration-meeting.md template format.

    Args:
        meeting_data: Dict with meeting metadata, summary, transcript

    Returns:
        Rendered markdown string
    """
    # Load the template
    template_path = Path(__file__).parent.parent.parent / "templates" / "inputs" / "integration-meeting.md"

    # Prepare template variables
    date_str = meeting_data.get("date", "")
    if isinstance(date_str, str) and "T" in date_str:
        date_str = date_str.split("T")[0]

    # Format attendees as comma-separated list
    attendees = meeting_data.get("participants", meeting_data.get("attendees", []))
    if isinstance(attendees, list):
        attendees_str = ", ".join(
            a.get("name", a.get("email", str(a))) if isinstance(a, dict) else str(a)
            for a in attendees
        )
    else:
        attendees_str = str(attendees)

    # Format key points as bullet list
    highlights = meeting_data.get("highlights", [])
    if isinstance(highlights, list):
        key_points_str = "\n".join(f"- {h}" for h in highlights) if highlights else "No key points captured."
    else:
        key_points_str = str(highlights) or "No key points captured."

    # Format action items as checkbox list
    action_items = meeting_data.get("action_items", [])
    if isinstance(action_items, list):
        action_items_str = "\n".join(f"- [ ] {item}" for item in action_items) if action_items else "No action items captured."
    else:
        action_items_str = str(action_items) or "No action items captured."

    # Format decisions as bullet list
    decisions = meeting_data.get("decisions", [])
    if isinstance(decisions, list):
        decisions_str = "\n".join(f"- {d}" for d in decisions) if decisions else "No decisions captured."
    else:
        decisions_str = str(decisions) or "No decisions captured."

    # Build variables dict
    variables = {
        "title": meeting_data.get("title", "Untitled Meeting"),
        "date": date_str,
        "duration": f"{meeting_data.get('duration_minutes', 0)} minutes",
        "integration": "Fathom",
        "import_date": datetime.now().strftime("%Y-%m-%d"),
        "attendees": attendees_str,
        "summary": meeting_data.get("summary", "No summary available."),
        "key_points": key_points_str,
        "action_items": action_items_str,
        "decisions": decisions_str,
        "transcript": meeting_data.get("transcript", "No transcript available."),
        "meeting_id": meeting_data.get("id", meeting_data.get("recording_id", "")),
        "recording_link": meeting_data.get("recording_url", ""),
        "source_link": meeting_data.get("fathom_url", meeting_data.get("url", "")),
    }

    return render_template(template_path, variables)


def generate_filename(meeting_data: dict) -> str:
    """
    Generate a filename for the meeting following the naming convention.

    Args:
        meeting_data: Dict with meeting date and title

    Returns:
        Filename string like "2026-02-05-product-review.md"
    """
    date_str = meeting_data.get("date", "")
    if isinstance(date_str, str) and "T" in date_str:
        date_str = date_str.split("T")[0]
    elif not date_str:
        date_str = datetime.now().strftime("%Y-%m-%d")

    title = meeting_data.get("title", "untitled")
    title_slug = slugify(title)

    return f"{date_str}-{title_slug}.md"


def save_meeting(meeting_data: dict, output_dir: Path, force: bool = False) -> Optional[Path]:
    """
    Save a meeting to a markdown file.

    Args:
        meeting_data: Complete meeting data dict
        output_dir: Directory to save to
        force: Overwrite existing files

    Returns:
        Path to saved file, or None if skipped (duplicate)
    """
    filename = generate_filename(meeting_data)
    output_path = output_dir / filename

    # Check for duplicates
    meeting_id = meeting_data.get("id", meeting_data.get("recording_id", ""))
    if not force and check_duplicate(output_dir, meeting_id, filename):
        return None

    # Render and save
    content = transform_to_template(meeting_data)
    output_path.write_text(content)

    return output_path


# CLI Interface
def main():
    parser = argparse.ArgumentParser(
        description="Fathom API client for Areté workspace"
    )
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # List command
    list_parser = subparsers.add_parser("list", help="List meetings from Fathom")
    list_parser.add_argument(
        "--days", type=int, help="Number of days to look back"
    )
    list_parser.add_argument(
        "--start", type=str, help="Start date (YYYY-MM-DD)"
    )
    list_parser.add_argument(
        "--end", type=str, help="End date (YYYY-MM-DD)"
    )
    list_parser.add_argument(
        "--json", action="store_true", help="Output as JSON"
    )

    # Get command
    get_parser = subparsers.add_parser("get", help="Get a specific meeting")
    get_parser.add_argument("recording_id", help="Fathom recording ID")
    get_parser.add_argument(
        "--output", "-o", type=str,
        help="Output directory (saves as markdown file)"
    )
    get_parser.add_argument(
        "--json", action="store_true", help="Output as JSON instead of markdown"
    )
    get_parser.add_argument(
        "--force", "-f", action="store_true",
        help="Overwrite existing files"
    )

    # Fetch command (batch)
    fetch_parser = subparsers.add_parser(
        "fetch", help="Fetch and save multiple meetings"
    )
    fetch_parser.add_argument(
        "--days", type=int, default=7, help="Number of days to look back"
    )
    fetch_parser.add_argument(
        "--start", type=str, help="Start date (YYYY-MM-DD)"
    )
    fetch_parser.add_argument(
        "--end", type=str, help="End date (YYYY-MM-DD)"
    )
    fetch_parser.add_argument(
        "--output", "-o", type=str, default="resources/meetings",
        help="Output directory"
    )
    fetch_parser.add_argument(
        "--force", "-f", action="store_true",
        help="Overwrite existing files"
    )

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    try:
        client = FathomClient()

        if args.command == "list":
            # Calculate date range
            if args.days:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")
            else:
                start_date = args.start
                end_date = args.end

            meetings = client.list_meetings(start_date, end_date)

            if args.json:
                print(json.dumps(meetings, indent=2))
            else:
                print(f"Found {len(meetings)} meetings:\n")
                for m in meetings:
                    date = m.get("date", "")[:10] if m.get("date") else "Unknown"
                    title = m.get("title", "Untitled")
                    duration = m.get("duration_minutes", 0)
                    print(f"  - [{m.get('id', 'no-id')}] {date} - \"{title}\" ({duration} min)")

        elif args.command == "get":
            meeting = client.get_meeting_details(args.recording_id)

            if args.json:
                print(json.dumps(meeting, indent=2))
            elif args.output:
                output_dir = Path(args.output)
                output_dir.mkdir(parents=True, exist_ok=True)
                saved_path = save_meeting(meeting, output_dir, args.force)
                if saved_path:
                    print(f"Saved: {saved_path}")
                else:
                    print(f"Skipped (already exists): {generate_filename(meeting)}")
            else:
                # Print rendered markdown
                print(transform_to_template(meeting))

        elif args.command == "fetch":
            # Calculate date range
            if args.start and args.end:
                start_date = args.start
                end_date = args.end
            else:
                end_date = datetime.now().strftime("%Y-%m-%d")
                start_date = (datetime.now() - timedelta(days=args.days)).strftime("%Y-%m-%d")

            output_dir = Path(args.output)
            output_dir.mkdir(parents=True, exist_ok=True)

            print(f"Fetching meetings from {start_date} to {end_date}...")
            meetings = client.list_meetings(start_date, end_date)
            print(f"Found {len(meetings)} meetings\n")

            saved = 0
            skipped = 0
            errors = 0

            for m in meetings:
                recording_id = m.get("id", m.get("recording_id"))
                title = m.get("title", "Untitled")
                try:
                    print(f"  Fetching: {title}...", end=" ")
                    meeting = client.get_meeting_details(recording_id)
                    saved_path = save_meeting(meeting, output_dir, args.force)
                    if saved_path:
                        print(f"✓ Saved")
                        saved += 1
                    else:
                        print(f"⊘ Skipped (duplicate)")
                        skipped += 1
                except Exception as e:
                    print(f"✗ Error: {e}")
                    errors += 1

            print(f"\nComplete: {saved} saved, {skipped} skipped, {errors} errors")

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        print("\nAborted")
        sys.exit(130)


if __name__ == "__main__":
    main()
