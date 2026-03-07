import type { TemplateJsonSchema, TemplateParameterSchema, TemplateActionSchema, DisplayConfigSchema } from './TemplateJsonSchema.js';
import { ValidateDisplayConfig } from './ValidateDisplayConfig.js';

/** Valid identifier pattern for parameter keys and action keys */
const VALID_KEY_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Allowed value types for parameters */
const VALID_VALUE_TYPES = new Set([`number`, `string`, `boolean`]);

/** Allowed action triggers */
const VALID_TRIGGERS = new Set([`onTurnAdvance`, `onManual`, `onCreate`, `onDestroy`]);

/**
 * @brief Result of template validation
 */
export interface TemplateValidationResult {
    /** Whether the template passed all checks @example true */
    valid: boolean;

    /** List of human readable error messages that is empty when valid */
    errors: string[];
}

/**
 * @brief Validates an uploaded template JSON object
 * @param input unknown Raw parsed JSON to validate
 * @returns TemplateValidationResult Validation outcome with error details
 * @example
 * const result = ValidateTemplateJson(JSON.parse(rawJson));
 * if (!result.valid) { console.error(result.errors); }
 */
export function ValidateTemplateJson(input: unknown): TemplateValidationResult {
    const errors: string[] = [];

    if (typeof input !== `object` || input === null || Array.isArray(input)) {
        return { valid: false, errors: [`Template must be a JSON object.`] };
    }

    const template = input as Record<string, unknown>;

    __ValidateName(template, errors);
    const parameterKeys = __ValidateParameters(template, errors);
    __ValidateActions(template, parameterKeys, errors);
    __ValidateDisplayConfig(template, parameterKeys, errors);
    __ValidateTags(template, errors);

    return { valid: errors.length === 0, errors };
}

/**
 * @brief Validates the name field
 * @param template Record of string to unknown Template object
 * @param errors string array Accumulator for errors
 */
function __ValidateName(template: Record<string, unknown>, errors: string[]): void {
    if (typeof template.name !== `string` || template.name.trim().length === 0) {
        errors.push(`"name" is required and must be a non-empty string.`);
    }
}

/**
 * @brief Validates parameters array and collects valid keys for expression validation
 * @param template Record of string to unknown Template object
 * @param errors string array Accumulator for errors
 * @returns Set of string Set of valid parameter keys
 */
function __ValidateParameters(template: Record<string, unknown>, errors: string[]): Set<string> {
    const keys = new Set<string>();

    if (!Array.isArray(template.parameters)) {
        errors.push(`"parameters" is required and must be an array.`);
        return keys;
    }

    const parameters = template.parameters as unknown[];

    if (parameters.length === 0) {
        errors.push(`"parameters" must contain at least one parameter definition.`);
        return keys;
    }

    for (let parameterIndex = 0; parameterIndex < parameters.length; parameterIndex++) {
        const parameter = parameters[parameterIndex] as Record<string, unknown>;
        const prefix = `parameters[${parameterIndex}]`;

        if (typeof parameter !== `object` || parameter === null) {
            errors.push(`${prefix}: must be an object.`);
            continue;
        }

        if (typeof parameter.key !== `string` || !VALID_KEY_PATTERN.test(parameter.key)) {
            errors.push(`${prefix}.key: must be a valid identifier (letters, digits, underscore, starting with letter or underscore).`);
        } else if (keys.has(parameter.key)) {
            errors.push(`${prefix}.key: duplicate key "${parameter.key}".`);
        } else {
            keys.add(parameter.key);
        }

        if (typeof parameter.label !== `string` || parameter.label.trim().length === 0) {
            errors.push(`${prefix}.label: required non-empty string.`);
        }

        if (typeof parameter.valueType !== `string` || !VALID_VALUE_TYPES.has(parameter.valueType)) {
            errors.push(`${prefix}.valueType: must be one of "number", "string", "boolean".`);
        }

        if (parameter.defaultValue === undefined || parameter.defaultValue === null) {
            errors.push(`${prefix}.defaultValue: required.`);
        }
    }

    return keys;
}

