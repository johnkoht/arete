/**
 * Template commands – list and view meeting agenda templates
 */

import chalk from 'chalk';
import { findWorkspaceRoot } from '../core/workspace.js';
import { listMeetingAgendaTemplates, getMeetingAgendaTemplate } from '../core/meeting-agenda-templates.js';
import { error, info, header, section, listItem } from '../core/utils.js';
import type { CommandOptions } from '../types.js';

export interface TemplateListOptions extends CommandOptions {
  kind?: string;
}

export interface TemplateViewOptions extends CommandOptions {
  type?: string;
}

/**
 * arete template list meeting-agendas [--json]
 */
export async function templateListCommand(kind: string | undefined, options: TemplateListOptions): Promise<void> {
  const { json } = options;
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
      info('Run "arete install" to create a workspace');
    }
    process.exit(1);
    return;
  }

  if (kind !== 'meeting-agendas') {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Unknown template kind: ${kind}. Use 'meeting-agendas'.` }));
    } else {
      error(`Unknown template kind: ${kind ?? 'none'}. Use 'meeting-agendas'.`);
    }
    process.exit(1);
    return;
  }

  const { default: defaultTemplates, custom: customTemplates } = await listMeetingAgendaTemplates(workspaceRoot);

  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          default: defaultTemplates.map((t) => ({ name: t.name, type: t.type, description: t.description })),
          custom: customTemplates.map((t) => ({ name: t.name, type: t.type, description: t.description }))
        },
        null,
        2
      )
    );
    return;
  }

  header('Meeting agenda templates');
  section('Default Templates');
  if (defaultTemplates.length === 0) {
    info('No default templates found.');
  } else {
    for (const t of defaultTemplates) {
      listItem(t.name, t.description ?? '—', 1);
    }
  }
  console.log('');
  section('Custom Templates');
  if (customTemplates.length === 0) {
    info('No custom templates. Add .md files under .arete/templates/meeting-agendas/ to override or add types.');
  } else {
    for (const t of customTemplates) {
      listItem(t.name, t.description ?? '—', 1);
    }
  }
  console.log('');
}

/**
 * arete template view meeting-agenda --type <name> [--json]
 */
export async function templateViewCommand(kind: string | undefined, options: TemplateViewOptions): Promise<void> {
  const { json, type: typeOpt } = options;
  const workspaceRoot = findWorkspaceRoot();
  if (!workspaceRoot) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Not in an Areté workspace' }));
    } else {
      error('Not in an Areté workspace');
    }
    process.exit(1);
    return;
  }

  if (kind !== 'meeting-agenda') {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Unknown template kind: ${kind}. Use 'meeting-agenda'.` }));
    } else {
      error(`Unknown template kind: ${kind ?? 'none'}. Use 'meeting-agenda'.`);
    }
    process.exit(1);
    return;
  }

  const type = typeOpt ?? '';
  if (!type) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: 'Missing --type. Example: --type leadership' }));
    } else {
      error('Missing --type. Example: arete template view meeting-agenda --type leadership');
    }
    process.exit(1);
    return;
  }

  const template = await getMeetingAgendaTemplate(workspaceRoot, type);
  if (!template) {
    if (json) {
      console.log(JSON.stringify({ success: false, error: `Template not found for type: ${type}` }));
    } else {
      error(`Template not found for type: ${type}`);
      info('Run "arete template list meeting-agendas" to see available types.');
    }
    process.exit(1);
    return;
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          success: true,
          name: template.name,
          type: template.type,
          description: template.description,
          path: template.path,
          sections: template.sections,
          timeAllocation: template.timeAllocation,
          body: template.body
        },
        null,
        2
      )
    );
    return;
  }

  header(`${template.name} (${template.type})`);
  if (template.description) {
    listItem('Description', template.description);
  }
  listItem('Path', template.path);
  if (template.sections && template.sections.length > 0) {
    listItem('Sections', template.sections.join(', '));
  }
  if (template.timeAllocation && Object.keys(template.timeAllocation).length > 0) {
    const alloc = Object.entries(template.timeAllocation)
      .map(([k, v]) => `${k}: ${v}%`)
      .join('; ');
    listItem('Time allocation', alloc);
  }
  if (template.body) {
    console.log('');
    section('Body');
    console.log(template.body);
  }
  console.log('');
}
