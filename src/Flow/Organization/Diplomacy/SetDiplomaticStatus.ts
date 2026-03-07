import { DiplomacyRepository } from '../../../Repository/Organization/DiplomacyRepository.js';
import { Log } from '../../../Common/Log.js';
import { neo4jClient } from '../../../Setup/Neo4j.js';
import type { DiplomaticStatus } from '../../../Domain/Organization/DiplomaticStatus.js';
import type { IDiplomaticRelation } from '../../../Domain/Organization/IDiplomaticRelation.js';

const LOG_TAG = `Flow/Organization/Diplomacy/SetDiplomaticStatus`;

/**
 * @brief Result of a diplomatic status change including batch sync details
 */
export interface SetDiplomaticStatusResult {
    relation: IDiplomaticRelation;
    projectionsUpdated: number;
}

/**
 * @brief Set the diplomatic stance one organization holds toward another and batch sync all affected projection display styles
 *
 * This is the primary entry point for changing diplomacy and it
 * persists the relationship then updates every projection that the
 * source organization holds on objects owned by the target organization
 * within the same game
 *
 * @param sourceOrganizationUid string The viewing organization @example 'org_abc'
 * @param targetOrganizationUid string The organization being evaluated @example 'org_def'
 * @param gameUid string Game scope @example 'game_xyz'
 * @param status DiplomaticStatus The new diplomatic stance @example 'HOSTILE'
 * @return Promise_SetDiplomaticStatusResult The persisted relation and count of synced projections
 */
export async function SetDiplomaticStatus(
    sourceOrganizationUid: string,
    targetOrganizationUid: string,
    gameUid: string,
    status: DiplomaticStatus,
): Promise<SetDiplomaticStatusResult> {
    const diplomacyRepository = new DiplomacyRepository();

    const relation = await diplomacyRepository.SetRelation(
        sourceOrganizationUid,
        targetOrganizationUid,
        gameUid,
        status,
    );

    Log.info(
        `Diplomatic status set from "${sourceOrganizationUid}" to "${targetOrganizationUid}" as "${status}" in game "${gameUid}"`,
        LOG_TAG,
    );

    const projectionsUpdated = await __BatchSyncProjectionDisplayStyles(
        sourceOrganizationUid,
        targetOrganizationUid,
        gameUid,
        status,
    );

    if (projectionsUpdated > 0) {
        Log.info(
            `Batch synced ${projectionsUpdated} projection display styles to "${status}"`,
            LOG_TAG,
        );
    }

    return { relation, projectionsUpdated };
}

/**
 * @brief Update displayStyle on all projections owned by source org that point at objects belonging to target org in the given game
 */
async function __BatchSyncProjectionDisplayStyles(
    sourceOrganizationUid: string,
    targetOrganizationUid: string,
    gameUid: string,
    newDisplayStyle: DiplomaticStatus,
): Promise<number> {
    const session = await neo4jClient.GetSession(`WRITE`);
    try {
        const now = new Date().toISOString();

        const query = `
            MATCH (proj:ObjectProjection {
                organizationUid: $sourceOrgUid,
                status: 'ACTIVE'
            })
            MATCH (obj:GameObject {
                uid: proj.objectUid,
                organizationUid: $targetOrgUid,
                gameUid: $gameUid
            })
            SET proj.displayStyle = $newDisplayStyle,
                proj.updatedAt = $now
            RETURN count(proj) AS updated
        `;

        const result = await session.run(query, {
            sourceOrgUid: sourceOrganizationUid,
            targetOrgUid: targetOrganizationUid,
            gameUid,
            newDisplayStyle,
            now,
        });

        const record = result.records[0];
        return record?.get(`updated`)?.toNumber?.() ?? 0;
    } catch(error) {
        Log.error(
            `Batch sync failed for "${sourceOrganizationUid}" -> "${targetOrganizationUid}": ${String(error)}`,
            LOG_TAG,
        );
        throw error;
    } finally {
        await session.close();
    }
}
