/**
 * arete route <query> — route to skill + model tier suggestion
 */

import { createServices } from '@arete/core';
import type { Command } from 'commander';
import chalk from 'chalk';
import type { SkillCandidate } from '@arete/core';
import { toolsToCandidates } from '../lib/tool-candidates.js';

export function registerRouteCommand(program: Command): void {
  program
    .command('route <query>')
    .description('Route query to skill and suggest model tier')
    .option('--json', 'Output as JSON')
    .action(async (query: string, opts: { json?: boolean }) => {
      const services = await createServices(process.cwd());
      const root = await services.workspace.findRoot();
      const { classifyTask } = await import('@arete/core');

      let skillRoute: ReturnType<typeof services.intelligence.routeToSkill> = null;
      if (root) {
        const skills = await services.skills.list(root);
        const candidates: SkillCandidate[] = skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          path: s.path,
          triggers: s.triggers,
          type: 'skill' as const,
          primitives: s.primitives,
          work_type: s.workType,
          category: s.category,
          intelligence: s.intelligence,
          requires_briefing: s.requiresBriefing,
        }));

        const paths = services.workspace.getPaths(root);
        const tools = await services.tools.list(paths.tools);
        candidates.push(...toolsToCandidates(tools));

        skillRoute = services.intelligence.routeToSkill(query, candidates);
      }

      const modelClassification = classifyTask(query);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              success: true,
              query: query?.trim(),
              skill: skillRoute
                ? {
                    skill: skillRoute.skill,
                    path: skillRoute.path,
                    reason: skillRoute.reason,
                    type: skillRoute.type,
                    action: skillRoute.action,
                  }
                : null,
              model: {
                tier: modelClassification.tier,
                reason: modelClassification.reason,
              },
            },
            null,
            2,
          ),
        );
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
      console.log(
        `Model: ${modelClassification.tier} — ${modelClassification.reason}`,
      );
    });
}