/**
 * @brief Validates actions array and checks expression syntax against known parameter keys
 * @param template Record of string to unknown Template object
 * @param parameterKeys Set of string Valid parameter keys for expression validation
 * @param errors string array Accumulator for errors
 */
function __ValidateActions(template: Record<string, unknown>, parameterKeys: Set<string>, errors: string[]): void {
    if (template.actions === undefined || template.actions === null) {
        return; // actions are optional
    }

    if (!Array.isArray(template.actions)) {
        errors.push(`"actions" must be an array when provided.`);
        return;
    }

    const actionKeys = new Set<string>();
    const actions = template.actions as unknown[];

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
        const action = actions[actionIndex] as Record<string, unknown>;
        const prefix = `actions[${actionIndex}]`;

        if (typeof action !== `object` || action === null) {
            errors.push(`${prefix}: must be an object.`);
            continue;
        }

        if (typeof action.key !== `string` || !VALID_KEY_PATTERN.test(action.key)) {
            errors.push(`${prefix}.key: must be a valid identifier.`);
        } else if (actionKeys.has(action.key)) {
            errors.push(`${prefix}.key: duplicate action key "${action.key}".`);
        } else {
            actionKeys.add(action.key);
        }

        if (typeof action.label !== `string` || (action.label as string).trim().length === 0) {
            errors.push(`${prefix}.label: required non-empty string.`);
        }

        if (typeof action.trigger !== `string` || !VALID_TRIGGERS.has(action.trigger as string)) {
            errors.push(`${prefix}.trigger: must be one of "onTurnAdvance", "onManual", "onCreate", "onDestroy".`);
        }

        if (!Array.isArray(action.expressions) || (action.expressions as unknown[]).length === 0) {
            errors.push(`${prefix}.expressions: required non-empty array of expression strings.`);
        } else {
            const expressions = action.expressions as unknown[];
            for (let expressionIndex = 0; expressionIndex < expressions.length; expressionIndex++) {
                const expression = expressions[expressionIndex];
                if (typeof expression !== `string` || (expression as string).trim().length === 0) {
                    errors.push(`${prefix}.expressions[${expressionIndex}]: must be a non-empty string.`);
                }
            }
        }

    }
}

/**
 * @brief Casts a validated template JSON to the typed schema after ValidateTemplateJson returns valid
 * @param input unknown Validated JSON input
 * @returns TemplateJsonSchema Typed template object
 */
export function CastTemplateJson(input: unknown): TemplateJsonSchema {
    const raw = input as Record<string, unknown>;
    const parameters = (raw.parameters as TemplateParameterSchema[]).map(parameter => {
        return {
            key: parameter.key,
            label: parameter.label,
            valueType: parameter.valueType,
            defaultValue: parameter.defaultValue,
            category: parameter.category,
            description: parameter.description,
        };
    });

    const actions = Array.isArray(raw.actions)
        ? (raw.actions as TemplateActionSchema[]).map(action => {
            return {
                key: action.key,
                label: action.label,
                trigger: action.trigger,
                priority: action.priority ?? 100,
                expressions: action.expressions,
                description: action.description,
                enabled: action.enabled ?? true,
            };
        })
        : [];

    return {
        name: raw.name as string,
        description: (raw.description as string) ?? ``,
        parameters,
        actions,
        displayConfig: raw.displayConfig ? __CastDisplayConfig(raw.displayConfig) : undefined,
        tags: __CastTags(raw.tags),
    };
}

/**
 * @brief Validates the optional tags array
 * @param template Record of string to unknown Template object
 * @param errors string array Accumulator for errors
 */
