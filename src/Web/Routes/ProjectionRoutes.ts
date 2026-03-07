import type { FastifyInstance } from 'fastify';
import { ObjectProjectionRepository } from '../../Repository/GameObject/ObjectProjectionRepository.js';
import { GameObjectRepository } from '../../Repository/GameObject/GameObjectRepository.js';
import { FetchProjectedObjectDetail } from '../../Flow/Object/FetchProjectedObjectDetail.js';
import { RenderObjectCard } from '../../Framework/ImageGen/ObjectCardRenderer.js';
import { ResolveDiplomaticStatus } from '../../Flow/Organization/Diplomacy/ResolveDiplomaticStatus.js';
import type { ProjectionStatus } from '../../Domain/GameObject/Entity/Projection/IObjectProjection.js';

const projectionRepository = new ObjectProjectionRepository();
const objectRepository = new GameObjectRepository();

export function RegisterProjectionRoutes(fastify: FastifyInstance): void {
    fastify.get<{
        Querystring: {
            gameUid: string;
            templateUid?: string;
        };
    }>(`/api/game-objects`, {
        schema: {
            tags: [`Projections`],
            querystring: {
                type: `object`,
                required: [`gameUid`],
                properties: {
                    gameUid: { type: `string` },
                    templateUid: { type: `string` },
                },
            },
        },
        handler: async(request, reply) => {
            const { gameUid, templateUid } = request.query;
            const objects = await objectRepository.ListByGame(gameUid, templateUid ? { templateUid } : undefined);
            return reply.send({ objects });
        },
    });

    fastify.get<{
        Querystring: {
            organizationUid: string;
            templateUid?: string;
        };
    }>(`/api/projections`, {
        schema: {
            tags: [`Projections`],
            querystring: {
                type: `object`,
                required: [`organizationUid`],
                properties: {
                    organizationUid: { type: `string` },
                    templateUid: { type: `string` },
                },
            },
        },
        handler: async(request, reply) => {
            const { organizationUid, templateUid } = request.query;
            const projections = await projectionRepository.ListByOrganization(
                organizationUid,
                templateUid ? { templateUid } : undefined,
            );
            return reply.send({ projections });
        },
    });

    fastify.post<{
        Body: {
            objectUid: string;
            templateUid: string;
            organizationUid: string;
            name: string;
            displayStyle?: string;
            autoSync: boolean;
        };
    }>(`/api/projections`, {
        schema: {
            tags: [`Projections`],
            body: {
                type: `object`,
                required: [`objectUid`, `templateUid`, `organizationUid`, `name`],
                properties: {
                    objectUid: { type: `string` },
                    templateUid: { type: `string` },
                    organizationUid: { type: `string` },
                    name: { type: `string` },
                    displayStyle: { type: `string` },
                    autoSync: { type: `boolean` },
                },
            },
        },
        handler: async(request, reply) => {
            const { objectUid, templateUid, organizationUid, name, displayStyle, autoSync } = request.body;

            let resolvedDisplayStyle = displayStyle;
            if (!resolvedDisplayStyle) {
                const gameObject = await objectRepository.GetByUid(objectUid);
                if (!gameObject) {
                    return reply.code(404).send({ error: `Game object "${objectUid}" not found` });
                }
                resolvedDisplayStyle = await ResolveDiplomaticStatus(
                    organizationUid,
                    gameObject.organizationUid,
                    gameObject.gameUid,
                );
            }

            const projection = await projectionRepository.Create({
                objectUid,
                templateUid,
                organizationUid,
                name,
                displayStyle: resolvedDisplayStyle,
                autoSync: autoSync ?? false,
                knownParameters: [],
            });
            return reply.code(201).send(projection);
        },
    });

    fastify.put<{
        Params: { uid: string };
        Body: {
            name?: string;
            displayStyle?: string;
            autoSync?: boolean;
            status?: ProjectionStatus;
        };
    }>(`/api/projections/:uid`, {
        schema: {
            tags: [`Projections`],
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string` },
                },
            },
            body: {
                type: `object`,
                properties: {
                    name: { type: `string` },
                    displayStyle: { type: `string` },
                    autoSync: { type: `boolean` },
                    status: { type: `string`, enum: [`ACTIVE`, `DESTROYED`] },
                },
            },
        },
        handler: async(request, reply) => {
            const { uid } = request.params;
            const fields = request.body;
            const updated = await projectionRepository.UpdateMetadata(uid, fields);
            return reply.send(updated);
        },
    });

    fastify.delete<{
        Params: { uid: string };
    }>(`/api/projections/:uid`, {
        schema: {
            tags: [`Projections`],
            params: {
                type: `object`,
                required: [`uid`],
                properties: {
                    uid: { type: `string` },
                },
            },
        },
        handler: async(request, reply) => {
            const { uid } = request.params;
            await projectionRepository.UpdateMetadata(uid, { status: `DESTROYED` });
            return reply.code(204).send();
        },
    });

    fastify.get<{
        Querystring: {
            objectUid: string;
            organizationUid: string;
        };
    }>(`/api/projected-view`, {
        schema: {
            tags: [`Projections`],
            summary: `View an object through the lens of an organization projection`,
            querystring: {
                type: `object`,
                required: [`objectUid`, `organizationUid`],
                properties: {
                    objectUid: { type: `string`, description: `Object to view` },
                    organizationUid: { type: `string`, description: `Organization perspective to view from` },
                },
            },
            response: {
                200: {
                    type: `object`,
                    properties: {
                        detail: { type: `object` },
                        projection: { type: `object` },
                        resolvedDisplayConfig: { type: `object`, nullable: true },
                        isDefaultProjection: { type: `boolean` },
                    },
                },
                404: {
                    type: `object`,
                    properties: {
                        error: { type: `string` },
                    },
                },
            },
        },
        handler: async(request, reply) => {
            const { objectUid, organizationUid } = request.query;
            const projected = await FetchProjectedObjectDetail(objectUid, organizationUid, true);
            if (!projected) {
                return reply.status(404).send({ error: `Object not found` });
            }
            return reply.send(projected);
        },
    });

    fastify.get<{
        Querystring: {
            objectUid: string;
            organizationUid: string;
            locale?: string;
        };
    }>(`/api/projected-view/card`, {
        schema: {
            tags: [`Projections`],
            summary: `Render a projection aware card preview as PNG`,
            querystring: {
                type: `object`,
                required: [`objectUid`, `organizationUid`],
                properties: {
                    objectUid: { type: `string`, description: `Object to render` },
                    organizationUid: { type: `string`, description: `Organization perspective` },
                    locale: { type: `string`, description: `Locale for section labels` },
                },
            },
            response: {
                200: {
                    type: `string`,
                    format: `binary`,
                    description: `PNG image data`,
                },
                404: {
                    type: `object`,
                    properties: {
                        error: { type: `string` },
                    },
                },
            },
        },
        handler: async(request, reply) => {
            const { objectUid, organizationUid, locale } = request.query;
            const projected = await FetchProjectedObjectDetail(objectUid, organizationUid, true);
            if (!projected) {
                return reply.status(404).send({ error: `Object not found` });
            }

            const description = String(projected.detail.properties.description ?? ``);
            const pngBuffer = await RenderObjectCard({
                detail: projected.detail,
                objectType: `gameobject`,
                description: description || null,
                typeLabel: `${projected.projection.name} [${projected.projection.displayStyle}]`,
                locale: locale ?? `en`,
                displayConfig: projected.resolvedDisplayConfig,
            });

            return reply
                .type(`image/png`)
                .header(`Content-Length`, pngBuffer.length)
                .header(`Cache-Control`, `no-cache`)
                .send(pngBuffer);
        },
    });
}
