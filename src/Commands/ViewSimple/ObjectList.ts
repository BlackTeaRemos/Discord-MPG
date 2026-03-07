import { MessageFlags } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { InteractionExecutionContextCarrier } from '../../Common/Type/Interaction.js';
import { ListGamesForServer } from '../../Flow/Object/Game/ListGamesForServer.js';
import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import { GameObjectRepository } from '../../Repository/GameObject/GameObjectRepository.js';
import { ObjectProjectionRepository } from '../../Repository/GameObject/ObjectProjectionRepository.js';
import { Log } from '../../Common/Log.js';
import { ResolveViewAccess } from './ResolveViewAccess.js';
import { TranslateFromContext } from '../../Services/I18nService.js';
import { ObjectViewRenderer } from '../../Framework/ObjectView/ObjectViewRenderer.js';
import type { ObjectViewModel, ObjectViewPage } from '../../Framework/ObjectView/ObjectViewTypes.js';

/** Maximum number of objects displayed per page */
const MAX_OBJECTS_PER_PAGE = 25;

/** Shared renderer instance for object list views */
const _objectListViewRenderer = new ObjectViewRenderer(`objlist_view`);

/**
 * @brief List game object instances for the current server game
 * @param interaction InteractionExecutionContextCarrier Discord interaction
 * @returns void Resolves when the object list is displayed
 * @example /view objects
 * @example /view objects template:Factory
 */
export async function ExecuteViewObjectList(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.reply({
            content: TranslateFromContext(interaction.executionContext, `commands.view.objectList.errors.serverOnly`),
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
                content: TranslateFromContext(interaction.executionContext, `commands.view.objectList.errors.noGame`),
            });
            return;
        }

        const requestedOrganizationUid = interaction.options.getString(`organization`)?.trim() || null;
        const access = await ResolveViewAccess({
            interaction,
            action: `view`,
            requestedOrganizationUid,
        });
        if (!access) {
            return;
        }

        const templateFilterName = interaction.options.getString(`template`)?.trim() || null;
        let resolvedTemplateUid: string | undefined;

        if (templateFilterName) {
            const templateRepository = new GameObjectTemplateRepository();
            const matchedTemplate = await templateRepository.FindByName(game.uid, templateFilterName);
            if (!matchedTemplate) {
                await interaction.editReply({
                    content: TranslateFromContext(interaction.executionContext, `commands.view.objectList.errors.templateNotFound`, {
                        params: { name: templateFilterName },
                    }),
                });
                return;
            }
            resolvedTemplateUid = matchedTemplate.uid;
        }

        const objectRepository = new GameObjectRepository();
        const objects = await objectRepository.ListByGame(game.uid, {
            organizationUid: access.organizationUid || undefined,
            templateUid: resolvedTemplateUid,
        });

        if (objects.length === 0) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.view.objectList.errors.noObjects`),
            });
            return;
        }

        const projectionNameMap = new Map<string, string>();
        if (access.organizationUid) {
            const projectionRepository = new ObjectProjectionRepository();
            const orgProjections = await projectionRepository.ListByOrganization(
                access.organizationUid,
                { status: `ACTIVE` },
            );
            for (const projection of orgProjections) {
                projectionNameMap.set(projection.objectUid, projection.name);
            }
        }

        const templateRepository = new GameObjectTemplateRepository();
        const templateNameCache = new Map<string, string>();

        const titleLabel = TranslateFromContext(interaction.executionContext, `commands.view.objectList.labels.title`);
        const templateLabel = TranslateFromContext(interaction.executionContext, `commands.view.objectList.labels.template`);
        const countLabel = TranslateFromContext(interaction.executionContext, `commands.view.objectList.labels.count`, {
            params: { count: String(objects.length) },
        });

        const totalPages = Math.ceil(objects.length / MAX_OBJECTS_PER_PAGE);
        const pages: ObjectViewPage[] = [];

        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const pageObjects = objects.slice(
                pageIndex * MAX_OBJECTS_PER_PAGE,
                (pageIndex + 1) * MAX_OBJECTS_PER_PAGE,
            );

            const objectLines: string[] = [];
            for (const gameObject of pageObjects) {
                let templateName = templateNameCache.get(gameObject.templateUid);
                if (!templateName) {
                    const objectTemplate = await templateRepository.GetByUid(gameObject.templateUid);
                    templateName = objectTemplate?.name ?? `Unknown`;
                    templateNameCache.set(gameObject.templateUid, templateName);
                }

                objectLines.push(`**${projectionNameMap.get(gameObject.uid) ?? gameObject.name}** (${templateName}) \`${gameObject.uid}\``);
            }

            const headerLine = templateFilterName
                ? `${countLabel} | ${templateLabel}: ${templateFilterName}`
                : countLabel;

            const pageDescription = `${headerLine}\n\n${objectLines.join(`\n`)}`;

            pages.push({
                description: pageDescription,
            });
        }

        const viewModel: ObjectViewModel = {
            id: `object_list`,
            objectType: `building`,
            name: titleLabel,
            pages,
        };

        await _objectListViewRenderer.RenderInitial(interaction, viewModel);
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to list objects`, message, `ViewObjectList`);
        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.view.objectList.errors.failed`, {
                params: { message },
            }),
        });
    }
}