function __ValidateTags(template: Record<string, unknown>, errors: string[]): void {
    if (template.tags === undefined || template.tags === null) {
        return;
    }

    if (!Array.isArray(template.tags)) {
        errors.push(`"tags" must be an array of strings when provided.`);
        return;
    }

    const tags = template.tags as unknown[];
    const seen = new Set<string>();

    for (let tagIndex = 0; tagIndex < tags.length; tagIndex++) {
        const tag = tags[tagIndex];
        const prefix = `tags[${tagIndex}]`;

        if (typeof tag !== `string` || (tag as string).trim().length === 0) {
            errors.push(`${prefix}: must be a non-empty string.`);
            continue;
        }

        const normalized = (tag as string).trim().toLowerCase();
        if (seen.has(normalized)) {
            errors.push(`${prefix}: duplicate tag "${tag}".`);
        } else {
            seen.add(normalized);
        }

        const segments = normalized.split(`/`).filter(segment => {
            return segment.length > 0;
        });

        if (segments.length === 0) {
            errors.push(`${prefix}: tag path produces no segments after parsing.`);
        }
    }
}

function __CastTags(rawTags: unknown): string[] {
    if (!Array.isArray(rawTags)) {
        return [];
    }

    return (rawTags as string[]).map(tag => {
        return tag.trim();
    }).filter(tag => {
        return tag.length > 0;
    });
}

/**
 * @brief Validates the optional displayConfig section of a template JSON
 * @param template Record of string to unknown Template object
 * @param parameterKeys Set of string Valid parameter keys from the parameters section
 * @param errors string array Accumulator for errors
 */
function __ValidateDisplayConfig(
    template: Record<string, unknown>,
    parameterKeys: Set<string>,
    errors: string[],
): void {
    if (template.displayConfig === undefined || template.displayConfig === null) {
        return; // displayConfig is optional
    }

    if (typeof template.displayConfig !== `object` || Array.isArray(template.displayConfig)) {
        errors.push(`"displayConfig" must be an object when provided.`);
        return;
    }

    const configErrors = ValidateDisplayConfig(template.displayConfig as any);
    for (const configError of configErrors) {
        errors.push(`displayConfig: ${configError}`);
    }

    // Cross reference parameterDisplay keys against declared parameters
    const config = template.displayConfig as Record<string, unknown>;
    if (Array.isArray(config.parameterDisplay)) {
        for (const entry of config.parameterDisplay as Array<Record<string, unknown>>) {
            if (typeof entry.key === `string` && !parameterKeys.has(entry.key)) {
                errors.push(`displayConfig.parameterDisplay: key "${entry.key}" does not match any declared parameter.`);
            }
        }
    }

    // Cross reference group keys against parameter categories
    if (Array.isArray(config.groups)) {
        const groupKeys = new Set((config.groups as Array<Record<string, unknown>>).map(group => {
            return group.key as string;
        }));
        if (Array.isArray(config.parameterDisplay)) {
            for (const entry of config.parameterDisplay as Array<Record<string, unknown>>) {
                if (typeof entry.group === `string` && !groupKeys.has(entry.group)) {
                    errors.push(`displayConfig.parameterDisplay: group "${entry.group}" on key "${entry.key}" does not match any declared group.`);
                }
            }
        }
    }
}

/**
 * @brief Casts a validated displayConfig object to the typed schema
 * @param raw unknown Validated displayConfig object
 * @returns DisplayConfigSchema Typed display config
 */
function __CastDisplayConfig(raw: unknown): DisplayConfigSchema {
    const config = raw as Record<string, unknown>;
    return {
        styleConfig: config.styleConfig ? config.styleConfig as DisplayConfigSchema[`styleConfig`] : undefined,
        groups: Array.isArray(config.groups)
            ? (config.groups as Array<Record<string, unknown>>).map(group => {
                return {
                    key: group.key as string,
                    label: group.label as string,
                    iconUrl: group.iconUrl as string | undefined,
                    sortOrder: group.sortOrder as number,
                };
            })
            : [],
        parameterDisplay: Array.isArray(config.parameterDisplay)
            ? (config.parameterDisplay as Array<Record<string, unknown>>).map(entry => {
                return {
                    key: entry.key as string,
                    group: entry.group as string | undefined,
                    graphType: (entry.graphType as string) as DisplayConfigSchema[`parameterDisplay`][number][`graphType`],
                    hidden: entry.hidden as boolean,
                    displayOrder: entry.displayOrder as number,
                };
            })
            : [],
    };
}
