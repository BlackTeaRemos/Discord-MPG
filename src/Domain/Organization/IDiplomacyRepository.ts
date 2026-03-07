import type { IDiplomaticRelation } from './IDiplomaticRelation.js';
import type { DiplomaticStatus } from './DiplomaticStatus.js';

/**
 * @brief Repository contract for directional diplomatic relationships between organizations
 */
export interface IDiplomacyRepository {
    /**
     * @brief Set a directional diplomatic relationship between two organizations within a game
     * @param sourceOrganizationUid string Organization holding this view @example 'org_abc'
     * @param targetOrganizationUid string Organization being viewed @example 'org_def'
     * @param gameUid string Game scope @example 'game_xyz'
     * @param status DiplomaticStatus Diplomatic stance @example 'ALLIED'
     * @return Promise_IDiplomaticRelation The persisted or updated relation
     */
    SetRelation(
        sourceOrganizationUid: string,
        targetOrganizationUid: string,
        gameUid: string,
        status: DiplomaticStatus,
    ): Promise<IDiplomaticRelation>;

    /**
     * @brief Retrieve the directional relation from source to target within a game
     * @param sourceOrganizationUid string Origin organization @example 'org_abc'
     * @param targetOrganizationUid string Target organization @example 'org_def'
     * @param gameUid string Game scope @example 'game_xyz'
     * @return Promise_IDiplomaticRelation_or_null Relation or null if none exists
     */
    GetRelation(
        sourceOrganizationUid: string,
        targetOrganizationUid: string,
        gameUid: string,
    ): Promise<IDiplomaticRelation | null>;

    /**
     * @brief List all outgoing diplomatic relations for an organization within a game
     * @param sourceOrganizationUid string Organization whose view to list @example 'org_abc'
     * @param gameUid string Game scope @example 'game_xyz'
     * @return Promise_IDiplomaticRelation_array All outgoing relations
     */
    ListRelationsFromOrganization(
        sourceOrganizationUid: string,
        gameUid: string,
    ): Promise<IDiplomaticRelation[]>;

    /**
     * @brief Delete a directional diplomatic relationship
     * @param sourceOrganizationUid string Origin organization @example 'org_abc'
     * @param targetOrganizationUid string Target organization @example 'org_def'
     * @param gameUid string Game scope @example 'game_xyz'
     * @return Promise_boolean True if a relation was deleted and false if none existed
     */
    DeleteRelation(
        sourceOrganizationUid: string,
        targetOrganizationUid: string,
        gameUid: string,
    ): Promise<boolean>;
}
