/**
 * Top-level route command: route user query to skill/tool + suggest model tier.
 * Combines skill-router and model-router for agents or users who want one call.
 */

import { findWorkspaceRoot, getWorkspacePaths } from '../core/workspace.js';
import { loadConfig, getAgentMode } from '../core/config.js';
import { routeToSkill } from '../core/skill-router.js';
import { classifyTask } from '../core/model-router.js';
import { getMergedSkillsForRouting, applySkillDefaults } from './skill.js';
import { getMergedToolsForRouting } from './tool.js';
import type { CommandOptions } from '../types.js';

export async function routeCommand(query: string, options: CommandOptions): Promise<void> {
  const { json } = options;

  const workspaceRoot = findWorkspaceRoot();
  const skillRoute = workspaceRoot
    ? (() => {
        const paths = getWorkspacePaths(workspaceRoot);
        const config = loadConfig(workspaceRoot);
        
        // Get skills
        const skills = getMergedSkillsForRouting(paths);
        const skillCandidates = skills.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          path: s.path,
          triggers: s.triggers,
          type: 'skill' as const,
          primitives: s.primitives as import('../types.js').ProductPrimitive[] | undefined,
          work_type: s.work_type as import('../types.js').WorkType | undefined,
          category: s.category as import('../types.js').SkillCategory | undefined,
          intelligence: s.intelligence,
          requires_briefing: s.requires_briefing,
        }));
        
        // Get tools (Phase 4: Tool Routing)
        const tools = getMergedToolsForRouting(paths);
        const toolCandidates = tools.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          path: t.path,
          triggers: t.triggers,
          type: 'tool' as const,
          lifecycle: t.lifecycle,
          duration: t.duration,
          work_type: t.work_type,
          category: t.category,
        }));
        
        // Merge candidates
        const candidates = [...skillCandidates, ...toolCandidates];
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
            type: skillRoute.type,
            action: skillRoute.action,
            primitives: skillRoute.primitives,
            work_type: skillRoute.work_type,
            category: skillRoute.category,
            requires_briefing: skillRoute.requires_briefing,
            resolvedFrom: skillRoute.resolvedFrom,
            lifecycle: skillRoute.lifecycle,
            duration: skillRoute.duration,
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
    const itemType = skillRoute.type === 'skill' ? 'Skill' : 'Tool';
    console.log(`${itemType}: ${skillRoute.skill}`);
    console.log(`  Path: ${skillRoute.path}`);
    console.log(`  Action: ${skillRoute.action}`);
    if (skillRoute.lifecycle) {
      console.log(`  Lifecycle: ${skillRoute.lifecycle}`);
    }
    console.log(`  Reason: ${skillRoute.reason}`);
  } else {
    console.log('Skill/Tool: (no match)');
  }
  console.log(`Model: ${modelClassification.tier} — ${modelClassification.reason}`);
}
