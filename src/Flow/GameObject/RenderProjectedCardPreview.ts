import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import { GameObjectRepository } from '../../Repository/GameObject/GameObjectRepository.js';
import { FetchObjectDetail } from '../Object/FetchObjectDetail.js';
import type { ITemplateDisplayConfig } from '../../Domain/GameObject/Display/ITemplateDisplayConfig.js';
import type { IProjectionDisplayProfile } from '../../Domain/GameObject/Display/IProjectionDisplayProfile.js';
import type { IDisplayGroup } from '../../Domain/GameObject/Display/IDisplayGroup.js';
import type { IParameterDisplayConfig } from '../../Domain/GameObject/Display/IParameterDisplayConfig.js';
import type { ObjectDetail } from '../Object/FetchObjectDetail.js';
import { RenderObjectCard } from '../../Framework/ImageGen/ObjectCardRenderer.js';
import { ResolveDefaultProjectionStyle } from '../../Domain/GameObject/Display/ProjectionStyleDefaults.js';
import { Log } from '../../Common/Log.js';

const LOG_TAG = `Flow/GameObject/RenderProjectedCardPreview`;

const _templateRepository = new GameObjectTemplateRepository();
const _objectRepository = new GameObjectRepository();

export async function RenderProjectedCardPreview(
    templateUid: string,
    displayStyle: string,
): Promise<Buffer | null> {
    try {
        const template = await _templateRepository.GetByUid(templateUid);
        if (!template) {
            return null;
        }

        const configMap = template.projectionDisplayConfigs;
        let resolvedConfig: ITemplateDisplayConfig;

        if (configMap && configMap[displayStyle]) {
            const profile = configMap[displayStyle];
            resolvedConfig = ResolveProfileToDisplayConfig(profile, template.displayConfig);
        } else {
            resolvedConfig = ResolveDefaultProjectionStyle(displayStyle) ?? { groups: [], parameterDisplay: [] };
        }

        let detail: ObjectDetail | null = null;
        try {
            const objects = await _objectRepository.ListByGame(template.gameUid);
            const matchingObject = objects.find(gameObject => {
                return gameObject.templateUid === templateUid;
            });
            if (matchingObject) {
                detail = await FetchObjectDetail(matchingObject.uid, true);
            }
        } catch {
            // Fall through to synthetic detail
        }

        if (!detail) {
            const syntheticProperties: Record<string, unknown> = {
                name: template.name,
                friendly_name: template.name,
                description: template.description,
            };

            const parametersJson = template.parameters.map(parameterDefinition => {
                return {
                    key: parameterDefinition.key,
                    value: parameterDefinition.defaultValue,
                };
            });
            syntheticProperties.parameters_json = JSON.stringify(parametersJson);

            if (template.actions.length > 0) {
                syntheticProperties.actions_json = JSON.stringify(template.actions);
            }

            detail = {
                uid: templateUid,
                labels: [`GameObjectTemplate`],
                properties: syntheticProperties,
                parameters: {},
                relationships: [],
                createdAt: null,
                updatedAt: null,
                parameterHistory: [],
            };
        }

        return await RenderObjectCard({
            detail,
            objectType: `projection`,
            description: template.description || null,
            typeLabel: `${template.name} [${displayStyle}]`,
            locale: `en`,
            displayConfig: resolvedConfig,
        });
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to render projected card preview: ${message}`, LOG_TAG, `RenderProjectedCardPreview`);
        return null;
    }
}

function ResolveProfileToDisplayConfig(
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
