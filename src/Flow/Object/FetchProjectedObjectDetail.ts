import { Log } from '../../Common/Log.js';
import { FetchObjectDetail } from './FetchObjectDetail.js';
import type { ObjectDetail } from './FetchObjectDetail.js';
import { ObjectProjectionRepository } from '../../Repository/GameObject/ObjectProjectionRepository.js';
import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import type { IObjectProjection } from '../../Domain/GameObject/Entity/Projection/IObjectProjection.js';
import type { ITemplateDisplayConfig } from '../../Domain/GameObject/Display/ITemplateDisplayConfig.js';
import type { IProjectionDisplayProfile } from '../../Domain/GameObject/Display/IProjectionDisplayProfile.js';
import type { IDisplayGroup } from '../../Domain/GameObject/Display/IDisplayGroup.js';
import type { IParameterDisplayConfig } from '../../Domain/GameObject/Display/IParameterDisplayConfig.js';
import { ResolveDefaultProjectionStyle } from '../../Domain/GameObject/Display/ProjectionStyleDefaults.js';
import { ResolveDiplomaticStatus } from '../Organization/Diplomacy/ResolveDiplomaticStatus.js';

const LOG_TAG = `Flow/Object/FetchProjectedObjectDetail`;

/**
 * @brief Result of a projection aware object detail fetch
 */
export interface ProjectedObjectDetail {
    detail: ObjectDetail;
    projection: IObjectProjection;
    resolvedDisplayConfig: ITemplateDisplayConfig | undefined;
    isDefaultProjection: boolean;
}

/**
 * @brief Fetches object detail through the lens of an organization projection
 *
 * Loads the raw ObjectDetail then replaces parameters_json with the projection known parameters
 * and resolves the full display config from the template projection display profile
 * When no explicit projection exists for the org and object pair a default empty projection is
 * synthesized that reveals the object existence but hides all parameters and actions
 *
 * @param objectUid string Object unique identifier
 * @param organizationUid string Viewing organization identifier
 * @param includeHistory boolean Whether to include parameter history
 * @returns ProjectedObjectDetail or null only when the object itself does not exist in the graph
 */
export async function FetchProjectedObjectDetail(
    objectUid: string,
    organizationUid: string,
    includeHistory: boolean = false,
): Promise<ProjectedObjectDetail | null> {
    const projectionRepository = new ObjectProjectionRepository();

    const projection = await projectionRepository.GetByOrganizationAndObject(
        organizationUid,
        objectUid,
    );

    const detail = await FetchObjectDetail(objectUid, includeHistory);
    if (!detail) {
        if (projection) {
            Log.warning(
                `Projection "${projection.uid}" exists but object "${objectUid}" not found in graph`,
                LOG_TAG,
            );
        }
        return null;
    }

    if (projection) {
        detail.properties.parameters_json = JSON.stringify(projection.knownParameters);
        detail.properties.name = projection.name;

        const resolvedDisplayConfig = await __ResolveProjectionDisplayConfig(
            projection.templateUid,
            projection.displayStyle,
        );

        return {
            detail,
            projection,
            resolvedDisplayConfig,
            isDefaultProjection: false,
        };
    }

    return await __BuildDefaultProjectedDetail(detail, objectUid, organizationUid);
}

/**
 * @brief Constructs a default projected view when no explicit projection exists for the organization
 *
 * The default projection reveals object existence and name but hides all parameters and actions
 * This enforces least privilege for organizations that have not been granted a real projection
 *
 * @param detail ObjectDetail The ground truth detail to restrict
 * @param objectUid string Object unique identifier
 * @param organizationUid string Viewing organization identifier
 * @returns ProjectedObjectDetail A restricted view with empty parameters
 */
