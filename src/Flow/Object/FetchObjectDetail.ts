import { neo4jClient } from '../../Setup/Neo4j.js';
import { ParameterSnapshotRepository } from '../../Repository/GameObject/ParameterSnapshotRepository.js';
import type { IParameterSnapshot } from '../../Domain/GameObject/Entity/IParameterSnapshot.js';

/**
 * @brief Represents a relationship from the object to another node
 * @example { relationshipType: 'BELONGS_TO', direction: 'outgoing', targetUid: 'org_1', targetName: 'Admins', targetLabels: ['Organization'] }
 */
export interface ObjectRelationship {
    relationshipType: string; // Neo4j relationship label
    direction: string; // whether outgoing or incoming
    targetUid: string; // UID of the related node
    targetName: string; // display name of the related node
    targetLabels: string[]; // Neo4j labels of the related node
}

/**
 * @brief Full detail payload for any graph object
 * @example const detail = await FetchObjectDetail('game_abc'); detail.properties.name // 'Galaxy League'
 */
export interface ObjectDetail {
    uid: string; // unique object identifier
    labels: string[]; // all Neo4j labels on the node
    properties: Record<string, unknown>; // all node properties excluding internal
    parameters: Record<string, string>; // key value parameters via HAS_PARAMETER
    relationships: ObjectRelationship[]; // all direct relationships
    createdAt: number | null; // creation timestamp ms or null
    updatedAt: number | null; // last update timestamp ms or null
    /** Historical parameter snapshots ordered newest first and empty when history not requested */
    parameterHistory: IParameterSnapshot[];
}

/** Properties excluded from the public properties map */
const _INTERNAL_PROPERTIES = new Set([
    `elementId`,
    `identity`,
]);

/**
 * @brief Fetches complete detail for any object node by UID using separate queries for node and relationships to avoid cartesian products
 * @param uid string Object unique identifier
 * @param includeHistory boolean Whether to include parameter snapshots
 * @returns ObjectDetail or null Full detail or null if not found
 */
export async function FetchObjectDetail(uid: string, includeHistory: boolean = false): Promise<ObjectDetail | null> {
    const session = await neo4jClient.GetSession(`READ`);
    try {
        const nodeQuery = `
            MATCH (n { uid: $uid })
            OPTIONAL MATCH (n)-[:HAS_PARAMETER]->(param:Parameter)
            RETURN n,
                   labels(n) AS nodeLabels,
                   collect(DISTINCT { key: param.key, value: param.value }) AS params
        `;

        const nodeResult = await session.run(nodeQuery, { uid });
        const nodeRecord = nodeResult.records[0];
        if (!nodeRecord) {
            return null;
        }

        const node = nodeRecord.get(`n`);
        const nodeLabels = nodeRecord.get(`nodeLabels`) as string[];
        const rawParams = nodeRecord.get(`params`) as Array<{ key: string | null; value: unknown }>;

        const relationshipQuery = `
            MATCH (n { uid: $uid })
            OPTIONAL MATCH (n)-[outRel]->(outTarget)
            WHERE NOT outTarget:Parameter
            WITH collect(DISTINCT {
                relType: type(outRel),
                direction: 'outgoing',
                uid: outTarget.uid,
                name: coalesce(outTarget.name, outTarget.friendly_name, outTarget.uid, ''),
                labels: labels(outTarget)
            })[0..200] AS outgoing
            MATCH (n { uid: $uid })
            OPTIONAL MATCH (n)<-[inRel]-(inSource)
            WITH outgoing, collect(DISTINCT {
                relType: type(inRel),
                direction: 'incoming',
                uid: inSource.uid,
                name: coalesce(inSource.name, inSource.friendly_name, inSource.uid, ''),
                labels: labels(inSource)
            })[0..200] AS incoming
            RETURN outgoing, incoming
        `;

        const relResult = await session.run(relationshipQuery, { uid });
        const relRecord = relResult.records[0];

        const rawOutgoing = (relRecord?.get(`outgoing`) ?? []) as Array<{
            relType: string | null;
            direction: string;
            uid: string | null;
            name: string;
            labels: string[];
        }>;
        const rawIncoming = (relRecord?.get(`incoming`) ?? []) as Array<{
            relType: string | null;
            direction: string;
            uid: string | null;
            name: string;
            labels: string[];
        }>;

        const properties: Record<string, unknown> = {};
        const nodeProps = node.properties ?? {};
        for (const [key, value] of Object.entries(nodeProps)) {
            if (!_INTERNAL_PROPERTIES.has(key)) {
                properties[key] = value;
            }
        }

        const parameters: Record<string, string> = {};
        for (const entry of rawParams) {
            if (entry.key) {
                parameters[entry.key] = String(entry.value ?? ``);
            }
        }

        const relationships: ObjectRelationship[] = [];
        const seenRelationships = new Set<string>();

        for (const raw of [...rawOutgoing, ...rawIncoming]) {
            if (!raw.relType || !raw.uid) {
                continue;
            }
            const deduplicationKey = `${raw.relType}:${raw.direction}:${raw.uid}`;
            if (seenRelationships.has(deduplicationKey)) {
                continue;
            }
            seenRelationships.add(deduplicationKey);
            relationships.push({
                relationshipType: raw.relType,
                direction: raw.direction,
                targetUid: raw.uid,
                targetName: raw.name,
                targetLabels: raw.labels ?? [],
            });
        }

        const createdAtRaw = nodeProps.created_at ?? nodeProps.createdAt ?? null;
        const updatedAtRaw = nodeProps.updated_at ?? nodeProps.updatedAt ?? null;

        // Fetch parameter history if requested
        let parameterHistory: IParameterSnapshot[] = [];
        if (includeHistory) {
            try {
                const snapshotRepository = new ParameterSnapshotRepository();
                parameterHistory = await snapshotRepository.GetRecentSnapshots(uid, 20);
            } catch {
                // History fetch failures must not break detail retrieval
                parameterHistory = [];
            }
        }

        return {
            uid,
            labels: nodeLabels,
            properties,
            parameters,
            relationships,
            createdAt: createdAtRaw ? Number(createdAtRaw) : null,
            updatedAt: updatedAtRaw ? Number(updatedAtRaw) : null,
            parameterHistory,
        };
    } finally {
        await session.close();
    }
}
