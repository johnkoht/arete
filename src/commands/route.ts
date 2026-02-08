/**
 * Top-level route command: route user query to skill + suggest model tier.
 * Combines skill-router and model-router for agents or users who want one call.
 */

import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { loadConfig, getAgentMode } from '../core/config.js';
import { routeToSkill } from '../core/skill-router.js';
import { classifyTask } from '../core/model-router.js';
import { getMergedSkillsForRouting, applySkillDefaults } from './skill.js';
import type { CommandOptions } from '../types.js';

export async function routeCommand(query: string, options: CommandOptions): Promise<void> {
  const { json } = options;

  const workspaceRoot = findWorkspaceRoot();
  const skillRoute = workspaceRoot
    ? (() => {
        const paths = getWorkspacePaths(workspaceRoot);
        const config = loadConfig(workspaceRoot);
        const skills = getMergedSkillsForRouting(paths);
        const candidates = skills.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          path: s.path,
          triggers: s.triggers,
          primitives: s.primitives as import('../types.js').ProductPrimitive[] | undefined,
          work_type: s.work_type as import('../types.js').WorkType | undefined,
          category: s.category as import('../types.js').SkillCategory | undefined,
          intelligence: s.intelligence,
          requires_briefing: s.requires_briefing,
        }));
        const routed = routeToSkill(query, candidates);
        return applySkillDefaults(routed, skills, config.skills?.defaults);
      })()
    : null;

  const modelClassification = classifyTask(query);

  const agentMode = workspaceRoot ? getAgentMode(workspaceRoot) : null;

  if (json) {
    console.log(JSON.stringify({
      success: true,
      query: query.trim(),
      agent_mode: agentMode,
      skill: skillRoute
        ? {
            skill: skillRoute.skill,
            path: skillRoute.path,
            reason: skillRoute.reason,
            primitives: skillRoute.primitives,
            work_type: skillRoute.work_type,
            category: skillRoute.category,
            requires_briefing: skillRoute.requires_briefing,
            resolvedFrom: skillRoute.resolvedFrom,
          }
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
