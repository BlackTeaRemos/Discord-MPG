import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import type { AutocompleteInteraction, ChatInputCommandInteraction } from 'discord.js';
import type { TokenSegmentInput } from '../../Common/Permission/index.js';
import type { InteractionExecutionContextCarrier } from '../../Common/Type/Interaction.js';
import { ExecuteManageGame } from './Game.js';
import { ExecuteTagAdd, ExecuteTagRemove, ExecuteTagList } from './TemplateTag.js';
import { ExecuteDiplomacySet, ExecuteDiplomacyList } from './Diplomacy.js';
import { AutocompleteTemplateName } from '../Common/AutocompleteTemplateName.js';
import { AutocompleteOrganization } from '../Common/AutocompleteOrganization.js';
import { Translate, TranslateFromContext, BuildLocalizations } from '../../Services/I18nService.js';

export const data = new SlashCommandBuilder()
    .setName(`manage`)
    .setDescription(Translate(`commands.manage.description`))
    .setDescriptionLocalizations(BuildLocalizations(`commands.manage.description`))
    .addSubcommand(subcommand => {
        return subcommand
            .setName(`game`)
            .setDescription(Translate(`commands.manage.subcommands.game.description`))
            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.game.description`));
    })
    .addSubcommandGroup(group => {
        return group
            .setName(`template`)
            .setDescription(Translate(`commands.manage.subcommands.template.description`))
            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.template.description`))
            .addSubcommand(sub => {
                return sub
                    .setName(`tag-add`)
                    .setDescription(Translate(`commands.manage.subcommands.template.tagAdd`))
                    .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.template.tagAdd`))
                    .addStringOption(option => {
                        return option
                            .setName(`template`)
                            .setDescription(Translate(`commands.manage.template.options.template`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.template.options.template`))
                            .setRequired(true)
                            .setAutocomplete(true);
                    })
                    .addStringOption(option => {
                        return option
                            .setName(`tag`)
                            .setDescription(Translate(`commands.manage.template.options.tag`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.template.options.tag`))
                            .setRequired(true);
                    });
            })
            .addSubcommand(sub => {
                return sub
                    .setName(`tag-remove`)
                    .setDescription(Translate(`commands.manage.subcommands.template.tagRemove`))
                    .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.template.tagRemove`))
                    .addStringOption(option => {
                        return option
                            .setName(`template`)
                            .setDescription(Translate(`commands.manage.template.options.template`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.template.options.template`))
                            .setRequired(true)
                            .setAutocomplete(true);
                    })
                    .addStringOption(option => {
                        return option
                            .setName(`tag`)
                            .setDescription(Translate(`commands.manage.template.options.tag`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.template.options.tag`))
                            .setRequired(true);
                    });
            })
            .addSubcommand(sub => {
                return sub
                    .setName(`tag-list`)
                    .setDescription(Translate(`commands.manage.subcommands.template.tagList`))
                    .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.template.tagList`))
                    .addStringOption(option => {
                        return option
                            .setName(`template`)
                            .setDescription(Translate(`commands.manage.template.options.template`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.template.options.template`))
                            .setAutocomplete(true);
                    });
            });
    })
    .addSubcommandGroup(group => {
        return group
            .setName(`diplomacy`)
            .setDescription(Translate(`commands.manage.subcommands.diplomacy.description`))
            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.diplomacy.description`))
            .addSubcommand(sub => {
                return sub
                    .setName(`set`)
                    .setDescription(Translate(`commands.manage.subcommands.diplomacy.set`))
                    .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.diplomacy.set`))
                    .addStringOption(option => {
                        return option
                            .setName(`source`)
                            .setDescription(Translate(`commands.manage.diplomacy.options.source`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.diplomacy.options.source`))
                            .setRequired(true)
                            .setAutocomplete(true);
                    })
                    .addStringOption(option => {
                        return option
                            .setName(`target`)
                            .setDescription(Translate(`commands.manage.diplomacy.options.target`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.diplomacy.options.target`))
                            .setRequired(true)
                            .setAutocomplete(true);
                    })
                    .addStringOption(option => {
                        return option
                            .setName(`status`)
                            .setDescription(Translate(`commands.manage.diplomacy.options.status`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.diplomacy.options.status`))
                            .setRequired(true)
                            .addChoices(
                                { name: `Allied`, value: `ALLIED` },
                                { name: `Hostile`, value: `HOSTILE` },
                                { name: `Neutral`, value: `NEUTRAL` },
                                { name: `Unknown`, value: `UNKNOWN` },
                            );
                    });
            })
            .addSubcommand(sub => {
                return sub
                    .setName(`list`)
                    .setDescription(Translate(`commands.manage.subcommands.diplomacy.list`))
                    .setDescriptionLocalizations(BuildLocalizations(`commands.manage.subcommands.diplomacy.list`))
                    .addStringOption(option => {
                        return option
                            .setName(`organization`)
                            .setDescription(Translate(`commands.manage.diplomacy.options.organization`))
                            .setDescriptionLocalizations(BuildLocalizations(`commands.manage.diplomacy.options.organization`))
                            .setRequired(true)
                            .setAutocomplete(true);
                    });
            });
    });

export const permissionTokens: TokenSegmentInput[][] = [[`manage`]];

export async function execute(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (subcommandGroup === `template`) {
        switch (subcommand) {
            case `tag-add`:
                await ExecuteTagAdd(interaction);
                return;
            case `tag-remove`:
                await ExecuteTagRemove(interaction);
                return;
            case `tag-list`:
                await ExecuteTagList(interaction);
                return;
        }
    }

    if (subcommandGroup === `diplomacy`) {
        switch (subcommand) {
            case `set`:
                await ExecuteDiplomacySet(interaction);
                return;
            case `list`:
                await ExecuteDiplomacyList(interaction);
                return;
        }
    }

    switch (subcommand) {
        case `game`:
            await ExecuteManageGame(interaction);
            break;
        default:
            await interaction.reply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.errors.unknownSubcommand`, {
                    params: { subcommand },
                }),
                flags: MessageFlags.Ephemeral,
            });
    }
}

export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === `template`) {
        await AutocompleteTemplateName(interaction);
    } else if (focusedOption.name === `source` || focusedOption.name === `target` || focusedOption.name === `organization`) {
        await AutocompleteOrganization(interaction, focusedOption.name);
    } else {
        await interaction.respond([]);
    }
}
