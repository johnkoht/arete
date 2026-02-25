/**
 * arete route <query> — route to skill + model tier suggestion
 */
import { createServices } from '@arete/core';
import chalk from 'chalk';
import { toolsToCandidates } from '../lib/tool-candidates.js';
const NO_MATCH_SUGGESTION = 'No skill match. Check CLI commands in AGENTS.md, or read .cursor/rules/pm-workspace.mdc for guidance.';
export function registerRouteCommand(program) {
    program
        .command('route <query>')
        .description('Route query to skill and suggest model tier')
        .option('--json', 'Output as JSON')
        .action(async (query, opts) => {
        const services = await createServices(process.cwd());
        const root = await services.workspace.findRoot();
        const { classifyTask } = await import('@arete/core');
        let skillRoute = null;
        if (root) {
            const skills = await services.skills.list(root);
            const candidates = skills.map((s) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                path: s.path,
                triggers: s.triggers,
                type: 'skill',
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
            const result = {
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
            };
            // Add suggestion when no skill match
            if (!skillRoute) {
                result.suggestion = NO_MATCH_SUGGESTION;
            }
            console.log(JSON.stringify(result, null, 2));
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
        }
        else {
            console.log('Skill/Tool: (no match)');
            console.log(`\n${chalk.yellow('💡')} ${NO_MATCH_SUGGESTION}`);
        }
        console.log(`Model: ${modelClassification.tier} — ${modelClassification.reason}`);
    });
}
//# sourceMappingURL=route.js.map