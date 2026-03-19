#!/usr/bin/env tsx
/**
 * Backfill commitments from approved meetings that are missing attendee_ids.
 * 
 * Usage (from your Areté workspace):
 *   npx tsx /path/to/arete/packages/apps/backend/scripts/backfill-commitments.ts
 * 
 * Or copy this script to your workspace and run:
 *   npx tsx backfill-commitments.ts
 */

import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { createServices, extractAttendeeSlugs } from '@arete/core';

async function main() {
  const workspaceRoot = process.cwd();
  
  // Verify we're in an Areté workspace
  try {
    await fs.access(path.join(workspaceRoot, 'arete.yaml'));
  } catch {
    console.error('Error: Not in an Areté workspace (no arete.yaml found)');
    console.error('Run this script from your Areté workspace root.');
    process.exit(1);
  }

  const meetingsDir = path.join(workspaceRoot, 'resources', 'meetings');
  
  // Check if meetings directory exists
  try {
    await fs.access(meetingsDir);
  } catch {
    console.error('Error: No meetings directory found at resources/meetings/');
    process.exit(1);
  }

  // Find all meeting files
  const files = await fs.readdir(meetingsDir);
  const mdFiles = files.filter(f => f.endsWith('.md') && f !== 'index.md');
  
  console.log(`Found ${mdFiles.length} meeting files\n`);

  const toBackfill: Array<{ slug: string; path: string; attendeeIds: string[] }> = [];

  // Scan for approved meetings missing attendee_ids
  for (const file of mdFiles) {
    const filePath = path.join(meetingsDir, file);
    const content = await fs.readFile(filePath, 'utf8');
    const { data: fm } = matter(content);
    
    // Check if approved but missing attendee_ids
    const status = fm['status'] as string | undefined;
    const hasApprovedItems = fm['approved_items'] && typeof fm['approved_items'] === 'object';
    const isApproved = status === 'approved' || hasApprovedItems;
    
    const existingIds = fm['attendee_ids'];
    const hasAttendeeIds = Array.isArray(existingIds) && existingIds.length > 0;
    
    if (isApproved && !hasAttendeeIds) {
      // Compute attendee_ids from attendees
      const attendeeIds = extractAttendeeSlugs(fm);
      
      if (attendeeIds.length > 0) {
        const slug = file.replace(/\.md$/, '');
        toBackfill.push({ slug, path: filePath, attendeeIds });
        console.log(`📋 ${slug}`);
        console.log(`   Attendees: ${attendeeIds.join(', ')}`);
      }
    }
  }

  if (toBackfill.length === 0) {
    console.log('✅ No meetings need backfilling. All approved meetings have attendee_ids.');
    return;
  }

  console.log(`\n Found ${toBackfill.length} approved meetings missing attendee_ids.\n`);
  console.log('This script will:');
  console.log('  1. Write attendee_ids to each meeting\'s frontmatter');
  console.log('  2. Refresh person memory for each attendee (syncs action items to commitments)\n');
  
  // Prompt for confirmation
  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  
  const answer = await new Promise<string>(resolve => {
    rl.question('Proceed? (y/N) ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'y') {
    console.log('Aborted.');
    return;
  }

  console.log('\nBackfilling...\n');

  // Create services for person memory refresh
  const services = await createServices(workspaceRoot);
  const paths = services.workspace.getPaths(workspaceRoot);
  const allRefreshedSlugs = new Set<string>();

  for (const { slug, path: filePath, attendeeIds } of toBackfill) {
    console.log(`Processing ${slug}...`);
    
    // Write attendee_ids to frontmatter
    const content = await fs.readFile(filePath, 'utf8');
    const parsed = matter(content);
    parsed.data['attendee_ids'] = attendeeIds;
    const updated = matter.stringify(parsed.content, parsed.data);
    await fs.writeFile(filePath, updated, 'utf8');
    console.log(`  ✓ Wrote attendee_ids: ${attendeeIds.join(', ')}`);
    
    // Track unique slugs for refresh
    for (const id of attendeeIds) {
      allRefreshedSlugs.add(id);
    }
  }

  // Refresh person memory for each unique attendee (syncs to CommitmentsService)
  console.log('\nRefreshing person memory...\n');
  
  for (const personSlug of allRefreshedSlugs) {
    try {
      await services.entity.refreshPersonMemory(paths, {
        personSlug,
        commitments: services.commitments,
      });
      console.log(`  ✓ Refreshed: ${personSlug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠ Skipped ${personSlug}: ${msg}`);
    }
  }

  console.log('\n✅ Backfill complete!');
  console.log(`   Meetings updated: ${toBackfill.length}`);
  console.log(`   People refreshed: ${allRefreshedSlugs.size}`);
  console.log('\nRun "arete commitments list" to see synced action items.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
