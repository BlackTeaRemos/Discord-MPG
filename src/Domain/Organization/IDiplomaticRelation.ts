import type { DiplomaticStatus } from './DiplomaticStatus.js';

/**
 * @brief Directional diplomatic relationship between two organizations within a game
 *
 * Relationships are directional so org A can view org B as ALLIED while org B views org A as
 * HOSTILE if desired Symmetric relationships require two records one in each direction
 */
export interface IDiplomaticRelation {
    /** UID of the organization that holds this view @example 'org_abc' */
    sourceOrganizationUid: string;

    /** UID of the organization being viewed @example 'org_def' */
    targetOrganizationUid: string;

    /** Game scope for the relationship @example 'game_xyz' */
    gameUid: string;

    /** How the source org views the target org */
    status: DiplomaticStatus;

    /** ISO timestamp of when this relation was established @example '2026-02-10T12:00:00.000Z' */
    createdAt: string;

    /** ISO timestamp of last change @example '2026-02-10T14:30:00.000Z' */
    updatedAt: string;
}
