import type { FastifyInstance } from 'fastify';
import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import { templateTagService } from '../../Services/TemplateTagService.js';
import { Log } from '../../Common/Log.js';
import { ErrorResponseSchema } from './ApiSchemas.js';

const LOG_TAG = `Web/TagRoutes`;

export function RegisterTagRoutes(fastify: FastifyInstance): void {
    const templateRepository = new GameObjectTemplateRepository();

    fastify.get<{ Params: { uid: string } }>(`/api/templates/:uid/tags`, {
        schema: {
            tags: [`Tags`],
            summary: `Get tags for a template`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template unique identifier` },
                },
            },
            response: {
                200: {
                    description: `Template tag list`,
                    type: `object`,
                    properties: {
                        tags: {
                            type: `array`,
                            items: {
                                type: `array`,
                                items: { type: `string` },
                            },
                        },
                    },
                },
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const tags = templateTagService.GetTemplateTags(request.params.uid);
            return { tags };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to get template tags`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });

    fastify.put<{ Params: { uid: string }; Body: { tags: string[][] } }>(`/api/templates/:uid/tags`, {
        schema: {
            tags: [`Tags`],
            summary: `Replace all tags on a template`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template unique identifier` },
                },
            },
            body: {
                type: `object`,
                required: [`tags`],
                properties: {
                    tags: {
                        type: `array`,
                        items: {
                            type: `array`,
                            items: { type: `string` },
                        },
                    },
                },
            },
            response: {
                200: {
                    description: `Updated tags`,
                    type: `object`,
                    properties: {
                        tags: {
                            type: `array`,
                            items: {
                                type: `array`,
                                items: { type: `string` },
                            },
                        },
                    },
                },
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const template = await templateRepository.GetByUid(request.params.uid);
            if (!template) {
                return reply.status(404).send({ error: `Template not found` });
            }

            const existingTags = templateTagService.GetTemplateTags(template.uid);
            for (const existingTag of existingTags) {
                templateTagService.RemoveTag(template.gameUid, template.uid, existingTag);
            }

            for (const tagPath of request.body.tags) {
                templateTagService.AddTag(template.gameUid, template.uid, tagPath);
            }

            const updatedTags = templateTagService.GetTemplateTags(template.uid);
            await templateRepository.Update(template.uid, { tags: updatedTags });

            return { tags: updatedTags };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to replace template tags`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });

    fastify.post<{ Params: { uid: string }; Body: { tag: string[] } }>(`/api/templates/:uid/tags`, {
        schema: {
            tags: [`Tags`],
            summary: `Add a tag to a template`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template unique identifier` },
                },
            },
            body: {
                type: `object`,
                required: [`tag`],
                properties: {
                    tag: {
                        type: `array`,
                        items: { type: `string` },
                    },
                },
            },
            response: {
                200: {
                    description: `Updated tags`,
                    type: `object`,
                    properties: {
                        tags: {
                            type: `array`,
                            items: {
                                type: `array`,
                                items: { type: `string` },
                            },
                        },
                    },
                },
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const template = await templateRepository.GetByUid(request.params.uid);
            if (!template) {
                return reply.status(404).send({ error: `Template not found` });
            }

            templateTagService.AddTag(template.gameUid, template.uid, request.body.tag);
            const updatedTags = templateTagService.GetTemplateTags(template.uid);
            await templateRepository.Update(template.uid, { tags: updatedTags });

            return { tags: updatedTags };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to add template tag`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });

    fastify.delete<{ Params: { uid: string }; Body: { tag: string[] } }>(`/api/templates/:uid/tags`, {
        schema: {
            tags: [`Tags`],
            summary: `Remove a tag from a template`,
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string`, description: `Template unique identifier` },
                },
            },
            body: {
                type: `object`,
                required: [`tag`],
                properties: {
                    tag: {
                        type: `array`,
                        items: { type: `string` },
                    },
                },
            },
            response: {
                200: {
                    description: `Updated tags`,
                    type: `object`,
                    properties: {
                        tags: {
                            type: `array`,
                            items: {
                                type: `array`,
                                items: { type: `string` },
                            },
                        },
                    },
                },
                404: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const template = await templateRepository.GetByUid(request.params.uid);
            if (!template) {
                return reply.status(404).send({ error: `Template not found` });
            }

            const removed = templateTagService.RemoveTag(template.gameUid, template.uid, request.body.tag);
            if (!removed) {
                return reply.status(404).send({ error: `Tag not found on this template` });
            }

            const updatedTags = templateTagService.GetTemplateTags(template.uid);
            await templateRepository.Update(template.uid, { tags: updatedTags });

            return { tags: updatedTags };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to remove template tag`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });

    fastify.get<{ Querystring: { gameUid: string } }>(`/api/tags`, {
        schema: {
            tags: [`Tags`],
            summary: `List all tags for a game with template counts`,
            querystring: {
                type: `object`,
                required: [`gameUid`],
                properties: {
                    gameUid: { type: `string`, description: `Game identifier` },
                },
            },
            response: {
                200: {
                    description: `All tags in the game with counts`,
                    type: `object`,
                    properties: {
                        tags: {
                            type: `array`,
                            items: {
                                type: `object`,
                                properties: {
                                    path: {
                                        type: `array`,
                                        items: { type: `string` },
                                    },
                                    templateCount: { type: `number` },
                                },
                            },
                        },
                    },
                },
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const tags = templateTagService.ListAllTagsWithCounts(request.query.gameUid);
            return { tags };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to list game tags`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });

    fastify.get<{ Querystring: { gameUid: string; tag: string } }>(`/api/tags/search`, {
        schema: {
            tags: [`Tags`],
            summary: `Search templates by tag path`,
            querystring: {
                type: `object`,
                required: [`gameUid`, `tag`],
                properties: {
                    gameUid: { type: `string`, description: `Game identifier` },
                    tag: { type: `string`, description: `Tag path with / separator` },
                },
            },
            response: {
                200: {
                    description: `Template UIDs matching the tag`,
                    type: `object`,
                    properties: {
                        templateUids: {
                            type: `array`,
                            items: { type: `string` },
                        },
                    },
                },
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const tagPath = request.query.tag.split(`/`).map(segment => {
                return segment.trim().toLowerCase();
            }).filter(segment => {
                return segment.length > 0;
            });

            const templateUids = templateTagService.QueryTemplates(request.query.gameUid, tagPath);
            return { templateUids };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to search templates by tag`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });

    fastify.post<{
        Body: { gameUid: string; oldPath: string; newParentPath: string };
    }>(`/api/tags/move`, {
        schema: {
            tags: [`Tags`],
            summary: `Move a tag and all children to a new parent path`,
            body: {
                type: `object`,
                required: [`gameUid`, `oldPath`, `newParentPath`],
                properties: {
                    gameUid: { type: `string`, description: `Game identifier` },
                    oldPath: { type: `string`, description: `Current tag path with / separator` },
                    newParentPath: { type: `string`, description: `New parent path with / separator or empty for root` },
                },
            },
            response: {
                200: {
                    description: `Move result`,
                    type: `object`,
                    properties: {
                        affectedCount: { type: `number` },
                    },
                },
                400: ErrorResponseSchema,
                500: ErrorResponseSchema,
            },
        },
    }, async(request, reply) => {
        try {
            const oldPath = request.body.oldPath.split(`/`).map(segment => {
                return segment.trim().toLowerCase();
            }).filter(segment => {
                return segment.length > 0;
            });

            const newParentPath = request.body.newParentPath.length === 0
                ? []
                : request.body.newParentPath.split(`/`).map(segment => {
                    return segment.trim().toLowerCase();
                }).filter(segment => {
                    return segment.length > 0;
                });

            if (oldPath.length === 0) {
                return reply.status(400).send({ error: `Old path cannot be empty` });
            }

            const result = templateTagService.MoveTag(request.body.gameUid, oldPath, newParentPath);

            for (const [templateUid, updatedTags] of result.updatedTagsByTemplate) {
                await templateRepository.Update(templateUid, { tags: updatedTags });
            }

            return { affectedCount: result.affectedTemplateUids.length };
        } catch(error) {
            const message = error instanceof Error ? error.message : String(error);
            Log.error(`Failed to move tag`, message, LOG_TAG);
            return reply.status(500).send({ error: message });
        }
    });
}
