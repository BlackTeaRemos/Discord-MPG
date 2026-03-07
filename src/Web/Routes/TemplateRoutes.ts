import type { FastifyInstance } from 'fastify';
import type { IGameObjectTemplate } from '../../Domain/GameObject/Entity/IGameObjectTemplate.js';
import { Log } from '../../Common/Log.js';
import { neo4jClient } from '../../Setup/Neo4j.js';
import type { IRouteContext } from './IRouteContext.js';
import {
    ValidateTemplateWithExpressions,
    type ICrossReferenceError,
    type IContextValidateApiResponse,
} from './TemplateValidation.js';
import {
    ParameterDefinitionSchema,
    ActionDefinitionSchema,
    ErrorResponseSchema,
    ValidateResponseSchema,
    ContextValidateResponseSchema,
    TemplateSchema,
    TemplateBodySchema,
    SuccessResponseSchema,
    ValidationErrorResponseSchema,
} from './ApiSchemas.js';

const LOG_TAG = `Web/TemplateRoutes`;

export function RegisterTemplateRoutes(fastify: FastifyInstance, context: IRouteContext): void {
    fastify.get<{ Querystring: { gameUid: string; organizationUid?: string } }>(`/api/templates`, {
        schema: {
            tags: [`Templates`],
            summary: `List templates for a game`,
            querystring: {
                type: `object`,
                required: [`gameUid`],
                properties: {
                    gameUid: { type: `string`, description: `Game identifier` },
                    organizationUid: { type: `string`, description: `Optional organization to filter templates by visibility` },
                },
            },
            response: {
                200: {
                    description: `Template list`,
                    type: `object`,
                    properties: {
                        templates: {
                            type: `array`,
                            items: {
                                type: `object`,
                                properties: {
                                    uid: { type: `string`, description: `Template unique identifier` },
                                    name: { type: `string`, description: `Template display name` },
                                    description: { type: `string`, description: `Template purpose` },
                                    tags: { type: `array`, items: { type: `array`, items: { type: `string` } } },
                                    parameters: { type: `array`, items: ParameterDefinitionSchema },
                                    actions: { type: `array`, items: ActionDefinitionSchema },
                                },
                            },
                        },
                    },
                },
                500: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            let templates: IGameObjectTemplate[];

            if (request.query.organizationUid) {
                const session = await neo4jClient.GetSession(`READ`);
                try {
                    const result = await session.run(
                        `MATCH (org:Organization { uid: $organizationUid })-[:OWNS_OBJECT]->(obj:GameObject)-[:INSTANCE_OF]->(tpl:GameObjectTemplate { gameUid: $gameUid })
                         RETURN DISTINCT tpl
                         ORDER BY tpl.name`,
                        { gameUid: request.query.gameUid, organizationUid: request.query.organizationUid },
                    );

                    templates = result.records.map(record => {
                        const node = record.get(`tpl`);
                        const properties = node.properties;
                        return {
                            uid: properties.uid as string,
                            gameUid: properties.gameUid as string,
                            name: properties.name as string,
                            description: (properties.description as string) ?? ``,
                            parameters: properties.parameters_json ? JSON.parse(properties.parameters_json as string) : [],
                            actions: properties.actions_json ? JSON.parse(properties.actions_json as string) : [],
                            tags: properties.tags_json ? JSON.parse(properties.tags_json as string) : [],
                            displayConfig: properties.display_config_json ? JSON.parse(properties.display_config_json as string) : undefined,
                            projectionDisplayConfigs: properties.projection_display_configs_json ? JSON.parse(properties.projection_display_configs_json as string) : undefined,
                            createdAt: properties.createdAt as string,
                            updatedAt: properties.updatedAt as string,
                        } as IGameObjectTemplate;
                    });
                } finally {
                    await session.close();
                }
            } else {
                templates = await context.templateRepository.ListByGame(request.query.gameUid);
            }

            const templateSummaries = templates.map(template => {
                return {
                    uid: template.uid,
                    name: template.name,
                    description: template.description,
                    tags: template.tags ?? [],
                    parameters: template.parameters.map(parameter => {
                        return {
                            key: parameter.key,
                            label: parameter.label,
                            valueType: parameter.valueType,
                        };
                    }),
                    actions: template.actions.map(action => {
                        return {
                            key: action.key,
                            label: action.label,
                            trigger: action.trigger,
                        };
                    }),
                };
            });

            return { templates: templateSummaries };
        } catch(fetchError) {
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            Log.error(`Failed to list templates: ${message}`, LOG_TAG, `ListTemplates`);
            return reply.status(500).send({ error: `Failed to fetch templates.` });
        }
    });

    fastify.post(`/api/validate`, {
        schema: {
            tags: [`Templates`],
            summary: `Validate template JSON structure and expressions`,
            body: {
                type: `object`,
                description: `Full template JSON object to validate`,
                properties: {
                    name: { type: `string`, description: `Template name` },
                    description: { type: `string`, description: `Template description` },
                    parameters: { type: `array`, items: ParameterDefinitionSchema, description: `Parameter definitions` },
                    actions: { type: `array`, items: ActionDefinitionSchema, description: `Action definitions` },
                },
            },
            response: {
                200: ValidateResponseSchema,
            },
        },
    }, async (request) => {
        return ValidateTemplateWithExpressions(request.body, context.expressionEvaluator);
    });

    fastify.post<{ Body: { gameUid: string; template: Record<string, unknown> } }>(`/api/validate-context`, {
        schema: {
            tags: [`Templates`],
            summary: `Validate template with cross-template reference checking`,
            body: {
                type: `object`,
                required: [`gameUid`, `template`],
                properties: {
                    gameUid: { type: `string` },
                    template: { type: `object` },
                },
            },
            response: {
                200: ContextValidateResponseSchema,
                400: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const { gameUid, template } = request.body;

            const basicResult = ValidateTemplateWithExpressions(template, context.expressionEvaluator);

            if (!basicResult.valid && basicResult.structuralErrors.length > 0) {
                return basicResult;
            }

            const existingTemplates = await context.templateRepository.ListByGame(gameUid);

            const knownTemplateParams = new Map<string, Set<string>>();
            for (const existingTemplate of existingTemplates) {
                const paramKeys = new Set<string>();
                for (const parameter of existingTemplate.parameters) {
                    if (parameter.valueType === `number`) {
                        paramKeys.add(parameter.key);
                    }
                }
                knownTemplateParams.set(existingTemplate.name, paramKeys);
            }

            const currentParams = template.parameters as Array<{ key: string; valueType: string }>;
            const currentName = template.name as string;
            const currentParamKeys = new Set<string>();
            for (const parameter of currentParams) {
                if (parameter.valueType === `number`) {
                    currentParamKeys.add(parameter.key);
                }
            }
            knownTemplateParams.set(currentName, currentParamKeys);

            const crossRefErrors: ICrossReferenceError[] = [];
            const crossRefPattern = /@(?:own\.)?([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)/g;
            const inlineTargetPattern = /^@(?:own\.)?([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\s*[+\-*/]?=/;

            if (Array.isArray(template.actions)) {
                const actions = template.actions as Array<{ key: string; expressions: string[] }>;

                for (const action of actions) {
                    for (let expressionIndex = 0; expressionIndex < action.expressions.length; expressionIndex++) {
                        const expression = action.expressions[expressionIndex];

                        const inlineMatch = inlineTargetPattern.exec(expression);
                        if (inlineMatch) {
                            const targetTemplateName = inlineMatch[1];
                            const targetParamKey = inlineMatch[2];

                            if (!knownTemplateParams.has(targetTemplateName)) {
                                crossRefErrors.push({
                                    actionKey: action.key,
                                    expressionIndex,
                                    reference: `@${targetTemplateName}.${targetParamKey}`,
                                    error: `Unknown inline target template "${targetTemplateName}". Available: ${Array.from(knownTemplateParams.keys()).join(`, `)}.`,
                                });
                            } else {
                                const availableParams = knownTemplateParams.get(targetTemplateName)!;
                                if (!availableParams.has(targetParamKey)) {
                                    crossRefErrors.push({
                                        actionKey: action.key,
                                        expressionIndex,
                                        reference: `@${targetTemplateName}.${targetParamKey}`,
                                        error: `Template "${targetTemplateName}" has no numeric parameter "${targetParamKey}". Available: ${Array.from(availableParams).join(`, `)}.`,
                                    });
                                }
                            }
                        }

                        let crossRefMatch: RegExpExecArray | null;
                        crossRefPattern.lastIndex = 0;
                        const rhsStartIndex = inlineMatch ? inlineMatch[0].length : 0;
                        const rhsText = expression.substring(rhsStartIndex);

                        while ((crossRefMatch = crossRefPattern.exec(rhsText)) !== null) {
                            const referencedTemplate = crossRefMatch[1];
                            const referencedParam = crossRefMatch[2];

                            if (!knownTemplateParams.has(referencedTemplate)) {
                                crossRefErrors.push({
                                    actionKey: action.key,
                                    expressionIndex,
                                    reference: `@${referencedTemplate}.${referencedParam}`,
                                    error: `Unknown template "${referencedTemplate}". Available: ${Array.from(knownTemplateParams.keys()).join(`, `)}.`,
                                });
                            } else {
                                const availableParams = knownTemplateParams.get(referencedTemplate)!;
                                if (!availableParams.has(referencedParam)) {
                                    crossRefErrors.push({
                                        actionKey: action.key,
                                        expressionIndex,
                                        reference: `@${referencedTemplate}.${referencedParam}`,
                                        error: `Template "${referencedTemplate}" has no numeric parameter "${referencedParam}". Available: ${Array.from(availableParams).join(`, `)}.`,
                                    });
                                }
                            }
                        }
                    }
                }
            }

            const contextResult: IContextValidateApiResponse = {
                ...basicResult,
                valid: basicResult.valid && crossRefErrors.length === 0,
                crossReferenceErrors: crossRefErrors,
                availableTemplates: Array.from(knownTemplateParams.entries()).map(([templateName, paramKeys]) => {
                    return {
                        name: templateName,
                        numericParameters: Array.from(paramKeys),
                    };
                }),
            };

            return contextResult;
        } catch(parseError) {
            const message = parseError instanceof Error ? parseError.message : String(parseError);
            Log.error(`Context validation error: ${message}`, LOG_TAG, `ValidateContext`);
            return reply.status(400).send({ valid: false, errors: [`Validation failed: ${message}`] });
        }
    });

    fastify.get<{ Params: { uid: string } }>(`/api/templates/:uid`, {
        schema: {
            tags: [`Templates`],
            summary: `Get a single template by UID`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template UID` },
                },
            },
            response: {
                200: TemplateSchema,
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const template = await context.templateRepository.GetByUid(request.params.uid);
            if (!template) {
                return reply.status(404).send({ error: `Template not found` });
            }
            return template;
        } catch (fetchError) {
            const message = fetchError instanceof Error ? fetchError.message : String(fetchError);
            Log.error(`Failed to get template: ${message}`, LOG_TAG, `GetTemplate`);
            return reply.status(500).send({ error: `Failed to retrieve template` });
        }
    });

    fastify.post<{ Body: Record<string, unknown> }>(`/api/templates`, {
        schema: {
            tags: [`Templates`],
            summary: `Create a new template`,
            body: TemplateBodySchema,
            response: {
                201: TemplateSchema,
                400: ValidationErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const body = request.body;
            const validationResult = ValidateTemplateWithExpressions(body, context.expressionEvaluator);
            if (!validationResult.valid) {
                return reply.status(400).send({
                    error: `Template validation failed`,
                    structuralErrors: validationResult.structuralErrors,
                    expressionErrors: validationResult.expressionErrors,
                });
            }

            const template = await context.templateRepository.Create({
                gameUid: body.gameUid as string,
                name: body.name as string,
                description: (body.description as string) ?? ``,
                parameters: body.parameters as IGameObjectTemplate[`parameters`],
                actions: body.actions as IGameObjectTemplate[`actions`],
                tags: (body.tags as IGameObjectTemplate[`tags`]) ?? [],
                displayConfig: body.displayConfig as IGameObjectTemplate[`displayConfig`],
            });

            return reply.status(201).send(template);
        } catch (createError) {
            const message = createError instanceof Error ? createError.message : String(createError);
            Log.error(`Failed to create template: ${message}`, LOG_TAG, `CreateTemplate`);
            return reply.status(500).send({ error: `Failed to create template` });
        }
    });

    fastify.put<{ Params: { uid: string }; Body: Record<string, unknown> }>(`/api/templates/:uid`, {
        schema: {
            tags: [`Templates`],
            summary: `Update an existing template`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template UID to update` },
                },
            },
            body: TemplateBodySchema,
            response: {
                200: TemplateSchema,
                400: ValidationErrorResponseSchema,
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const existing = await context.templateRepository.GetByUid(request.params.uid);
            if (!existing) {
                return reply.status(404).send({ error: `Template not found` });
            }

            const body = request.body;
            const validationResult = ValidateTemplateWithExpressions(body, context.expressionEvaluator);
            if (!validationResult.valid) {
                return reply.status(400).send({
                    error: `Template validation failed`,
                    structuralErrors: validationResult.structuralErrors,
                    expressionErrors: validationResult.expressionErrors,
                });
            }

            const updated = await context.templateRepository.Update(request.params.uid, {
                name: body.name as string,
                description: (body.description as string) ?? ``,
                parameters: body.parameters as IGameObjectTemplate[`parameters`],
                actions: body.actions as IGameObjectTemplate[`actions`],
                displayConfig: body.displayConfig as IGameObjectTemplate[`displayConfig`],
            });

            return updated;
        } catch (updateError) {
            const message = updateError instanceof Error ? updateError.message : String(updateError);
            Log.error(`Failed to update template: ${message}`, LOG_TAG, `UpdateTemplate`);
            return reply.status(500).send({ error: `Failed to update template` });
        }
    });

    fastify.delete<{ Params: { uid: string } }>(`/api/templates/:uid`, {
        schema: {
            tags: [`Templates`],
            summary: `Delete a template`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template UID to delete` },
                },
            },
            response: {
                200: SuccessResponseSchema,
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async (request, reply) => {
        try {
            const deleted = await context.templateRepository.Delete(request.params.uid);
            if (!deleted) {
                return reply.status(404).send({ error: `Template not found` });
            }
            return { success: true };
        } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : String(deleteError);
            Log.error(`Failed to delete template: ${message}`, LOG_TAG, `DeleteTemplate`);
            return reply.status(500).send({ error: `Failed to delete template` });
        }
    });
}
