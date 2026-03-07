import { MessageFlags, EmbedBuilder } from 'discord.js';
import type { ChatInputCommandInteraction } from 'discord.js';
import type { InteractionExecutionContextCarrier } from '../../Common/Type/Interaction.js';
import { ListGamesForServer } from '../../Flow/Object/Game/ListGamesForServer.js';
import { SetDiplomaticStatus } from '../../Flow/Organization/Diplomacy/SetDiplomaticStatus.js';
import { GetOrganizationByUid } from '../../Flow/Object/Organization/View/GetOrganizationByUid.js';
import { DiplomacyRepository } from '../../Repository/Organization/DiplomacyRepository.js';
import { Log } from '../../Common/Log.js';
import { TranslateFromContext } from '../../Services/I18nService.js';
import { DIPLOMATIC_STATUSES } from '../../Domain/Organization/DiplomaticStatus.js';
import type { DiplomaticStatus } from '../../Domain/Organization/DiplomaticStatus.js';

const LOG_TAG = `Commands/Manage/Diplomacy`;

export async function ExecuteDiplomacySet(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.reply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.serverOnly`),
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
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.noGame`),
            });
            return;
        }

        const sourceOrgUid = interaction.options.getString(`source`, true).trim();
        const targetOrgUid = interaction.options.getString(`target`, true).trim();
        const rawStatus = interaction.options.getString(`status`, true).trim().toUpperCase();

        if (!DIPLOMATIC_STATUSES.includes(rawStatus as DiplomaticStatus)) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.invalidStatus`, {
                    params: { status: rawStatus },
                }),
            });
            return;
        }

        const sourceOrg = await GetOrganizationByUid(sourceOrgUid);
        if (!sourceOrg) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.orgNotFound`, {
                    params: { name: sourceOrgUid },
                }),
            });
            return;
        }

        const targetOrg = await GetOrganizationByUid(targetOrgUid);
        if (!targetOrg) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.orgNotFound`, {
                    params: { name: targetOrgUid },
                }),
            });
            return;
        }

        if (sourceOrg.uid === targetOrg.uid) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.selfRelation`),
            });
            return;
        }

        const status = rawStatus as DiplomaticStatus;
        const result = await SetDiplomaticStatus(
            sourceOrg.uid,
            targetOrg.uid,
            game.uid,
            status,
        );

        const sourceName = sourceOrg.friendlyName ?? sourceOrg.name;
        const targetName = targetOrg.friendlyName ?? targetOrg.name;

        const embed = new EmbedBuilder()
            .setTitle(TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.set.title`))
            .addFields(
                {
                    name: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.set.source`),
                    value: sourceName,
                    inline: true,
                },
                {
                    name: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.set.target`),
                    value: targetName,
                    inline: true,
                },
                {
                    name: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.set.status`),
                    value: status,
                    inline: true,
                },
                {
                    name: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.set.synced`),
                    value: String(result.projectionsUpdated),
                    inline: true,
                },
            )
            .setColor(__StatusToColor(status))
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to set diplomatic status`, message, LOG_TAG);
        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.failed`, {
                params: { message },
            }),
        });
    }
}

export async function ExecuteDiplomacyList(
    interaction: InteractionExecutionContextCarrier<ChatInputCommandInteraction>,
): Promise<void> {
    const serverId = interaction.guildId;
    if (!serverId) {
        await interaction.reply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.serverOnly`),
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
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.noGame`),
            });
            return;
        }

        const sourceOrgUid = interaction.options.getString(`organization`, true).trim();

        const sourceOrg = await GetOrganizationByUid(sourceOrgUid);
        if (!sourceOrg) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.orgNotFound`, {
                    params: { name: sourceOrgUid },
                }),
            });
            return;
        }

        const sourceName = sourceOrg.friendlyName ?? sourceOrg.name;

        const diplomacyRepository = new DiplomacyRepository();
        const relations = await diplomacyRepository.ListRelationsFromOrganization(
            sourceOrg.uid,
            game.uid,
        );

        if (relations.length === 0) {
            await interaction.editReply({
                content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.list.empty`, {
                    params: { organization: sourceName },
                }),
            });
            return;
        }

        const lines = relations.map(relation => {
            return `**${relation.targetOrganizationUid}** - ${relation.status}`;
        });

        const embed = new EmbedBuilder()
            .setTitle(TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.list.title`, {
                params: { organization: sourceName },
            }))
            .setDescription(lines.join(`\n`))
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    } catch(error) {
        const message = error instanceof Error ? error.message : String(error);
        Log.error(`Failed to list diplomatic status`, message, LOG_TAG);
        await interaction.editReply({
            content: TranslateFromContext(interaction.executionContext, `commands.manage.diplomacy.errors.failed`, {
                params: { message },
            }),
        });
    }
}

function __StatusToColor(status: DiplomaticStatus): number {
    switch (status) {
        case `ALLIED`:
            return 0x22c55e;
        case `HOSTILE`:
            return 0xef4444;
        case `NEUTRAL`:
            return 0xa1a1aa;
        case `UNKNOWN`:
            return 0x71717a;
        default:
            return 0x71717a;
    }
}
