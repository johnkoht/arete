#!/usr/bin/env npx tsx
/**
 * Quick test script to check if FreeBusy API works for a colleague's calendar.
 * 
 * Usage: npx tsx scripts/test-freebusy.ts <email> [workspace-path]
 * 
 * Example: npx tsx scripts/test-freebusy.ts jane@company.com ~/my-workspace
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const FREEBUSY_URL = 'https://www.googleapis.com/calendar/v3/freeBusy';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Use env vars or fallback (same as main integration)
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'PLACEHOLDER_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER_CLIENT_SECRET';

type Credentials = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

async function refreshToken(creds: Credentials): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: creds.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} - run: arete integration configure google-calendar`);
  }

  const tokens = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  
  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? creds.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + tokens.expires_in,
  };
}

async function main() {
  const email = process.argv[2];
  const workspacePath = process.argv[3] || process.cwd();
  
  if (!email) {
    console.error('Usage: npx tsx scripts/test-freebusy.ts <email> [workspace-path]');
    console.error('Example: npx tsx scripts/test-freebusy.ts jane@company.com');
    process.exit(1);
  }

  // Load credentials
  const credPath = join(workspacePath, '.credentials', 'credentials.yaml');
  if (!existsSync(credPath)) {
    console.error(`No credentials found at ${credPath}`);
    console.error('Run: arete integration configure google-calendar');
    process.exit(1);
  }

  const credContent = readFileSync(credPath, 'utf-8');
  const allCreds = parseYaml(credContent) as Record<string, unknown>;
  let gcal = allCreds.google_calendar as Credentials | undefined;
  
  if (!gcal?.access_token || !gcal?.refresh_token) {
    console.error('No Google Calendar credentials found.');
    console.error('Run: arete integration configure google-calendar');
    process.exit(1);
  }

  // Check if token is expired (with 5 min buffer) and refresh if needed
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (gcal.expires_at - nowSeconds < 300) {
    console.log('Token expired, refreshing...');
    try {
      gcal = await refreshToken(gcal);
      // Save refreshed token
      allCreds.google_calendar = gcal;
      writeFileSync(credPath, stringifyYaml(allCreds));
      console.log('Token refreshed successfully.\n');
    } catch (err) {
      console.error('Failed to refresh token:', err);
      process.exit(1);
    }
  }

  // Set up time range: next 7 days
  const now = new Date();
  const nextWeek = new Date(now);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const requestBody = {
    timeMin: now.toISOString(),
    timeMax: nextWeek.toISOString(),
    items: [
      { id: email },           // The person you want to check
      { id: 'primary' },       // Your own calendar for comparison
    ],
  };

  console.log(`\nChecking free/busy for: ${email}`);
  console.log(`Time range: ${now.toLocaleDateString()} - ${nextWeek.toLocaleDateString()}\n`);

  const res = await fetch(FREEBUSY_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${gcal.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`API Error (${res.status}):`, errorText);
    process.exit(1);
  }

  const data = await res.json() as {
    calendars: Record<string, { busy: Array<{ start: string; end: string }>; errors?: Array<{ reason: string }> }>;
  };

  // Check results for each calendar
  for (const [calId, info] of Object.entries(data.calendars)) {
    const label = calId === 'primary' ? 'Your calendar' : calId;
    
    if (info.errors?.length) {
      console.log(`❌ ${label}:`);
      console.log(`   Error: ${info.errors[0].reason}`);
      if (info.errors[0].reason === 'notFound') {
        console.log('   → This person may not have shared their calendar with you');
      }
    } else if (info.busy.length === 0) {
      console.log(`✅ ${label}: No busy blocks (either completely free, or no access)`);
      console.log('   → If this seems wrong, they may not have shared free/busy with you');
    } else {
      console.log(`✅ ${label}: ${info.busy.length} busy blocks found`);
      // Show first few busy blocks
      for (const block of info.busy.slice(0, 5)) {
        const start = new Date(block.start);
        const end = new Date(block.end);
        console.log(`   ${start.toLocaleString()} - ${end.toLocaleTimeString()}`);
      }
      if (info.busy.length > 5) {
        console.log(`   ... and ${info.busy.length - 5} more`);
      }
    }
    console.log();
  }

  // Summary
  const theirCalendar = data.calendars[email];
  if (theirCalendar && !theirCalendar.errors && theirCalendar.busy.length > 0) {
    console.log('🎉 FreeBusy works for your organization! You can build the scheduling feature.');
  } else if (theirCalendar?.errors) {
    console.log('⚠️  FreeBusy did not work for this person. Check their calendar sharing settings.');
  } else {
    console.log('⚠️  Got empty results. Either they\'re completely free, or sharing isn\'t enabled.');
    console.log('   Try with someone you know has meetings this week to confirm.');
  }
}

main().catch(console.error);
