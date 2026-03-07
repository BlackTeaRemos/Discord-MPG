import type { IParameterDefinition } from './IParameterDefinition.js';
import type { IActionDefinition } from '../Action/IActionDefinition.js';
import type { ITemplateDisplayConfig } from '../Display/ITemplateDisplayConfig.js';
import type { ProjectionDisplayConfigMap } from './Projection/ProjectionStyleMap.js';
import type { TagPath } from '../../Tag/index.js';

export interface IGameObjectTemplate {
    uid: string;

    gameUid: string;

    name: string;

    description: string;

    parameters: IParameterDefinition[];

    actions: IActionDefinition[];

    displayConfig?: ITemplateDisplayConfig;

    projectionDisplayConfigs?: ProjectionDisplayConfigMap;

    tags: TagPath[];

    createdAt: string;

    updatedAt: string;
}