async function __BuildDefaultProjectedDetail(
    detail: ObjectDetail,
    objectUid: string,
    organizationUid: string,
): Promise<ProjectedObjectDetail> {
    const templateUid = String(detail.properties.templateUid ?? ``);
    const objectOwnerUid = String(detail.properties.organizationUid ?? ``);
    const gameUid = String(detail.properties.gameUid ?? ``);

    let displayStyle = `UNKNOWN`;
    if (objectOwnerUid && gameUid) {
        displayStyle = await ResolveDiplomaticStatus(organizationUid, objectOwnerUid, gameUid);
    }

    detail.properties.parameters_json = JSON.stringify([]);
    delete detail.properties.actions_json;
    detail.parameterHistory = [];

    const syntheticProjection: IObjectProjection = {
        uid: `default_${organizationUid}_${objectUid}`,
        objectUid,
        templateUid,
        organizationUid,
        name: String(detail.properties.name ?? detail.uid),
        displayStyle,
        status: `ACTIVE`,
        autoSync: false,
        knownParameters: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };

    return {
        detail,
        projection: syntheticProjection,
        resolvedDisplayConfig: ResolveDefaultProjectionStyle(displayStyle),
        isDefaultProjection: true,
    };
}

/**
 * @brief Resolves a full display config from the template projection profiles
 * @param templateUid string Template identifier
 * @param displayStyle string Active display style name
 * @returns ITemplateDisplayConfig or undefined when no profile exists
 */
async function __ResolveProjectionDisplayConfig(
    templateUid: string,
    displayStyle: string,
): Promise<ITemplateDisplayConfig | undefined> {
    try {
        const templateRepository = new GameObjectTemplateRepository();
        const template = await templateRepository.GetByUid(templateUid);

        if (!template) {
            return ResolveDefaultProjectionStyle(displayStyle);
        }

        const configMap = template.projectionDisplayConfigs;
        if (!configMap || !configMap[displayStyle]) {
            return ResolveDefaultProjectionStyle(displayStyle);
        }

        const profile = configMap[displayStyle];
        const baseConfig = template.displayConfig;

        return __ResolveProfileToDisplayConfig(profile, baseConfig);
    } catch(error) {
        Log.warning(
            `Failed to resolve projection display config for template "${templateUid}": ${String(error)}`,
            LOG_TAG,
        );
        return ResolveDefaultProjectionStyle(displayStyle);
    }
}

/**
 * @brief Merges a projection display profile with the base config resolving linked groups
 * @param profile IProjectionDisplayProfile The projection profile to resolve
 * @param baseConfig ITemplateDisplayConfig or undefined The base template display config
 * @returns ITemplateDisplayConfig Fully resolved display config
 */
function __ResolveProfileToDisplayConfig(
    profile: IProjectionDisplayProfile,
    baseConfig: ITemplateDisplayConfig | undefined,
): ITemplateDisplayConfig {
    const resolvedGroups: IDisplayGroup[] = [];
    const resolvedParameterDisplay: IParameterDisplayConfig[] = [];

    const baseGroupMap = new Map<string, IDisplayGroup>();
    const baseParamsByGroup = new Map<string, IParameterDisplayConfig[]>();

    if (baseConfig) {
        for (const group of baseConfig.groups) {
            baseGroupMap.set(group.key, group);
        }
        for (const paramDisplay of baseConfig.parameterDisplay) {
            const groupKey = paramDisplay.group ?? `__ungrouped`;
            const existing = baseParamsByGroup.get(groupKey) ?? [];
            existing.push(paramDisplay);
            baseParamsByGroup.set(groupKey, existing);
        }
    }

    for (const entry of profile.groups) {
        if (entry.linked) {
            const baseGroup = baseGroupMap.get(entry.key);
            if (baseGroup) {
                resolvedGroups.push(baseGroup);
                const baseParams = baseParamsByGroup.get(entry.key) ?? [];
                resolvedParameterDisplay.push(...baseParams);
            }
        } else {
            resolvedGroups.push({
                key: entry.key,
                label: entry.label ?? entry.key,
                iconUrl: entry.iconUrl,
                sortOrder: entry.sortOrder ?? resolvedGroups.length,
            });
            if (entry.parameterDisplay) {
                resolvedParameterDisplay.push(...entry.parameterDisplay);
            }
        }
    }

    return {
        groups: resolvedGroups,
        parameterDisplay: resolvedParameterDisplay,
        charts: profile.charts ?? baseConfig?.charts,
        styleConfig: profile.styleConfig ?? baseConfig?.styleConfig,
    };
}
