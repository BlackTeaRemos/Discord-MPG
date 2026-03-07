import { Log } from '../../Common/Log.js';
import type { ActionTrigger, IActionDefinition } from '../../Domain/GameObject/Action/IActionDefinition.js';
import type { IActionExecutionResult, IActionExecutionError } from '../../Domain/GameObject/Action/IActionExecutionResult.js';
import type { IGameObject } from '../../Domain/GameObject/Entity/IGameObject.js';
import type { IGameObjectTemplate } from '../../Domain/GameObject/Entity/IGameObjectTemplate.js';
import type { IParameterValue } from '../../Domain/GameObject/Entity/IParameterValue.js';
import type { ITurnActionEngine } from '../../Domain/GameObject/Action/ITurnActionEngine.js';
import type { IGameObjectRepository } from '../../Domain/GameObject/Repository/IGameObjectRepository.js';
import type { IGameObjectTemplateRepository } from '../../Domain/GameObject/Repository/IGameObjectTemplateRepository.js';
import { ExpressionEvaluator, type CrossObjectState, type OrganizationScopedCrossObjectState } from './ExpressionEvaluator.js';

/** Module level tag for logging */
const LOG_TAG = `Flow/GameObject/TurnActionEngine`;

/** @brief Turn action engine implementation using injected repositories for decoupled data access */
export class TurnActionEngine implements ITurnActionEngine {
    /** Expression evaluator used for action processing */
    private readonly _evaluator: ExpressionEvaluator;

    /**
     * @brief Create a TurnActionEngine
     * @param _objectRepository IGameObjectRepository Repository for game object instances
     * @param _templateRepository IGameObjectTemplateRepository Repository for templates
     */
    constructor(
        private readonly _objectRepository: IGameObjectRepository,
        private readonly _templateRepository: IGameObjectTemplateRepository,
    ) {
        this._evaluator = new ExpressionEvaluator();
    }

    /**
     * @brief Execute all actions matching the trigger for every object in a game with cross object state for inter object references
     * @param gameUid string Game to process
     * @param trigger ActionTrigger Event type to fire
     * @returns Promise<IActionExecutionResult[]> Results per object action pair
     * @example
     * const results = await engine.Execute('game_xyz', 'onTurnAdvance');
     */
    public async Execute(gameUid: string, trigger: ActionTrigger): Promise<IActionExecutionResult[]> {
        const allResults: IActionExecutionResult[] = [];
        const batchUpdates: Array<{ objectUid: string; parameters: IParameterValue[] }> = [];

        try {
            const objects = await this._objectRepository.ListByGame(gameUid);

            if (objects.length === 0) {
                Log.info(`No objects found for game "${gameUid}". Nothing to process.`, LOG_TAG);
                return allResults;
            }

            // Cache templates to avoid redundant fetches
            const templateCache = new Map<string, IGameObjectTemplate>();

            // Resolve all templates upfront and build cross object state
            for (const gameObject of objects) {
                await this.__ResolveTemplate(gameObject.templateUid, templateCache);
            }

            const crossObjectState = this.__BuildCrossObjectState(objects, templateCache);
            const crossObjectIndexMap = this.__BuildCrossObjectIndexMap(objects, templateCache);
            const organizationCrossObjectMap = this.__BuildOrganizationCrossObjectMap(objects, templateCache);

            for (const gameObject of objects) {
                const template = templateCache.get(gameObject.templateUid);

                if (!template) {
                    Log.warning(`Template "${gameObject.templateUid}" not found for object "${gameObject.uid}". Skipping.`, LOG_TAG);
                    continue;
                }

                const matchingActions = this.__FilterAndSortActions(template.actions, trigger);

                if (matchingActions.length === 0) {
                    continue;
                }

                const objectResults = this.__ExecuteActionsForObject(
                    gameObject,
                    matchingActions,
                    objects,
                    templateCache,
                    crossObjectState,
                    batchUpdates,
                    organizationCrossObjectMap.get(gameObject.organizationUid),
                );
                allResults.push(...objectResults);

                this.__UpdateCrossObjectState(
                    gameObject,
                    crossObjectState,
                    crossObjectIndexMap,
                    batchUpdates,
                );
            }

            // Persist all parameter changes in one transaction
            if (batchUpdates.length > 0) {
                await this._objectRepository.BatchUpdateParameters(batchUpdates);
                Log.info(`Persisted parameter updates for ${batchUpdates.length} objects.`, LOG_TAG);
            }
        } catch(error) {
            Log.error(`Turn engine execution failed: ${String(error)}`, LOG_TAG, `Execute`);
            throw error;
        }

        return allResults;
    }

