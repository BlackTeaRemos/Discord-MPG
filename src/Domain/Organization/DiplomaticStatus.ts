/**
 * @brief Diplomatic relationship status between two organizations within a game
 *
 * OWNER is resolved implicitly when viewing org equals object org
 * The remaining values are stored as Neo4j relationships
 */
export type DiplomaticStatus = 'ALLIED' | 'HOSTILE' | 'NEUTRAL' | 'UNKNOWN';

export const DIPLOMATIC_STATUSES: readonly DiplomaticStatus[] = [
    `ALLIED`,
    `HOSTILE`,
    `NEUTRAL`,
    `UNKNOWN`,
] as const;
