import type { IGameObjectTemplate } from '../Entity/IGameObjectTemplate.js';

export interface IGameObjectTemplateRepository {
    /**
     * @brief Persist a new template for a game
     * @param template IGameObjectTemplate Template to create
     * @returns Promise_IGameObjectTemplate Persisted template with generated uid
     */
    Create(template: Omit<IGameObjectTemplate, `uid` | `createdAt` | `updatedAt`>): Promise<IGameObjectTemplate>;

    /**
     * @brief Retrieve a template by its uid
     * @param uid string Template identifier @example 'tpl_factory_abc123'
     * @returns Promise_IGameObjectTemplate_or_null Template or null if not found
     */
    GetByUid(uid: string): Promise<IGameObjectTemplate | null>;

    /**
     * @brief List all templates for a game
     * @param gameUid string Game identifier @example 'game_xyz789'
     * @returns Promise_IGameObjectTemplate_array All templates belonging to the game
     */
    ListByGame(gameUid: string): Promise<IGameObjectTemplate[]>;

    ListAll(): Promise<IGameObjectTemplate[]>;

    /**
     * @brief Find a template by name within a game
     * @param gameUid string Game identifier @example 'game_xyz789'
     * @param name string Template name case sensitive @example 'Factory'
     * @returns Promise_IGameObjectTemplate_or_null Template or null if not found
     */
    FindByName(gameUid: string, name: string): Promise<IGameObjectTemplate | null>;

    /**
     * @brief Update an existing template replacing parameters and actions entirely
     * @param uid string Template uid to update @example 'tpl_factory_abc123'
     * @param updates Partial_IGameObjectTemplate Fields to update
     * @returns Promise_IGameObjectTemplate Updated template
     */
    Update(uid: string, updates: Partial<Omit<IGameObjectTemplate, `uid` | `gameUid` | `createdAt`>>): Promise<IGameObjectTemplate>;

    /**
     * @brief Delete a template and its associated definition nodes without deleting instances
     * @param uid string Template uid @example 'tpl_factory_abc123'
     * @returns Promise_boolean True if deleted or false if not found
     */
    Delete(uid: string): Promise<boolean>;
}
