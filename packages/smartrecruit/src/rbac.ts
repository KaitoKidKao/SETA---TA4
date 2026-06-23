import type { SessionScope } from '@seta/core';
import { hasPermission } from '@seta/shared-rbac';

export const SMARTRECRUIT_ACCESS = 'smartrecruit.access' as const;
export const SMARTRECRUIT_WRITE = 'smartrecruit.write' as const;
export const SMARTRECRUIT_OUTREACH_APPROVE = 'smartrecruit.outreach.approve' as const;
export const SMARTRECRUIT_HM_FEEDBACK_APPROVE = 'smartrecruit.hm_feedback.approve' as const;

export const SMARTRECRUIT_PERMISSIONS = {
  [SMARTRECRUIT_ACCESS]: 'Access recruitment dashboard',
  [SMARTRECRUIT_WRITE]: 'Modify candidates and criteria',
  [SMARTRECRUIT_OUTREACH_APPROVE]: 'Approve and send outreach emails',
  [SMARTRECRUIT_HM_FEEDBACK_APPROVE]: 'Approve Hiring Manager feedback reminders',
} as const;

export type SmartrecruitPermission = keyof typeof SMARTRECRUIT_PERMISSIONS;

export const SMARTRECRUIT_ROLE_PERMISSIONS: Record<string, readonly SmartrecruitPermission[]> = {
  recruiter: [
    SMARTRECRUIT_ACCESS,
    SMARTRECRUIT_WRITE,
    SMARTRECRUIT_OUTREACH_APPROVE,
    SMARTRECRUIT_HM_FEEDBACK_APPROVE,
  ],
  hr: [
    SMARTRECRUIT_ACCESS,
    SMARTRECRUIT_WRITE,
    SMARTRECRUIT_OUTREACH_APPROVE,
    SMARTRECRUIT_HM_FEEDBACK_APPROVE,
  ],
  member: [SMARTRECRUIT_ACCESS],
};

export class SmartrecruitError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SmartrecruitError';
    this.code = code;
    this.details = details;
  }
}

export function requirePermission(session: SessionScope, permission: SmartrecruitPermission): void {
  // If org/tenant admin, they bypass specific role checks
  if (
    hasPermission(
      {
        roles: session.role_summary.roles,
        cross_tenant_read: session.role_summary.cross_tenant_read,
      },
      permission,
    )
  ) {
    return;
  }

  // org.viewer is cross-tenant read-only
  if (session.role_summary.cross_tenant_read && permission === SMARTRECRUIT_ACCESS) {
    return;
  }

  // Check recruiter/hr role
  const allowed = session.role_summary.roles.some((roleSlug) => {
    const rolePerms = SMARTRECRUIT_ROLE_PERMISSIONS[roleSlug];
    return rolePerms?.includes(permission);
  });

  if (!allowed) {
    throw new SmartrecruitError('FORBIDDEN', `Missing permission: ${permission}`, {
      permission,
    });
  }
}
