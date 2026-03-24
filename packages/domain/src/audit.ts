import type { ActorType } from './types';

export type JsonLike = string | number | boolean | null | JsonLike[] | { [key: string]: JsonLike };

export type AuditEventInput = {
  entityType: string;
  entityId: string;
  eventType: string;
  actorType: ActorType;
  actorLabel: string;
  beforeState?: JsonLike;
  afterState?: JsonLike;
  payloadJson?: JsonLike;
};

export function makeAuditEvent(input: AuditEventInput) {
  return {
    entityType: input.entityType,
    entityId: input.entityId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorLabel: input.actorLabel,
    beforeState: input.beforeState ?? undefined,
    afterState: input.afterState ?? undefined,
    payloadJson: input.payloadJson ?? undefined,
  };
}
