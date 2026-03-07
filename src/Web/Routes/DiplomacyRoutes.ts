import type { FastifyInstance } from 'fastify';
import { DiplomacyRepository } from '../../Repository/Organization/DiplomacyRepository.js';
import { SetDiplomaticStatus } from '../../Flow/Organization/Diplomacy/SetDiplomaticStatus.js';
import { DIPLOMATIC_STATUSES } from '../../Domain/Organization/DiplomaticStatus.js';
import type { DiplomaticStatus } from '../../Domain/Organization/DiplomaticStatus.js';

const diplomacyRepository = new DiplomacyRepository();

export function RegisterDiplomacyRoutes(fastify: FastifyInstance): void {
    fastify.get<{
        Querystring: {
            sourceOrganizationUid: string;
            gameUid: string;
        };
    }>(`/api/diplomacy`, {
        schema: {
            tags: [`Diplomacy`],
            querystring: {
                type: `object`,
                required: [`sourceOrganizationUid`, `gameUid`],
                properties: {
                    sourceOrganizationUid: { type: `string` },
                    gameUid: { type: `string` },
                },
            },
        },
        handler: async(request, reply) => {
            const { sourceOrganizationUid, gameUid } = request.query;
            const relations = await diplomacyRepository.ListRelationsFromOrganization(
                sourceOrganizationUid,
                gameUid,
            );
            return reply.send({ relations });
        },
    });

    fastify.get<{
        Querystring: {
            sourceOrganizationUid: string;
            targetOrganizationUid: string;
            gameUid: string;
        };
    }>(`/api/diplomacy/relation`, {
        schema: {
            tags: [`Diplomacy`],
            querystring: {
                type: `object`,
                required: [`sourceOrganizationUid`, `targetOrganizationUid`, `gameUid`],
                properties: {
                    sourceOrganizationUid: { type: `string` },
                    targetOrganizationUid: { type: `string` },
                    gameUid: { type: `string` },
                },
            },
        },
        handler: async(request, reply) => {
            const { sourceOrganizationUid, targetOrganizationUid, gameUid } = request.query;
            const relation = await diplomacyRepository.GetRelation(
                sourceOrganizationUid,
                targetOrganizationUid,
                gameUid,
            );
            if (!relation) {
                return reply.code(404).send({ error: `No diplomatic relation found` });
            }
            return reply.send(relation);
        },
    });

    fastify.put<{
        Body: {
            sourceOrganizationUid: string;
            targetOrganizationUid: string;
            gameUid: string;
            status: DiplomaticStatus;
        };
    }>(`/api/diplomacy`, {
        schema: {
            tags: [`Diplomacy`],
            body: {
                type: `object`,
                required: [`sourceOrganizationUid`, `targetOrganizationUid`, `gameUid`, `status`],
                properties: {
                    sourceOrganizationUid: { type: `string` },
                    targetOrganizationUid: { type: `string` },
                    gameUid: { type: `string` },
                    status: { type: `string`, enum: [...DIPLOMATIC_STATUSES] },
                },
            },
        },
        handler: async(request, reply) => {
            const { sourceOrganizationUid, targetOrganizationUid, gameUid, status } = request.body;
            const result = await SetDiplomaticStatus(
                sourceOrganizationUid,
                targetOrganizationUid,
                gameUid,
                status,
            );
            return reply.send({
                relation: result.relation,
                projectionsUpdated: result.projectionsUpdated,
            });
        },
    });

    fastify.delete<{
        Querystring: {
            sourceOrganizationUid: string;
            targetOrganizationUid: string;
            gameUid: string;
        };
    }>(`/api/diplomacy`, {
        schema: {
            tags: [`Diplomacy`],
            querystring: {
                type: `object`,
                required: [`sourceOrganizationUid`, `targetOrganizationUid`, `gameUid`],
                properties: {
                    sourceOrganizationUid: { type: `string` },
                    targetOrganizationUid: { type: `string` },
                    gameUid: { type: `string` },
                },
            },
        },
        handler: async(request, reply) => {
            const { sourceOrganizationUid, targetOrganizationUid, gameUid } = request.query;
            const deleted = await diplomacyRepository.DeleteRelation(
                sourceOrganizationUid,
                targetOrganizationUid,
                gameUid,
            );
            if (!deleted) {
                return reply.code(404).send({ error: `No diplomatic relation found to delete` });
            }
            return reply.code(204).send();
        },
    });
}
