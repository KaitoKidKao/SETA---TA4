/**
 * ATS Connector - Workday Integration (Phase 3)
 *
 * Handles synchronization of candidates and job requisitions from
 * Workday ATS via webhook events and REST API.
 *
 * Supported events:
 * - candidate.created: New candidate/application received in Workday
 * - requisition.published: New JD/Job Requisition published in Workday
 */

// rbac: system-only

import type { SessionScope } from '@seta/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AtsConnectorConfig {
  /** Workday REST API base URL, e.g. https://wd3-impl-services1.workday.com/ccx/api/v1/{tenant} */
  apiBaseUrl: string;
  /** OAuth2 client ID for Workday Integrations */
  clientId: string;
  /** OAuth2 client secret */
  clientSecret: string;
  /** OAuth2 refresh token (if using refresh-token grant) */
  refreshToken?: string;
  /** Shared secret used to verify inbound webhook signatures */
  webhookSecret: string;
  /** Seta tenant ID this ATS config belongs to */
  tenantId: string;
}

export interface AtsCandidate {
  externalCandidateId: string;
  displayName: string;
  email: string;
  phone?: string;
  cvUrl?: string;
  cvText?: string;
  appliedPosition?: string;
  source?: string;
  receivedDate?: string;
}

export interface AtsRequisition {
  externalRequisitionId: string;
  jobTitle: string;
  jdText: string;
  mustHaveSkills?: string[];
  niceToHaveSkills?: string[];
  minYoe?: number;
  maxYoe?: number;
  englishLevelRequired?: string;
  domainPreferred?: string;
  workMode?: string;
  employmentType?: string;
}

export type AtsWebhookEventType =
  | 'candidate.created'
  | 'candidate.updated'
  | 'requisition.published'
  | 'requisition.updated';

export interface AtsWebhookPayload {
  eventType: AtsWebhookEventType;
  eventId: string;
  timestamp: string;
  data: AtsCandidate | AtsRequisition;
}

export interface AtsConnectorDeps {
  /** Insert candidate record into smartrecruit DB */
  upsertCandidate: (
    tenantId: string,
    candidate: AtsCandidate,
    session: SessionScope,
  ) => Promise<{ id: string }>;
  /** Upsert criteria (JD) record into smartrecruit DB */
  upsertCriteria: (
    tenantId: string,
    requisition: AtsRequisition,
    session: SessionScope,
  ) => Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Token management (Workday OAuth2 Client Credentials)
// ---------------------------------------------------------------------------

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCacheMap = new Map<string, TokenCache>();

async function getAccessToken(config: AtsConnectorConfig): Promise<string> {
  const cacheKey = `${config.tenantId}:${config.clientId}`;
  const cached = tokenCacheMap.get(cacheKey);

  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.accessToken;
  }

  // In production, this would call Workday's OAuth token endpoint.
  // For now, we use a stub that simulates token acquisition.
  const tokenResponse = await fetchWorkdayToken(config);

  tokenCacheMap.set(cacheKey, {
    accessToken: tokenResponse.accessToken,
    expiresAt: Date.now() + tokenResponse.expiresIn * 1000,
  });

  return tokenResponse.accessToken;
}

async function fetchWorkdayToken(config: AtsConnectorConfig): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  // Production implementation would POST to:
  // `${config.apiBaseUrl}/oauth2/${tenantName}/token`
  //
  // For now, return a stub token for development/testing.
  console.info(`[ATS Connector] Acquiring OAuth2 token for tenant ${config.tenantId}`);

  if (!config.clientId || !config.clientSecret) {
    throw new AtsConnectorError(
      'ATS_AUTH_FAILED',
      'Missing clientId or clientSecret for Workday OAuth2',
    );
  }

  // Stub: In real implementation, use fetch() to call Workday's token endpoint
  return {
    accessToken: `wd_stub_${config.tenantId}_${Date.now()}`,
    expiresIn: 3600,
  };
}

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  // HMAC-SHA256 verification of inbound webhook
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const msgData = encoder.encode(payload);

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBytes = await crypto.subtle.sign('HMAC', key, msgData);
    const computedHex = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return computedHex === signature.toLowerCase();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Webhook handler
// ---------------------------------------------------------------------------

export async function handleAtsWebhook(
  payload: AtsWebhookPayload,
  config: AtsConnectorConfig,
  deps: AtsConnectorDeps,
  session: SessionScope,
): Promise<{ processed: boolean; entityId?: string; error?: string }> {
  try {
    switch (payload.eventType) {
      case 'candidate.created':
      case 'candidate.updated': {
        const candidate = payload.data as AtsCandidate;
        const result = await deps.upsertCandidate(config.tenantId, candidate, session);
        console.info(
          `[ATS Connector] Processed ${payload.eventType}: candidate ${result.id} (${candidate.displayName})`,
        );
        return { processed: true, entityId: result.id };
      }

      case 'requisition.published':
      case 'requisition.updated': {
        const requisition = payload.data as AtsRequisition;
        const result = await deps.upsertCriteria(config.tenantId, requisition, session);
        console.info(
          `[ATS Connector] Processed ${payload.eventType}: criteria ${result.id} (${requisition.jobTitle})`,
        );
        return { processed: true, entityId: result.id };
      }

      default:
        console.warn(`[ATS Connector] Unknown event type: ${payload.eventType}`);
        return { processed: false, error: `Unknown event type: ${payload.eventType}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ATS Connector] Failed to process webhook ${payload.eventId}:`, message);
    return { processed: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// API Client: Pull candidates/requisitions from Workday REST API
// ---------------------------------------------------------------------------

export async function pullCandidatesFromAts(
  config: AtsConnectorConfig,
  options?: { limit?: number; offset?: number; since?: Date },
): Promise<AtsCandidate[]> {
  const token = await getAccessToken(config);

  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', String(options.limit));
  if (options?.offset) params.set('offset', String(options.offset));
  if (options?.since) params.set('since', options.since.toISOString());

  // Production: GET `${config.apiBaseUrl}/recruiting/v1/candidates?${params}`
  console.info(`[ATS Connector] Pulling candidates from Workday (token: ${token.slice(0, 12)}...)`);

  // Stub response for development
  return [];
}

export async function pullRequisitionsFromAts(
  config: AtsConnectorConfig,
  _options?: { limit?: number; status?: string },
): Promise<AtsRequisition[]> {
  const token = await getAccessToken(config);

  console.info(
    `[ATS Connector] Pulling requisitions from Workday (token: ${token.slice(0, 12)}...)`,
  );

  // Stub response for development
  return [];
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AtsConnectorError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AtsConnectorError';
  }
}
