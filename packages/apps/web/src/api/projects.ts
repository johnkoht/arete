/**
 * Projects API client
 */

import { BASE_URL } from './client.js';

export type ProjectSummary = {
  slug: string;
  name: string;
  lastModified: string;
  status: string;
  description: string;
};

export type ProjectsResponse = {
  projects: ProjectSummary[];
};

export async function fetchProjects(): Promise<ProjectSummary[]> {
  const res = await fetch(`${BASE_URL}/api/projects`);
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: ${res.status}`);
  }
  const data = (await res.json()) as ProjectsResponse;
  return data.projects;
}
