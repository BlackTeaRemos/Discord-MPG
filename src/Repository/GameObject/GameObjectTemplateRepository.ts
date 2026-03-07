import { randomUUID } from 'crypto';
import { neo4jClient } from '../../Setup/Neo4j.js';
import { Log } from '../../Common/Log.js';
import type { IGameObjectTemplate } from '../../Domain/GameObject/Entity/IGameObjectTemplate.js';
import type { ITemplateDisplayConfig } from '../../Domain/GameObject/Display/ITemplateDisplayConfig.js';
import type { ProjectionDisplayConfigMap } from '../../Domain/GameObject/Entity/Projection/ProjectionStyleMap.js';
import type { IGameObjectTemplateRepository } from '../../Domain/GameObject/Repository/IGameObjectTemplateRepository.js';

/** Neo4j node label for template nodes */
const TEMPLATE_LABEL = `GameObjectTemplate`;

/** Relationship type linking Game to template */
const REL_HAS_TEMPLATE = `HAS_OBJECT_TEMPLATE`;

/**
 * @brief Generate a unique template UID
 * @returns string Template uid @example 'tpl_a1b2c3d4e5'
 */
function __GenerateTemplateUid(): string {
    return `tpl_${randomUUID().replace(/-/g, ``)}`;
}

/**
 * @brief Map Neo4j record properties to IGameObjectTemplate
 * @param properties Record_string_any Neo4j node properties
 * @returns IGameObjectTemplate Mapped template object
 */
function __MapNodeToTemplate(properties: Record<string, any>): IGameObjectTemplate {
    const template: IGameObjectTemplate = {
        uid: properties.uid,
        gameUid: properties.gameUid,
        name: properties.name,
        description: properties.description ?? ``,
        parameters: JSON.parse(properties.parameters_json ?? `[]`),
        actions: JSON.parse(properties.actions_json ?? `[]`),
        tags: JSON.parse(properties.tags_json ?? `[]`),
        createdAt: properties.createdAt,
        updatedAt: properties.updatedAt,
    };

    if (properties.display_config_json) {
        template.displayConfig = JSON.parse(properties.display_config_json) as ITemplateDisplayConfig;
    }

    if (properties.projection_display_configs_json) {
        template.projectionDisplayConfigs = JSON.parse(properties.projection_display_configs_json) as ProjectionDisplayConfigMap;
    }

    return template;
}

/**
 * @brief Concrete implementation of IGameObjectTemplateRepository using Neo4j
 */
