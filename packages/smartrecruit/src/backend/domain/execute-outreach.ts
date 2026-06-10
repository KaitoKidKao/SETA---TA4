import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { parseMailerEnv, resolveTransport } from '@seta/shared-mailer';
import { and, eq } from 'drizzle-orm';
import { requirePermission, SMARTRECRUIT_OUTREACH_APPROVE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, outreachDrafts } from '../db/schema.ts';

export interface ExecuteOutreachInput {
  draftId: string;
  session: SessionScope;
}

export interface ExecuteOutreachOutput {
  id: string;
  candidateId: string;
  status: string;
  sentAt: string;
}

export async function executeOutreach(input: ExecuteOutreachInput): Promise<ExecuteOutreachOutput> {
  requirePermission(input.session, SMARTRECRUIT_OUTREACH_APPROVE);

  const db = smartrecruitDb();

  // 1. Load the draft
  const [draft] = await db
    .select()
    .from(outreachDrafts)
    .where(
      and(
        eq(outreachDrafts.id, input.draftId),
        eq(outreachDrafts.tenant_id, input.session.tenant_id),
      ),
    )
    .limit(1);

  if (!draft) {
    throw new Error(`Outreach draft with ID ${input.draftId} not found.`);
  }

  if (draft.status === 'sent') {
    throw new Error('This outreach draft has already been sent.');
  }

  // 2. Load the candidate
  const [cand] = await db
    .select()
    .from(candidates)
    .where(
      and(eq(candidates.id, draft.candidate_id), eq(candidates.tenant_id, input.session.tenant_id)),
    )
    .limit(1);

  if (!cand) {
    throw new Error(`Candidate with ID ${draft.candidate_id} not found.`);
  }

  // 3. Resolve transport and send email
  const env = parseMailerEnv(process.env);
  const resolved = await resolveTransport(input.session.tenant_id, {
    env,
    configStore: { findEnabled: async () => null },
    lookupEntraTenantId: async () => null,
    crypto: { decrypt: async () => '' },
  });

  await resolved.transport.send({
    from: resolved.sender,
    fromDisplayName: resolved.senderDisplayName,
    to: cand.email,
    subject: draft.subject,
    text: draft.body,
    html: draft.body.replace(/\n/g, '<br>'),
  });

  const sentAt = new Date();

  // 4. Update draft and candidate status
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      await tx
        .update(outreachDrafts)
        .set({
          status: 'sent',
          sent_at: sentAt,
        })
        .where(eq(outreachDrafts.id, draft.id));

      await tx
        .update(candidates)
        .set({
          status: 'outreached',
        })
        .where(eq(candidates.id, cand.id));
    },
  );

  return {
    id: draft.id,
    candidateId: cand.id,
    status: 'sent',
    sentAt: sentAt.toISOString(),
  };
}
