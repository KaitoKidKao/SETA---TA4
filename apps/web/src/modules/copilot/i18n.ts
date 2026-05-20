export const COPILOT_COPY = {
  threadsTitle: 'Chat',
  newThread: 'New thread',
  searchThreads: 'Search threads…',
  emptyThreads: {
    title: 'Start a conversation',
    body: 'Ask Supervisor anything — read tools run instantly, writes pause for your approval.',
  },
  composerPlaceholder: 'Ask Supervisor anything…',
  composerHint: 'Will ask for approval before any writes',
  modelUnavailable: 'Set COPILOT_MODEL + key in .env to enable the assistant.',
  rateLimited: (s: number) => `You hit your per-minute limit — retry in ${s}s`,
  hitlExpired: 'This request expired. Ask Supervisor to try again.',
  permissionRevoked: 'Your role no longer permits this — the change was not applied.',
} as const;