    /**
     * @brief Resolve a template by uid using cache to avoid redundant reads
     * @param templateUid string Template identifier
     * @param cache Map<string, IGameObjectTemplate> Local cache
     * @returns Promise<IGameObjectTemplate | null> Template or null
     */
    private async __ResolveTemplate(
        templateUid: string,
        cache: Map<string, IGameObjectTemplate>,
    ): Promise<IGameObjectTemplate | null> {
        if (cache.has(templateUid)) {
            return cache.get(templateUid)!;
        }

        const template = await this._templateRepository.GetByUid(templateUid);

        if (template) {
            cache.set(templateUid, template);
        }

        return template;
    }

    /**
     * @brief Filter actions by trigger and sort by priority
     * @param actions IActionDefinition[] All actions from the template
     * @param trigger ActionTrigger Target trigger type
     * @returns IActionDefinition[] Filtered and sorted actions
     */
    private __FilterAndSortActions(
        actions: IActionDefinition[],
        trigger: ActionTrigger,
    ): IActionDefinition[] {
        return actions
            .filter(action => {
                return action.trigger === trigger && action.enabled;
            })
            .sort((actionA, actionB) => {
                return actionA.priority - actionB.priority;
            });
    }

    /**
     * @brief Execute all actions for one object accumulating remote state across actions and queuing batch updates only after all actions complete
     * @param gameObject IGameObject The source object instance
     * @param actions IActionDefinition array Sorted actions to execute
     * @param allObjects IGameObject array All game objects in the game
     * @param templateCache Map of templateUid to IGameObjectTemplate
     * @param crossObjectState CrossObjectState Cross object state for remote references in RHS
     * @param batchUpdates Array Accumulator for batch persistence updates
     * @returns IActionExecutionResult array One result per action
     */
    private __ExecuteActionsForObject(
        gameObject: IGameObject,
        actions: IActionDefinition[],
        allObjects: IGameObject[],
        templateCache: Map<string, IGameObjectTemplate>,
        crossObjectState: CrossObjectState,
        batchUpdates: Array<{ objectUid: string; parameters: IParameterValue[] }>,
        organizationScopedState?: OrganizationScopedCrossObjectState,
    ): IActionExecutionResult[] {
        const results: IActionExecutionResult[] = [];

        const sourceState = this.__BuildNumericState(gameObject.parameters);

        const mutatedRemoteStates = new Map<string, { object: IGameObject; state: Record<string, number> }>();

        for (const action of actions) {
            const executionErrors: IActionExecutionError[] = [];
            let actionSucceeded = true;

            for (const expression of action.expressions) {
                const target = this._evaluator.ParseTarget(expression);

                if (target.isInlineTarget && target.templateName && target.remoteKey) {
                    let remoteObjects = this.__FindObjectsByTemplateName(
                        target.templateName,
                        allObjects,
                        templateCache,
                    );

                    if (target.isOrganizationScoped) {
                        const sourceOrgUid = gameObject.organizationUid;
                        remoteObjects = remoteObjects.filter(remoteObject => {
                            return remoteObject.organizationUid === sourceOrgUid;
                        });
                    }

                    if (remoteObjects.length === 0) {
                        const scopeLabel = target.isOrganizationScoped ? `organization-scoped ` : ``;
                        executionErrors.push({
                            expression,
                            message: `No objects found for ${scopeLabel}inline target template "${target.templateName}".`,
                        });
                        actionSucceeded = false;
                        break;
                    }

                    for (const remoteObject of remoteObjects) {
                        let remoteEntry = mutatedRemoteStates.get(remoteObject.uid);
                        if (!remoteEntry) {
                            remoteEntry = {
                                object: remoteObject,
                                state: this.__BuildNumericState(remoteObject.parameters),
                            };
                            mutatedRemoteStates.set(remoteObject.uid, remoteEntry);
                        }

                        const expressionResult = this._evaluator.Evaluate(
                            sourceState,
                            expression,
                            crossObjectState,
                            remoteEntry.state,
                            organizationScopedState,
                        );

                        if (!expressionResult.success) {
                            actionSucceeded = false;
                            executionErrors.push({
                                expression,
                                message: expressionResult.error ?? `Unknown error on inline target.`,
                            });
                            break;
                        }
                    }

                    if (!actionSucceeded) {
                        break;
                    }
                } else {
                    const expressionResult = this._evaluator.Evaluate(
                        sourceState,
                        expression,
                        crossObjectState,
                        undefined,
                        organizationScopedState,
                    );

                    if (!expressionResult.success) {
                        actionSucceeded = false;
                        executionErrors.push({
                            expression,
                            message: expressionResult.error ?? `Unknown error.`,
                        });
                        break;
                    }
                }
            }

            const updatedSourceParameters: IParameterValue[] = gameObject.parameters.map(parameter => {
                if (parameter.key in sourceState) {
                    return { key: parameter.key, value: sourceState[parameter.key] };
                }
                return { ...parameter };
            });

            results.push({
                objectUid: gameObject.uid,
                actionKey: action.key,
                success: actionSucceeded,
                updatedParameters: updatedSourceParameters,
                errors: executionErrors,
                executedAt: new Date().toISOString(),
            });
        }

        const finalSourceParameters: IParameterValue[] = gameObject.parameters.map(parameter => {
            if (parameter.key in sourceState) {
                return { key: parameter.key, value: sourceState[parameter.key] };
            }
            return { ...parameter };
        });
        this.__QueueBatchUpdate(batchUpdates, gameObject.uid, finalSourceParameters);

        for (const [remoteUid, remoteEntry] of mutatedRemoteStates) {
            const updatedRemoteParameters: IParameterValue[] = remoteEntry.object.parameters.map(parameter => {
                if (parameter.key in remoteEntry.state) {
                    return { key: parameter.key, value: remoteEntry.state[parameter.key] };
                }
                return { ...parameter };
            });
            this.__QueueBatchUpdate(batchUpdates, remoteUid, updatedRemoteParameters);
        }

        return results;
    }

