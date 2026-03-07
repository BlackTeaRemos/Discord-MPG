import { DiplomacyRepository } from '../../../Repository/Organization/DiplomacyRepository.js';
import type { DiplomaticStatus } from '../../../Domain/Organization/DiplomaticStatus.js';
import type { ProjectionDisplayStyle } from '../../../Domain/GameObject/Entity/Projection/ProjectionDisplayStyle.js';

/**
 * @brief Resolve the diplomatic status between two organizations within a game
 *
 * Returns OWNER when source and target are the same organization and
 * reads the relationship from the graph when they differ and
 * defaults to UNKNOWN if no explicit relationship exists
 *
 * @param sourceOrganizationUid string The viewing organization
 * @param targetOrganizationUid string The organization that owns the object
 * @param gameUid string Game scope
 * @return Promise_ProjectionDisplayStyle The display style derived from diplomatic stance
 */
export async function ResolveDiplomaticStatus(
    sourceOrganizationUid: string,
    targetOrganizationUid: string,
    gameUid: string,
): Promise<ProjectionDisplayStyle> {
    if (sourceOrganizationUid === targetOrganizationUid) {
        return `OWNER`;
    }

    const diplomacyRepository = new DiplomacyRepository();
    const relation = await diplomacyRepository.GetRelation(
        sourceOrganizationUid,
        targetOrganizationUid,
        gameUid,
    );

    if (!relation) {
        return `UNKNOWN`;
    }

    return __MapDiplomaticStatusToDisplayStyle(relation.status);
}

function __MapDiplomaticStatusToDisplayStyle(status: DiplomaticStatus): ProjectionDisplayStyle {
    switch (status) {
        case `ALLIED`:
            return `ALLIED`;
        case `HOSTILE`:
            return `HOSTILE`;
        case `NEUTRAL`:
            return `NEUTRAL`;
        case `UNKNOWN`:
            return `UNKNOWN`;
        default:
            return `UNKNOWN`;
    }
}
