import { MessageFlags, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { InteractionExecutionContextCarrier } from '../../Common/Type/Interaction.js';
import { Log } from '../../Common/Log.js';
import { ListGamesForServer } from '../../Flow/Object/Game/ListGamesForServer.js';
import { ValidateTemplateJson, CastTemplateJson } from '../../Flow/GameObject/ValidateTemplateJson.js';
import { AnalyzeMerge, ExecuteMerge, type IMergeAnalysisResult } from '../../Flow/GameObject/MergeTemplate.js';
import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import { GameObjectRepository } from '../../Repository/GameObject/GameObjectRepository.js';
import { TranslateFromContext } from '../../Services/I18nService.js';
import type { IActionDefinition } from '../../Domain/GameObject/Action/IActionDefinition.js';
import type { ITemplateDisplayConfig } from '../../Domain/GameObject/Display/ITemplateDisplayConfig.js';
import type { TagPath } from '../../Domain/Tag/index.js';
import { templateTagService } from '../../Services/TemplateTagService.js';

/** Log tag for this module */
const LOG_TAG = `Commands/Import/Template`;

/**
 * @brief Execute the import template subcommand
 * @param interaction InteractionExecutionContextCarrier Discord interaction
 * @returns void
 */
export async function ExecuteImportTemplate(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;

    if (!serverId) {
        await interaction.reply({
            content: `This command can only be used in a server.`,
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
        // Resolve the game for this server
        const games = await ListGamesForServer(serverId);
        const game = games[0];

        if (!game) {
            await interaction.editReply({ content: `No game found for this server. Create a game first.` });
            return;
        }

        // Get the attached file
        const attachment = interaction.options.getAttachment(`file`, true);

        if (!attachment.name.endsWith(`.json`)) {
            await interaction.editReply({ content: `Attachment must be a .json file.` });
            return;
        }

        // Download and parse the JSON
        const response = await fetch(attachment.url);

        if (!response.ok) {
            await interaction.editReply({ content: `Failed to download the attachment.` });
            return;
        }

        const rawText = await response.text();
        let parsedJson: unknown;

        try {
            parsedJson = JSON.parse(rawText);
        } catch(_parseError) {
            await interaction.editReply({ content: `Invalid JSON. Check your file syntax.` });
            return;
        }

        // Validate the template structure
        const validationResult = ValidateTemplateJson(parsedJson);

        if (!validationResult.valid) {
            const errorSummary = validationResult.errors.slice(0, 5).join(`\n`);
            await interaction.editReply({
                content: `Template validation failed:\n\`\`\`\n${errorSummary}\n\`\`\``,
            });
            return;
        }

        // Cast to typed schema
        const templateSchema = CastTemplateJson(parsedJson);
        const templateRepository = new GameObjectTemplateRepository();
        const objectRepository = new GameObjectRepository();

        // Build action definitions with defaults
        const actionDefinitions: IActionDefinition[] = (templateSchema.actions ?? []).map(action => {
            return {
                ...action,
                priority: action.priority ?? 0,
                enabled: action.enabled ?? true,
            };
        });

        // Cast displayConfig from JSON schema to domain type
        const displayConfig: ITemplateDisplayConfig | undefined = templateSchema.displayConfig
            ? {
                styleConfig: templateSchema.displayConfig.styleConfig,
                groups: templateSchema.displayConfig.groups,
                parameterDisplay: templateSchema.displayConfig.parameterDisplay,
            }
            : undefined;

        const tags: TagPath[] = (templateSchema.tags ?? []).map(tagString => {
            return tagString.split(`/`).map(segment => {
                return segment.trim().toLowerCase();
            }).filter(segment => {
                return segment.length > 0;
            });
        });

        // Check if a template with the same name already exists
        const existingTemplate = await templateRepository.FindByName(game.uid, templateSchema.name);

        if (existingTemplate) {
            // Merge flow analyze diff
            const analysis = await AnalyzeMerge(
                existingTemplate,
                templateSchema.parameters,
                actionDefinitions,
                objectRepository,
            );

            if (analysis.hasDestructiveChanges) {
                // Show diff and ask for confirmation
                const diffSummary = __BuildMergeDiffSummary(analysis);

                const confirmButton = new ButtonBuilder()
                    .setCustomId(`merge_confirm_${existingTemplate.uid}`)
                    .setLabel(`Confirm Merge`)
                    .setStyle(ButtonStyle.Danger);

                const cancelButton = new ButtonBuilder()
                    .setCustomId(`merge_cancel_${existingTemplate.uid}`)
                    .setLabel(`Cancel`)
                    .setStyle(ButtonStyle.Secondary);

                const row = new ActionRowBuilder<ButtonBuilder>().addComponents(confirmButton, cancelButton);

                const confirmMessage = await interaction.editReply({
                    content: `Template **${templateSchema.name}** already exists with ${analysis.affectedObjectCount} instances.\n\n**Destructive changes detected:**\n${diffSummary}\n\nProceed with merge?`,
                    components: [row],
                });

                // Await button click (60 seconds timeout)
                try {
                    const buttonInteraction = await confirmMessage.awaitMessageComponent({
                        componentType: ComponentType.Button,
                        time: 60_000,
                        filter: (buttonEvent) => {
                            return buttonEvent.user.id === interaction.user.id;
                        },
                    });

                    if (buttonInteraction.customId.startsWith(`merge_confirm_`)) {
                        await buttonInteraction.deferUpdate();

                        const mergeResult = await ExecuteMerge(
                            existingTemplate,
                            templateSchema.parameters,
                            actionDefinitions,
                            templateSchema.description ?? ``,
                            templateRepository,
                            objectRepository,
                            displayConfig,
                            tags,
                            analysis.affectedObjects,
                        );

                        if (mergeResult.success) {
                            __SyncTagsAfterMerge(existingTemplate.gameUid, existingTemplate.uid, tags);
                            await interaction.editReply({
                                content: `Template **${templateSchema.name}** merged. ${mergeResult.migratedObjectCount} objects migrated.`,
                                components: [],
                            });
                        } else {
                            await interaction.editReply({
                                content: `Merge failed: ${mergeResult.error}`,
                                components: [],
                            });
                        }
                    } else {
                        await buttonInteraction.deferUpdate();
                        await interaction.editReply({
                            content: `Merge cancelled.`,
                            components: [],
                        });
                    }
                } catch(_timeoutError) {
                    await interaction.editReply({
                        content: `Merge timed out. No changes were made.`,
                        components: [],
                    });
                }
            } else {
                // Non destructive merge execute directly
                const mergeResult = await ExecuteMerge(
                    existingTemplate,
                    templateSchema.parameters,
                    actionDefinitions,
                    templateSchema.description ?? ``,
                    templateRepository,
                    objectRepository,
                    displayConfig,
                    tags,
                    analysis.affectedObjects,
                );

                if (mergeResult.success) {
                    __SyncTagsAfterMerge(existingTemplate.gameUid, existingTemplate.uid, tags);
                    await interaction.editReply({
                        content: `Template **${templateSchema.name}** updated (merged). ${mergeResult.migratedObjectCount} objects migrated. No destructive changes.`,
                    });
                } else {
                    await interaction.editReply({
                        content: `Merge failed: ${mergeResult.error}`,
                    });
                }
            }

            return;
        }

        // New template create fresh
        const created = await templateRepository.Create({
            gameUid: game.uid,
            name: templateSchema.name,
            description: templateSchema.description ?? ``,
            parameters: templateSchema.parameters,
            actions: actionDefinitions,
            displayConfig,
            tags,
        });

        for (const tagPath of tags) {
            templateTagService.AddTag(game.uid, created.uid, tagPath);
        }

        await interaction.editReply({
            content: `Template **${created.name}** created (uid: \`${created.uid}\`). ${created.parameters.length} parameters, ${created.actions.length} actions defined.`,
        });

        Log.info(`Template "${created.name}" created for game "${game.uid}".`, LOG_TAG);
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to upload template: ${message}`, LOG_TAG, `ExecuteImportTemplate`);
        await interaction.editReply({ content: `Failed to create template: ${message}` });
    }
}

/**
 * @brief Build a human readable summary of merge diff changes
 * @param analysis IMergeAnalysisResult Diff analysis
 * @returns string Formatted diff summary for Discord message
 */
function __BuildMergeDiffSummary(analysis: IMergeAnalysisResult): string {
    const lines: string[] = [];

    for (const paramChange of analysis.parameterChanges) {
        switch (paramChange.change) {
            case `removed`:
                lines.push(`- Parameter \`${paramChange.key}\` will be **removed** from ${analysis.affectedObjectCount} objects.`);
                break;
            case `typeChanged`:
                lines.push(`- Parameter \`${paramChange.key}\` type changed: ${paramChange.oldType} -> ${paramChange.newType}.`);
                break;
            case `added`:
                lines.push(`+ Parameter \`${paramChange.key}\` will be added (default: ${paramChange.newDefault}).`);
                break;
        }
    }

    for (const actionChange of analysis.actionChanges) {
        switch (actionChange.change) {
            case `removed`:
                lines.push(`- Action \`${actionChange.key}\` will be **removed**.`);
                break;
            case `added`:
                lines.push(`+ Action \`${actionChange.key}\` will be added.`);
                break;
            case `updated`:
                lines.push(`~ Action \`${actionChange.key}\` will be updated.`);
                break;
        }
    }

    return lines.length > 0 ? `\`\`\`diff\n${lines.join(`\n`)}\n\`\`\`` : `No significant changes.`;
}

function __SyncTagsAfterMerge(gameUid: string, templateUid: string, newTags: TagPath[]): void {
    const existingTags = templateTagService.GetTemplateTags(templateUid);
    for (const existingTag of existingTags) {
        templateTagService.RemoveTag(gameUid, templateUid, existingTag);
    }
    for (const tagPath of newTags) {
        templateTagService.AddTag(gameUid, templateUid, tagPath);
    }
}