    /**
     * @brief Find all game objects created from a template with the given name
     * @param templateName string Template name to match
     * @param allObjects IGameObject[] All game objects
     * @param templateCache Map<string, IGameObjectTemplate> Cached templates
     * @returns IGameObject[] Matching objects
     */
    private __FindObjectsByTemplateName(
        templateName: string,
        allObjects: IGameObject[],
        templateCache: Map<string, IGameObjectTemplate>,
    ): IGameObject[] {
        return allObjects.filter(gameObject => {
            const template = templateCache.get(gameObject.templateUid);
            return template?.name === templateName;
        });
    }

    /**
     * @brief Queue or replace a batch update entry for an object where last write wins
     * @param batchUpdates Array Accumulator array
     * @param objectUid string Object UID
     * @param parameters IParameterValue[] Updated parameters
     */
    private __QueueBatchUpdate(
        batchUpdates: Array<{ objectUid: string; parameters: IParameterValue[] }>,
        objectUid: string,
        parameters: IParameterValue[],
    ): void {
        const existingIndex = batchUpdates.findIndex(entry => {
            return entry.objectUid === objectUid;
        });
        if (existingIndex >= 0) {
            batchUpdates[existingIndex] = { objectUid, parameters };
        } else {
            batchUpdates.push({ objectUid, parameters });
        }
    }

    /**
     * @brief Build the cross object state map for expression evaluation grouping all objects by template name with numeric parameter maps
     * @param allObjects IGameObject[] All objects in the game
     * @param templateCache Map<string, IGameObjectTemplate> Cached templates
     * @returns CrossObjectState Template name keyed map of parameter arrays
     */
    private __BuildCrossObjectState(
        allObjects: IGameObject[],
        templateCache: Map<string, IGameObjectTemplate>,
    ): CrossObjectState {
        const state: CrossObjectState = {};

        for (const gameObject of allObjects) {
            const template = templateCache.get(gameObject.templateUid);

            if (!template) {
                continue;
            }

            if (!state[template.name]) {
                state[template.name] = [];
            }

            state[template.name].push(this.__BuildNumericState(gameObject.parameters));
        }

        return state;
    }

