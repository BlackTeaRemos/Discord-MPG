import { neo4jClient } from '../../Setup/Neo4j.js';
import { Log } from '../../Common/Log.js';
import type { IDiplomacyRepository } from '../../Domain/Organization/IDiplomacyRepository.js';
import type { IDiplomaticRelation } from '../../Domain/Organization/IDiplomaticRelation.js';
import type { DiplomaticStatus } from '../../Domain/Organization/DiplomaticStatus.js';

const REL_DIPLOMATIC_STATUS = `DIPLOMATIC_STATUS`;

const LOG_TAG = `Repository/Organization/DiplomacyRepository`;

function __MapRelationToEntity(
    sourceUid: string,
    targetUid: string,
    properties: Record<string, any>,
): IDiplomaticRelation {
    return {
        sourceOrganizationUid: sourceUid,
        targetOrganizationUid: targetUid,
        gameUid: properties.gameUid,
        status: properties.status as DiplomaticStatus,
        createdAt: properties.createdAt,
        updatedAt: properties.updatedAt,
    };
}

export class DiplomacyRepository implements IDiplomacyRepository {
    public async SetRelation(
        sourceOrganizationUid: string,
        targetOrganizationUid: string,
        gameUid: string,
        status: DiplomaticStatus,
    ): Promise<IDiplomaticRelation> {
        const session = await neo4jClient.GetSession(`WRITE`);
        try {
            const now = new Date().toISOString();

            const query = `
                MATCH (source:Organization { uid: $sourceUid })
                MATCH (target:Organization { uid: $targetUid })
                MERGE (source)-[rel:${REL_DIPLOMATIC_STATUS} { gameUid: $gameUid }]->(target)
                ON CREATE SET rel.status = $status,
                              rel.createdAt = $now,
                              rel.updatedAt = $now
                ON MATCH SET rel.status = $status,
                             rel.updatedAt = $now
                RETURN rel
            `;

            const result = await session.run(query, {
                sourceUid: sourceOrganizationUid,
                targetUid: targetOrganizationUid,
                gameUid,
                status,
                now,
            });

            const record = result.records[0];
            if (!record) {
                throw new Error(
                    `Failed to set diplomatic relation from "${sourceOrganizationUid}" to "${targetOrganizationUid}"`,
                );
            }

            return __MapRelationToEntity(
                sourceOrganizationUid,
                targetOrganizationUid,
                record.get(`rel`).properties,
            );
        } catch(error) {
            Log.error(`Failed to set diplomatic relation: ${String(error)}`, LOG_TAG, `SetRelation`);
            throw error;
        } finally {
            await session.close();
        }
    }

    public async GetRelation(
        sourceOrganizationUid: string,
        targetOrganizationUid: string,
        gameUid: string,
    ): Promise<IDiplomaticRelation | null> {
        const session = await neo4jClient.GetSession(`READ`);
        try {
            const query = `
                MATCH (source:Organization { uid: $sourceUid })
                      -[rel:${REL_DIPLOMATIC_STATUS} { gameUid: $gameUid }]->
                      (target:Organization { uid: $targetUid })
                RETURN rel
            `;

            const result = await session.run(query, {
                sourceUid: sourceOrganizationUid,
                targetUid: targetOrganizationUid,
                gameUid,
            });

            const record = result.records[0];
            if (!record) {
                return null;
            }

            return __MapRelationToEntity(
                sourceOrganizationUid,
                targetOrganizationUid,
                record.get(`rel`).properties,
            );
        } finally {
            await session.close();
        }
    }

    public async ListRelationsFromOrganization(
        sourceOrganizationUid: string,
        gameUid: string,
    ): Promise<IDiplomaticRelation[]> {
        const session = await neo4jClient.GetSession(`READ`);
        try {
            const query = `
                MATCH (source:Organization { uid: $sourceUid })
                      -[rel:${REL_DIPLOMATIC_STATUS} { gameUid: $gameUid }]->
                      (target:Organization)
                RETURN rel, target.uid AS targetUid
                ORDER BY target.uid
            `;

            const result = await session.run(query, {
                sourceUid: sourceOrganizationUid,
                gameUid,
            });

            return result.records.map(record => {
                return __MapRelationToEntity(
                    sourceOrganizationUid,
                    record.get(`targetUid`),
                    record.get(`rel`).properties,
                );
            });
        } finally {
            await session.close();
        }
    }

    public async DeleteRelation(
        sourceOrganizationUid: string,
        targetOrganizationUid: string,
        gameUid: string,
    ): Promise<boolean> {
        const session = await neo4jClient.GetSession(`WRITE`);
        try {
            const query = `
                MATCH (source:Organization { uid: $sourceUid })
                      -[rel:${REL_DIPLOMATIC_STATUS} { gameUid: $gameUid }]->
                      (target:Organization { uid: $targetUid })
                DELETE rel
                RETURN count(rel) AS deleted
            `;

            const result = await session.run(query, {
                sourceUid: sourceOrganizationUid,
                targetUid: targetOrganizationUid,
                gameUid,
            });

            const record = result.records[0];
            const deletedCount = record?.get(`deleted`)?.toNumber?.() ?? 0;
            return deletedCount > 0;
        } catch(error) {
            Log.error(`Failed to delete diplomatic relation: ${String(error)}`, LOG_TAG, `DeleteRelation`);
            throw error;
        } finally {
            await session.close();
        }
    }
}