export class GameObjectTemplateRepository implements IGameObjectTemplateRepository {
    /**
     * @brief Persist a new template linked to a game
     * @param template Omit_IGameObjectTemplate Template data
     * @returns Promise_IGameObjectTemplate Persisted template
     * @example
     * const template = await repo.Create({ gameUid: 'game_123', name: 'Factory', ... });
     */
    public async Create(
        template: Omit<IGameObjectTemplate, `uid` | `createdAt` | `updatedAt`>,
    ): Promise<IGameObjectTemplate> {
        const session = await neo4jClient.GetSession(`WRITE`);
        try {
            const uid = __GenerateTemplateUid();
            const now = new Date().toISOString();
            const parametersJson = JSON.stringify(template.parameters);
            const actionsJson = JSON.stringify(template.actions);
            const tagsJson = JSON.stringify(template.tags ?? []);
            const displayConfigJson = template.displayConfig
                ? JSON.stringify(template.displayConfig)
                : null;
            const projectionDisplayConfigsJson = template.projectionDisplayConfigs
                ? JSON.stringify(template.projectionDisplayConfigs)
                : null;

            const query = `
                MATCH (game:Game { uid: $gameUid })
                CREATE (tpl:${TEMPLATE_LABEL} {
                    uid: $uid,
                    gameUid: $gameUid,
                    name: $name,
                    description: $description,
                    parameters_json: $parametersJson,
                    actions_json: $actionsJson,
                    tags_json: $tagsJson,
                    display_config_json: $displayConfigJson,
                    projection_display_configs_json: $projectionDisplayConfigsJson,
                    createdAt: $now,
                    updatedAt: $now
                })
                MERGE (game)-[:${REL_HAS_TEMPLATE}]->(tpl)
                RETURN tpl
            `;

            const result = await session.run(query, {
                gameUid: template.gameUid,
                uid,
                name: template.name,
                description: template.description ?? ``,
                parametersJson,
                actionsJson,
                tagsJson,
                displayConfigJson,
                projectionDisplayConfigsJson,
                now,
            });

            const record = result.records[0];
            if (!record) {
                throw new Error(`Game "${template.gameUid}" not found. Cannot create template.`);
            }

            return __MapNodeToTemplate(record.get(`tpl`).properties);
        } catch(error) {
            Log.error(`Failed to create template: ${String(error)}`, `Repository/GameObject`, `Create`);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * @brief Retrieve a template by uid
     * @param uid string Template identifier
     * @returns Promise_IGameObjectTemplate_or_null Template or null
     */
    public async GetByUid(uid: string): Promise<IGameObjectTemplate | null> {
        const session = await neo4jClient.GetSession(`READ`);
        try {
            const result = await session.run(
                `MATCH (tpl:${TEMPLATE_LABEL} { uid: $uid }) RETURN tpl`,
                { uid },
            );

            const record = result.records[0];
            if (!record) {
                return null;
            }

            return __MapNodeToTemplate(record.get(`tpl`).properties);
        } finally {
            await session.close();
        }
    }

    /**
     * @brief List all templates belonging to a game
     * @param gameUid string Game identifier
     * @returns Promise_IGameObjectTemplate_array Templates for the game
     */
    public async ListByGame(gameUid: string): Promise<IGameObjectTemplate[]> {
        const session = await neo4jClient.GetSession(`READ`);
        try {
            const result = await session.run(
                `MATCH (game:Game { uid: $gameUid })-[:${REL_HAS_TEMPLATE}]->(tpl:${TEMPLATE_LABEL})
                 RETURN tpl ORDER BY tpl.name`,
                { gameUid },
            );

            return result.records.map(record => {
                return __MapNodeToTemplate(record.get(`tpl`).properties);
            });
        } finally {
            await session.close();
        }
    }

    public async ListAll(): Promise<IGameObjectTemplate[]> {
        const session = await neo4jClient.GetSession(`READ`);
        try {
            const result = await session.run(
                `MATCH (tpl:${TEMPLATE_LABEL}) RETURN tpl ORDER BY tpl.name`,
            );

            return result.records.map(record => {
                return __MapNodeToTemplate(record.get(`tpl`).properties);
            });
        } finally {
            await session.close();
        }
    }

    /**
     * @brief Find a template by name within a game
     * @param gameUid string Game identifier @example 'game_xyz789'
     * @param name string Template name case sensitive @example 'Factory'
     * @returns Promise_IGameObjectTemplate_or_null Template or null if not found
     */
    public async FindByName(gameUid: string, name: string): Promise<IGameObjectTemplate | null> {
        const session = await neo4jClient.GetSession(`READ`);
        try {
            const result = await session.run(
                `MATCH (game:Game { uid: $gameUid })-[:${REL_HAS_TEMPLATE}]->(tpl:${TEMPLATE_LABEL} { name: $name })
                 RETURN tpl LIMIT 1`,
                { gameUid, name },
            );

            const record = result.records[0];
            if (!record) {
                return null;
            }

            return __MapNodeToTemplate(record.get(`tpl`).properties);
        } finally {
            await session.close();
        }
    }

    /**
     * @brief Update a templates mutable fields
     * @param uid string Template uid
     * @param updates Partial_Omit_IGameObjectTemplate Fields to update
     * @returns Promise_IGameObjectTemplate Updated template
     */
    public async Update(
        uid: string,
        updates: Partial<Omit<IGameObjectTemplate, `uid` | `gameUid` | `createdAt`>>,
    ): Promise<IGameObjectTemplate> {
        const session = await neo4jClient.GetSession(`WRITE`);
        try {
            const setClauses: string[] = [`tpl.updatedAt = $now`];
            const params: Record<string, any> = { uid, now: new Date().toISOString() };

            if (updates.name !== undefined) {
                setClauses.push(`tpl.name = $name`);
                params.name = updates.name;
            }

            if (updates.description !== undefined) {
                setClauses.push(`tpl.description = $description`);
                params.description = updates.description;
            }

            if (updates.parameters !== undefined) {
                setClauses.push(`tpl.parameters_json = $parametersJson`);
                params.parametersJson = JSON.stringify(updates.parameters);
            }

            if (updates.actions !== undefined) {
                setClauses.push(`tpl.actions_json = $actionsJson`);
                params.actionsJson = JSON.stringify(updates.actions);
            }

            if (updates.tags !== undefined) {
                setClauses.push(`tpl.tags_json = $tagsJson`);
                params.tagsJson = JSON.stringify(updates.tags);
            }

            if (updates.displayConfig !== undefined) {
                setClauses.push(`tpl.display_config_json = $displayConfigJson`);
                params.displayConfigJson = updates.displayConfig
                    ? JSON.stringify(updates.displayConfig)
                    : null;
            }

            if (updates.projectionDisplayConfigs !== undefined) {
                setClauses.push(`tpl.projection_display_configs_json = $projectionDisplayConfigsJson`);
                params.projectionDisplayConfigsJson = updates.projectionDisplayConfigs
                    ? JSON.stringify(updates.projectionDisplayConfigs)
                    : null;
            }

            const query = `
                MATCH (tpl:${TEMPLATE_LABEL} { uid: $uid })
                SET ${setClauses.join(`, `)}
                RETURN tpl
            `;

            const result = await session.run(query, params);
            const record = result.records[0];

            if (!record) {
                throw new Error(`Template "${uid}" not found.`);
            }

            return __MapNodeToTemplate(record.get(`tpl`).properties);
        } catch(error) {
            Log.error(`Failed to update template: ${String(error)}`, `Repository/GameObject`, `Update`);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * @brief Delete a template node
     * @param uid string Template uid
     * @returns Promise_boolean True if deleted
     */
    public async Delete(uid: string): Promise<boolean> {
        const session = await neo4jClient.GetSession(`WRITE`);
        try {
            const result = await session.run(
                `MATCH (tpl:${TEMPLATE_LABEL} { uid: $uid }) DETACH DELETE tpl RETURN count(tpl) AS deleted`,
                { uid },
            );

            const deletedCount = result.records[0]?.get(`deleted`)?.toNumber?.() ?? 0;
            return deletedCount > 0;
        } finally {
            await session.close();
        }
    }
}
