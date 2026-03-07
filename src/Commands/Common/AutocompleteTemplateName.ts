import type { AutocompleteInteraction } from 'discord.js';
import { ListGamesForServer } from '../../Flow/Object/Game/ListGamesForServer.js';
import { GameObjectTemplateRepository } from '../../Repository/GameObject/GameObjectTemplateRepository.js';
import { templateTagService } from '../../Services/TemplateTagService.js';
import { Log } from '../../Common/Log.js';
import type { IGameObjectTemplate } from '../../Domain/GameObject/Entity/IGameObjectTemplate.js';

const LOG_TAG = `AutocompleteTemplateName`;
const MAX_SUGGESTIONS = 25;
const TAG_PREFIX = `#`;
const TAG_SEPARATOR = `/`;

function FormatTagBadge(template: IGameObjectTemplate): string {
    if (!template.tags || template.tags.length === 0) {
        return template.name;
    }

    const tagLabels = template.tags.map(tagPath => {
        return tagPath.join(TAG_SEPARATOR);
    });

    return `${template.name} [${tagLabels.join(` `)}]`;
}

export async function AutocompleteTemplateName(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name !== `template`) {
        await interaction.respond([]);
        return;
    }

    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.respond([]);
        return;
    }

    try {
        const games = await ListGamesForServer(serverId);
        const game = games[0];
        if (!game) {
            await interaction.respond([]);
            return;
        }

        const templateRepository = new GameObjectTemplateRepository();
        const templates = await templateRepository.ListByGame(game.uid);
        const userInput = focusedOption.value.trim();

        let filteredTemplates: IGameObjectTemplate[];

        if (userInput.startsWith(TAG_PREFIX)) {
            const tagQuery = userInput.substring(1).toLowerCase();
            const tagPath = tagQuery.split(TAG_SEPARATOR).filter(segment => {
                return segment.length > 0;
            });

            if (tagPath.length === 0) {
                filteredTemplates = templates;
            } else {
                const matchingUids = new Set(templateTagService.QueryTemplates(game.uid, tagPath));
                filteredTemplates = templates.filter(template => {
                    return matchingUids.has(template.uid);
                });
            }
        } else {
            const lowerInput = userInput.toLowerCase();
            filteredTemplates = templates.filter(template => {
                return template.name.toLowerCase().includes(lowerInput);
            });
        }

        const suggestions = filteredTemplates
            .slice(0, MAX_SUGGESTIONS)
            .map(template => {
                return {
                    name: FormatTagBadge(template).substring(0, 100),
                    value: template.name,
                };
            });

        await interaction.respond(suggestions);
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Autocomplete failed: ${message}`, LOG_TAG);
        await interaction.respond([]);
    }
}
