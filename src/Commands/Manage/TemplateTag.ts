import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { InteractionExecutionContextCarrier } from '../../Common/Type/Interaction.js';
import { ListGamesForServer } from '../../Flow/Object/Game/ListGamesForServer.js';
import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import { templateTagService } from '../../Services/TemplateTagService.js';
import { Log } from '../../Common/Log.js';
import { TranslateFromContext } from '../../Services/I18nService.js';
import type { TagPath } from '../../Domain/Tag/index.js';

const LOG_TAG = `ManageTemplateTag`;

function ParseTagPath(rawTag: string): TagPath {
    return rawTag
        .split(`/`)
        .map(segment => {
            return segment.trim().toLowerCase();
        })
        .filter(segment => {
            return segment.length > 0;
        });
}

function FormatTagPath(tagPath: TagPath): string {
    return tagPath.join(`/`);
}

export async function ExecuteTagAdd(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.reply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.serverOnly`),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
        const games = await ListGamesForServer(serverId);
        const game = games[0];
        if (!game) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.noGame`),
            });
            return;
        }

        const templateName = interaction.options.getString(`template`, true).trim();
        const rawTag = interaction.options.getString(`tag`, true).trim();
        const tagPath = ParseTagPath(rawTag);

        if (tagPath.length === 0) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.emptyTag`),
            });
            return;
        }

        const templateRepository = new GameObjectTemplateRepository();
        const template = await templateRepository.FindByName(game.uid, templateName);
        if (!template) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.templateNotFound`, {
                    params: { name: templateName },
                }),
            });
            return;
        }

        templateTagService.AddTag(game.uid, template.uid, tagPath);
        const updatedTags = templateTagService.GetTemplateTags(template.uid);
        await templateRepository.Update(template.uid, { tags: updatedTags });

        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.tagAdd.success`, {
                params: { tag: FormatTagPath(tagPath), template: template.name },
            }),
        });
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to add template tag`, message, LOG_TAG);
        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.failed`, {
                params: { message },
            }),
        });
    }
}

export async function ExecuteTagRemove(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.reply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.serverOnly`),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
        const games = await ListGamesForServer(serverId);
        const game = games[0];
        if (!game) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.noGame`),
            });
            return;
        }

        const templateName = interaction.options.getString(`template`, true).trim();
        const rawTag = interaction.options.getString(`tag`, true).trim();
        const tagPath = ParseTagPath(rawTag);

        if (tagPath.length === 0) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.emptyTag`),
            });
            return;
        }

        const templateRepository = new GameObjectTemplateRepository();
        const template = await templateRepository.FindByName(game.uid, templateName);
        if (!template) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.templateNotFound`, {
                    params: { name: templateName },
                }),
            });
            return;
        }

        const removed = templateTagService.RemoveTag(game.uid, template.uid, tagPath);
        if (!removed) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.tagRemove.notFound`, {
                    params: { tag: FormatTagPath(tagPath), template: template.name },
                }),
            });
            return;
        }

        const updatedTags = templateTagService.GetTemplateTags(template.uid);
        await templateRepository.Update(template.uid, { tags: updatedTags });

        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.tagRemove.success`, {
                params: { tag: FormatTagPath(tagPath), template: template.name },
            }),
        });
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to remove template tag`, message, LOG_TAG);
        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.failed`, {
                params: { message },
            }),
        });
    }
}

export async function ExecuteTagList(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.reply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.serverOnly`),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
        const games = await ListGamesForServer(serverId);
        const game = games[0];
        if (!game) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.noGame`),
            });
            return;
        }

        const templateName = interaction.options.getString(`template`)?.trim() || null;

        if (templateName) {
            const templateRepository = new GameObjectTemplateRepository();
            const template = await templateRepository.FindByName(game.uid, templateName);
            if (!template) {
                await interaction.editReply({
                    content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.templateNotFound`, {
                        params: { name: templateName },
                    }),
                });
                return;
            }

            const tags = templateTagService.GetTemplateTags(template.uid);
            if (tags.length === 0) {
                await interaction.editReply({
                    content: TranslateFromContext(interaction.executionContext, `commands.manage.template.tagList.noTags`, {
                        params: { template: template.name },
                    }),
                });
                return;
            }

            const tagLines = tags.map(tagPath => {
                return `\`${FormatTagPath(tagPath)}\``;
            });
            const title = TranslateFromContext(interaction.executionContext, `commands.manage.template.tagList.title`, {
                params: { template: template.name },
            });
            await interaction.editReply({ content: `**${title}**\n${tagLines.join(`\n`)}` });
            return;
        }

        const allTags = templateTagService.ListAllTags(game.uid);
        if (allTags.length === 0) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.template.tagList.noTagsInGame`),
            });
            return;
        }

        const tagLines = allTags.map(tagPath => {
            return `\`${FormatTagPath(tagPath)}\``;
        });
        const title = TranslateFromContext(interaction.executionContext, `commands.manage.template.tagList.allTitle`);
        await interaction.editReply({ content: `**${title}**\n${tagLines.join(`\n`)}` });
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to list template tags`, message, LOG_TAG);
        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.template.errors.failed`, {
                params: { message },
            }),
        });
    }
}
