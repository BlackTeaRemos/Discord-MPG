import { Log } from '../../Common/Log.js';
import { ObjectProjectionRepository } from '../../Repository/GameObject/ObjectProjectionRepository.js';
import { ProjectionSnapshotRepository } from '../../Repository/GameObject/ProjectionSnapshotRepository.js';
import type { IObjectProjection } from '../../Domain/GameObject/Entity/Projection/IObjectProjection.js';
import type { IProjectedParameter } from '../../Domain/GameObject/Entity/Projection/IProjectedParameter.js';
import type { ProjectionDisplayStyle } from '../../Domain/GameObject/Entity/Projection/ProjectionDisplayStyle.js';
import type { IParameterValue } from '../../Domain/GameObject/Entity/IParameterValue.js';
import type { IActionExecutionResult } from '../../Domain/GameObject/Action/IActionExecutionResult.js';

const LOG_TAG = `Flow/GameObject/ProjectionService`;

/**
 * @brief Converts raw parameter values into projected parameters with GROUND_TRUTH source at the given turn
 * @param parameters IParameterValue_array Ground truth parameter values
 * @param turn number Game turn when observation occurred
 * @returns IProjectedParameter_array Projected parameters ready for persistence
 */
function __ToGroundTruthProjectedParameters(
    parameters: IParameterValue[],
    turn: number,
): IProjectedParameter[] {
    return parameters.map(parameter => {
        return {
            key: parameter.key,
            value: parameter.value,
            source: `GROUND_TRUTH` as const,
            lastConfirmedTurn: turn,
            isStale: false,
        };
    });
}

/**
 * @brief Creates the owner projection for a newly created game object mirroring all parameters as ground truth
 * @param objectUid string Game object identifier
 * @param templateUid string Template identifier
 * @param organizationUid string Owning organization identifier
 * @param name string Object display name
 * @param parameters IParameterValue_array Full parameters from the created object
 * @param currentTurn number Current game turn defaulting to 0 for initial creation
 * @returns IObjectProjection The persisted owner projection
 */
export async function CreateOwnerProjection(
    objectUid: string,
    templateUid: string,
    organizationUid: string,
    name: string,
    parameters: IParameterValue[],
    currentTurn: number = 0,
): Promise<IObjectProjection> {
    const projectionRepository = new ObjectProjectionRepository();

    const knownParameters = __ToGroundTruthProjectedParameters(parameters, currentTurn);

    const projection = await projectionRepository.Create({
        objectUid,
        templateUid,
        organizationUid,
        name,
        displayStyle: `OWNER`,
        autoSync: true,
        knownParameters,
    });

    Log.info(
        `Owner projection "${projection.uid}" created for object "${objectUid}" org "${organizationUid}"`,
        LOG_TAG,
    );

    return projection;
}

/**
 * @brief Creates a foreign projection when an organization encounters a game object not owned by them
 * @param objectUid string Game object identifier
 * @param templateUid string Template identifier
 * @param organizationUid string Foreign organization identifier
 * @param name string Display name the foreign org assigns to this object
 * @param displayStyle ProjectionDisplayStyle Visual classification for card rendering
 * @param revealedParameters IParameterValue_array Subset of parameters revealed to the foreign org or empty if only existence is known
 * @param currentTurn number Game turn when encounter occurs
 * @returns IObjectProjection The persisted foreign projection
 */
export async function CreateForeignProjection(
    objectUid: string,
    templateUid: string,
    organizationUid: string,
    name: string,
    displayStyle: ProjectionDisplayStyle,
    revealedParameters: IParameterValue[],
    currentTurn: number,
): Promise<IObjectProjection> {
    const projectionRepository = new ObjectProjectionRepository();

    const knownParameters = __ToGroundTruthProjectedParameters(revealedParameters, currentTurn);

    const projection = await projectionRepository.Create({
        objectUid,
        templateUid,
        organizationUid,
        name,
        displayStyle,
        autoSync: false,
        knownParameters,
    });

    Log.info(
        `Foreign projection "${projection.uid}" created for object "${objectUid}" org "${organizationUid}" style "${displayStyle}"`,
        LOG_TAG,
    );

    return projection;
}

/**
 * @brief Synchronizes all auto synced projections after turn engine mutations and captures projection snapshots
 * @param actionResults IActionExecutionResult_array Results from turn engine containing updated parameter states
 * @param turn number The current game turn after advancement
 */
export async function SyncProjectionsAfterTurn(
    actionResults: IActionExecutionResult[],
    turn: number,
): Promise<void> {
    try {
        const latestByObject = new Map<string, IActionExecutionResult>();
        for (const result of actionResults) {
            if (result.success && result.updatedParameters) {
                latestByObject.set(result.objectUid, result);
            }
        }

        if (latestByObject.size === 0) {
            return;
        }

        const projectionRepository = new ObjectProjectionRepository();
        const snapshotRepository = new ProjectionSnapshotRepository();

        const parameterUpdates: Array<{
            projectionUid: string;
            knownParameters: IProjectedParameter[];
        }> = [];

        const snapshotEntries: Array<{
            projectionUid: string;
            turn: number;
            parameters: IProjectedParameter[];
        }> = [];

        for (const [objectUid, result] of latestByObject) {
            const projections = await projectionRepository.ListByObject(objectUid, {
                status: `ACTIVE`,
            });

            for (const projection of projections) {
                if (projection.autoSync) {
                    const syncedParameters = __ToGroundTruthProjectedParameters(
                        result.updatedParameters,
                        turn,
                    );

                    parameterUpdates.push({
                        projectionUid: projection.uid,
                        knownParameters: syncedParameters,
                    });

                    snapshotEntries.push({
                        projectionUid: projection.uid,
                        turn,
                        parameters: syncedParameters,
                    });
                } else {
                    const alreadyStale = projection.knownParameters.every(parameter => {
                        return parameter.isStale;
                    });

                    if (!alreadyStale) {
                        const staledParameters = projection.knownParameters.map(parameter => {
                            return {
                                ...parameter,
                                isStale: true,
                            };
                        });

                        parameterUpdates.push({
                            projectionUid: projection.uid,
                            knownParameters: staledParameters,
                        });
                    }
                }
            }
        }

        if (parameterUpdates.length > 0) {
            await projectionRepository.BatchUpdateKnownParameters(parameterUpdates);
        }

        if (snapshotEntries.length > 0) {
            await snapshotRepository.CaptureSnapshotBatch(snapshotEntries);
        }

        Log.info(
            `Projection sync complete: ${parameterUpdates.length} projections updated at turn ${turn}`,
            LOG_TAG,
        );
    } catch(error) {
        Log.error(`Projection sync failed: ${String(error)}`, LOG_TAG, `SyncProjectionsAfterTurn`);
    }
}