    /**
     * @brief Builds a map from organization UID to a cross object state containing only objects owned by that organization
     * @param allObjects IGameObject array All objects in the game
     * @param templateCache Map of templateUid to IGameObjectTemplate
     * @returns Map of organizationUid to OrganizationScopedCrossObjectState
     */
    private __BuildOrganizationCrossObjectMap(
        allObjects: IGameObject[],
        templateCache: Map<string, IGameObjectTemplate>,
    ): Map<string, OrganizationScopedCrossObjectState> {
        const organizationMap = new Map<string, OrganizationScopedCrossObjectState>();

        for (const gameObject of allObjects) {
            const template = templateCache.get(gameObject.templateUid);
            if (!template) {
                continue;
            }

            const orgUid = gameObject.organizationUid;
            let orgState = organizationMap.get(orgUid);
            if (!orgState) {
                orgState = {};
                organizationMap.set(orgUid, orgState);
            }

            if (!orgState[template.name]) {
                orgState[template.name] = [];
            }

            orgState[template.name].push(this.__BuildNumericState(gameObject.parameters));
        }

        return organizationMap;
    }

    /**
     * @brief Converts parameter values to a mutable numeric state map coercing strings and booleans
     * @param parameters IParameterValue array Source parameter values
     * @returns Record of string to number Numeric state map for expression evaluation
     */
    private __BuildNumericState(parameters: IParameterValue[]): Record<string, number> {
        const numericState: Record<string, number> = {};

        for (const parameter of parameters) {
            if (typeof parameter.value === `number`) {
                numericState[parameter.key] = parameter.value;
            } else if (typeof parameter.value === `boolean`) {
                numericState[parameter.key] = parameter.value ? 1 : 0;
            } else if (typeof parameter.value === `string`) {
                const parsed = parseFloat(parameter.value);
                if (!isNaN(parsed)) {
                    numericState[parameter.key] = parsed;
                }
            }
        }

        return numericState;
    }

    /**
     * @brief Refreshes the crossObjectState entry for a just-processed object using its queued batch update state
     * @param gameObject IGameObject The object that was just processed
     * @param crossObjectState CrossObjectState Mutable cross object state to update
     * @param indexMap Map of objectUid to templateName and array index
     * @param batchUpdates Array Queued batch updates containing the latest parameter state
     */
    private __UpdateCrossObjectState(
        gameObject: IGameObject,
        crossObjectState: CrossObjectState,
        indexMap: Map<string, { templateName: string; index: number }>,
        batchUpdates: Array<{ objectUid: string; parameters: IParameterValue[] }>,
    ): void {
        const queuedUpdate = batchUpdates.find(entry => {
            return entry.objectUid === gameObject.uid;
        });

        if (!queuedUpdate) {
            return;
        }

        const mapping = indexMap.get(gameObject.uid);
        if (!mapping) {
            return;
        }

        const templateObjects = crossObjectState[mapping.templateName];
        if (!templateObjects || mapping.index >= templateObjects.length) {
            return;
        }

        templateObjects[mapping.index] = this.__BuildNumericState(queuedUpdate.parameters);
    }

    /**
     * @brief Builds a map from object UID to its position in the crossObjectState arrays
     * @param allObjects IGameObject array All objects in the game
     * @param templateCache Map of templateUid to IGameObjectTemplate
     * @returns Map of objectUid to templateName and array index
     */
    private __BuildCrossObjectIndexMap(
        allObjects: IGameObject[],
        templateCache: Map<string, IGameObjectTemplate>,
    ): Map<string, { templateName: string; index: number }> {
        const indexMap = new Map<string, { templateName: string; index: number }>();
        const templateCounters = new Map<string, number>();

        for (const gameObject of allObjects) {
            const template = templateCache.get(gameObject.templateUid);
            if (!template) {
                continue;
            }

            const currentIndex = templateCounters.get(template.name) ?? 0;
            indexMap.set(gameObject.uid, { templateName: template.name, index: currentIndex });
            templateCounters.set(template.name, currentIndex + 1);
        }

        return indexMap;
    }

}
