/**
 * JSON schema types for uploadable game object templates.
 * This is the contract for the JSON files users upload to define object types.
 *
 * Example JSON:
 * {
 *   "name": "Factory",
 *   "description": "A production building that converts raw materials into finished goods.",
 *   "parameters": [
 *     { "key": "productionRate", "label": "Production Rate", "valueType": "number", "defaultValue": 10, "category": "production" },
 *     { "key": "workers", "label": "Workers", "valueType": "number", "defaultValue": 0, "category": "workforce" },
 *     { "key": "rawMaterials", "label": "Raw Materials", "valueType": "number", "defaultValue": 100, "category": "production" },
 *     { "key": "output", "label": "Finished Goods", "valueType": "number", "defaultValue": 0, "category": "production" },
 *     { "key": "operational", "label": "Is Operational", "valueType": "boolean", "defaultValue": true }
 *   ],
 *   "actions": [
 *     {
 *       "key": "produceGoods",
 *       "label": "Produce Goods",
 *       "trigger": "onTurnAdvance",
 *       "priority": 10,
 *       "expressions": [
 *         "output += productionRate",
 *         "rawMaterials -= productionRate * 2"
 *       ],
 *       "enabled": true
 *     }
 *   ]
 * }
 */

import type { ParameterValueType } from '../../Domain/GameObject/Entity/IParameterDefinition.js';
import type { ActionTrigger } from '../../Domain/GameObject/Action/IActionDefinition.js';
import type { ICardStyleConfig } from '../../Domain/GameObject/Display/ICardStyleConfig.js';
import type { ParameterGraphType } from '../../Domain/GameObject/Display/IParameterDisplayConfig.js';

/**
 * Root schema for an uploaded template JSON.
 */
export interface TemplateJsonSchema {
    /** Object type name. @example 'Factory' */
    name: string;

    /** Description of the object type. @example 'A production building.' */
    description?: string;

    /** Array of parameter definitions. */
    parameters: TemplateParameterSchema[];

    /** Array of action definitions. */
    actions?: TemplateActionSchema[];

    /** Optional card display configuration controlling visual rendering. */
    displayConfig?: DisplayConfigSchema;

    /** Optional hierarchical tag paths using / as separator @example ['combat/melee', 'equipment/weapon'] */
    tags?: string[];
}

/**
 * Parameter definition within the uploaded JSON.
 */
export interface TemplateParameterSchema {
    /** Unique key, used by expressions. Must be a valid identifier (alphanumeric + underscore). @example 'productionRate' */
    key: string;

    /** Display label. @example 'Production Rate' */
    label: string;

    /** Value type controlling validation. @example 'number' */
    valueType: ParameterValueType;

    /** Default value on instance creation. @example 10 */
    defaultValue: string | number | boolean;

    /** Optional group/category for display. @example 'production' */
    category?: string;

    /** Optional description. @example 'Units per turn.' */
    description?: string;
}

/**
 * Action definition within the uploaded JSON.
 */
export interface TemplateActionSchema {
    /** Unique action key. @example 'produceGoods' */
    key: string;

    /** Display label. @example 'Produce Goods' */
    label: string;

    /** Event trigger. @example 'onTurnAdvance' */
    trigger: ActionTrigger;

    /** Execution priority (lower = earlier). @example 10 */
    priority?: number;

    /** Ordered expression list. @example ['output += productionRate'] */
    expressions: string[];

    /** Description. @example 'Converts raw materials.' */
    description?: string;

    /** Whether the action is active. Defaults to true. @example true */
    enabled?: boolean;
}

/**
 * Display group definition within the uploaded JSON.
 */
export interface DisplayGroupSchema {
    /** Group key matching parameter category. @example 'production' */
    key: string;

    /** Section title displayed on the card. @example 'Production' */
    label: string;

    /** Optional section header icon URL. @example 'https://example.com/icon.png' */
    iconUrl?: string;

    /** Vertical ordering (lower = higher). @example 0 */
    sortOrder: number;
}

/**
 * Per-parameter display override within the uploaded JSON.
 */
export interface ParameterDisplaySchema {
    /** Parameter key this config applies to. @example 'productionRate' */
    key: string;

    /** Display group this parameter belongs to. @example 'production' */
    group?: string;

    /** Graph visualization type. @example 'sparkline' */
    graphType: ParameterGraphType;

    /** Whether to exclude from card rendering. @example false */
    hidden: boolean;

    /** Sort priority within group (lower = higher). @example 0 */
    displayOrder: number;
}

/**
 * Card display configuration within the uploaded JSON.
 */
export interface DisplayConfigSchema {
    /** Optional visual style overrides. */
    styleConfig?: ICardStyleConfig;

    /** Display group definitions for card sections. */
    groups: DisplayGroupSchema[];

    /** Per-parameter rendering overrides. */
    parameterDisplay: ParameterDisplaySchema[];
}
