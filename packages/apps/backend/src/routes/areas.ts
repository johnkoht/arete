/**
 * Areas routes — /api/areas endpoints.
 *
 * Uses AreaParserService from @arete/core to read areas from workspace.
 */

import { Hono } from 'hono';
import { createServices } from '@arete/core';

export type AreaSummary = {
  slug: string;
  name: string;
};

export function createAreasRouter(workspaceRoot: string): Hono {
  const app = new Hono();

  // GET /api/areas — list all areas with slug and name
  app.get('/', async (c) => {
    try {
      const services = await createServices(workspaceRoot);
      const areaContexts = await services.areaParser.listAreas();

      const areas: AreaSummary[] = areaContexts.map((ctx) => ({
        slug: ctx.slug,
        name: ctx.name,
      }));

      // Sort alphabetically by name
      areas.sort((a, b) => a.name.localeCompare(b.name));

      return c.json({ areas });
    } catch {
      // If areas directory doesn't exist or any error, return empty list
      return c.json({ areas: [] });
    }
  });

  return app;
}
