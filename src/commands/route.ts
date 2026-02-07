/**
 * Top-level route command: route user query to skill + suggest model tier.
 * Combines skill-router and model-router for agents or users who want one call.
 */

import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { routeToSkill } from '../core/skill-router.js';
import { classifyTask } from '../core/model-router.js';
import { getMergedSkillsForRouting } from './skill.js';
import type { CommandOptions } from '../types.js';

export async function routeCommand(query: string, options: CommandOptions): Promise<void> {
  const { json } = options;

  const workspaceRoot = findWorkspaceRoot();
  const skillRoute = workspaceRoot
    ? (() => {
        const paths = getWorkspacePaths(workspaceRoot);
        const skills = getMergedSkillsForRouting(paths);
        return routeToSkill(query, skills.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          path: s.path,
          triggers: s.triggers
        })));
      })()
    : null;

  const modelClassification = classifyTask(query);

  if (json) {
    console.log(JSON.stringify({
      success: true,
      query: query.trim(),
      skill: skillRoute
        ? { skill: skillRoute.skill, path: skillRoute.path, reason: skillRoute.reason }
        : null,
      model: {
        tier: modelClassification.tier,
        reason: modelClassification.reason
      }
    }, null, 2));
    return;
  }

  if (skillRoute) {
    console.log(`Skill: ${skillRoute.skill}`);
    console.log(`  Path: ${skillRoute.path}`);
    console.log(`  Reason: ${skillRoute.reason}`);
  } else {
    console.log('Skill: (no match)');
  }
  console.log(`Model: ${modelClassification.tier} — ${modelClassification.reason}`);
}
