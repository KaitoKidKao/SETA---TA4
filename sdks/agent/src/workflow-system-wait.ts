import { z } from 'zod';

export const WorkflowSystemWaitPayloadSchema = z.object({
  kind: z.literal('system_wait'),
  reason: z.string().min(1),
  aggregateId: z.string().min(1),
  stage: z.string().min(1),
});

export type WorkflowSystemWaitPayload = z.infer<typeof WorkflowSystemWaitPayloadSchema>;

export function isWorkflowSystemWaitPayload(value: unknown): value is WorkflowSystemWaitPayload {
  return WorkflowSystemWaitPayloadSchema.safeParse(value).success;
}
