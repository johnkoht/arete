# Credentials

This folder stores API keys, tokens, and other secrets for integrations. **Contents are not committed to git** (except this README and `.example` files).

## Setup

1. Copy the example file:
   ```bash
   cp credentials.yaml.example credentials.yaml
   ```

2. Add your actual API keys to `credentials.yaml`

3. The file will be ignored by git automatically

## File Structure

```yaml
# credentials.yaml

fathom:
  api_key: "your-fathom-api-key"

calendar:
  provider: google  # or outlook
  client_id: "your-client-id"
  client_secret: "your-client-secret"
  refresh_token: "your-refresh-token"

slack:
  bot_token: "xoxb-your-bot-token"
  user_token: "xoxp-your-user-token"  # optional

notion:
  api_key: "secret_your-notion-key"

linear:
  api_key: "lin_api_your-key"

github:
  token: "ghp_your-token"
```

## Getting API Keys

| Integration | Where to Get Key |
|-------------|------------------|
| Fathom | [fathom.video/settings/api](https://fathom.video/settings/api) |
| Apple Calendar | **No credentials needed** - uses local Calendar.app via icalBuddy |
| Google Calendar | [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials |
| Slack | [api.slack.com/apps](https://api.slack.com/apps) → Your App → OAuth & Permissions |
| Notion | [notion.so/my-integrations](https://www.notion.so/my-integrations) |
| Linear | [linear.app/settings/api](https://linear.app/settings/api) |
| GitHub | [github.com/settings/tokens](https://github.com/settings/tokens) |

## Apple Calendar Setup (macOS)

Apple Calendar works locally without API keys. Install icalBuddy:

```bash
brew install ical-buddy

# Test it works
icalBuddy -n eventsToday
```

## Security Notes

- Never commit `credentials.yaml` to git
- Use environment variables as an alternative: `export FATHOM_API_KEY="..."`
- Rotate keys periodically
- Use minimal required scopes when creating tokens

## Alternative: Environment Variables

Instead of this file, you can set environment variables:

```bash
# Add to ~/.zshrc or ~/.bashrc
export FATHOM_API_KEY="your-key"
export SLACK_BOT_TOKEN="xoxb-..."
export NOTION_API_KEY="secret_..."
```

The integration configs in `.cursor/integrations/configs/` will check both this file and environment variables.
