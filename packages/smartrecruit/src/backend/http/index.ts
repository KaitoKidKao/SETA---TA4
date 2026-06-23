import type { RouteBuildDeps, SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { registerSmartrecruitRoutes } from './routes.ts';

export { registerSmartrecruitRoutes } from './routes.ts';

export function buildSmartrecruitRoutes(_deps: RouteBuildDeps): Hono<SessionEnv> {
  const app = new Hono<SessionEnv>();
  registerSmartrecruitRoutes(app, { workers: _deps.workers });
  return app;
}
