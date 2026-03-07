import { Log, LogLevel } from './Common/Log.js';
import { MAIN_EVENT_BUS, MainEventBus } from './Events/MainEventBus.js';
import { EVENT_NAMES } from './Domain/index.js';
import { ConfigService } from './Services/ConfigService.js';
import type { ValidatedConfig } from './Types/Config.js';
import { DiscordService } from './Discord.js';

import { GatewayIntentBits, REST, Routes, Client, MessageFlags, Events } from 'discord.js';
import { Session } from './Common/Session.js';
import type { Message, Interaction } from 'discord.js';
import { OnInteractionCreate } from './Events/InteractionCreate.js';
import { OnMessageCreate } from './Events/MessageCreate.js';
import { commands as loadedCommands, commandsReady } from './Commands/index.js';
import { flowManager } from './Common/Flow/Manager.js';
import { BootDiscordClient } from './App/Boot.js';
import { InitDiscord } from './App/DiscordInit.js';
import { auditService } from './Services/AuditService.js';
import { templateTagService } from './Services/TemplateTagService.js';
import { GameObjectTemplateRepository } from './Repository/GameObject/GameObjectTemplateRepository.js';

// Supported log levels with numeric severity where lower is more verbose
const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;

// Keys for log levels
type LogLevelKey = keyof typeof LOG_LEVELS;

/**
 * @brief Application entry point for Discord Bot
 */
export class DiscordApp {
    /**
     * @brief Reference to DiscordService instance for sending messages
     */
    private _discordService: DiscordService | null = null;

    /**
     * @brief Stores the id of the cmd channel after discord ready
     */
    private _cmdChannelId: string | null = null;

    /**
     * @brief Event bus for communication between UI and backend
     */
    public eventBus: MainEventBus;

    /** @brief Service for loading and validating app config */
    private _configService: ConfigService;
    /** @brief DiscordJS client instance */
    private _client: Client | null = null;

    /** @brief Sessions per guild keyed by guild ID */
    private _sessions: Map<string, Session<any>> = new Map();

    /**
     * @brief Numeric severity for current logging level
     */
    private _logLevel: number = LOG_LEVELS.info;

    /**
     * @brief Indicates if the app is running
     */
    private _running: boolean = false;

    /**
     * @brief Initializes the application and sets up event bus
     */
    public constructor(eventBus: MainEventBus = MAIN_EVENT_BUS) {
        this.eventBus = eventBus;
        this.__setupEventHandlers();

        this._configService = new ConfigService(this.eventBus);
        this.eventBus.Emit(EVENT_NAMES.output, `Application starting...`);

        void this.__boot();

        this._cmdChannelId = null;
    }

    /**
     * @brief Boots the application by loading config and creating the DiscordJS client
     * @private
     * @returns void
     */
    private async __boot(): Promise<void> {
        try {
            const { client, config } = await BootDiscordClient({
                eventBus: this.eventBus,
                configService: this._configService,
                loadedCommands,
                commandsReady,
            });

            this._client = client;

            this.eventBus.On(EVENT_NAMES.discordInteraction, async (interaction: Interaction) => {
                await OnInteractionCreate(interaction);
            });
            this.eventBus.On(EVENT_NAMES.discordMessageRaw, async (message: Message) => {
                await OnMessageCreate(message);
            });

            auditService.Start();

            await this.__initializeTagIndex();

            const discord = InitDiscord({
                eventBus: this.eventBus,
                client: client,
                config,
                setCmdChannelId: id => {
                    this._cmdChannelId = id;
                },
            });

            if (discord) {
                this._discordService = discord;
            }

            this.eventBus.Emit(EVENT_NAMES.output, `Boot completed.`);
        } catch (err) {
            this.eventBus.Emit(EVENT_NAMES.output, `Fatal boot error: ${err}`);
            throw err;
        }
    }

    private async __initializeTagIndex(): Promise<void> {
        try {
            const templateRepository = new GameObjectTemplateRepository();
            const templates = await templateRepository.ListAll();
            templateTagService.Initialize(templates);
        } catch (err) {
            Log.warning(`Tag index initialization skipped: ${String(err)}`, `App`);
        }
    }

    /**
     * @brief Initializes Discord integration and log level after config is loaded
     * @param config any Loaded config object
     * @private
     */
    private __initConfigAndDiscord(config: any): void {
        // Apply log level from config
        if (config.logLevel && typeof config.logLevel === `string`) {
            const levelKey = config.logLevel as keyof typeof LOG_LEVELS;

            if (Object.prototype.hasOwnProperty.call(LOG_LEVELS, levelKey)) {
                this._logLevel = LOG_LEVELS[levelKey];
                this.eventBus.Emit(EVENT_NAMES.output, `Log level set to '${levelKey}'`);
            }
        }

        this.eventBus.Emit(EVENT_NAMES.output, `Loaded config, connecting to Discord...`);
        this.eventBus.On(EVENT_NAMES.configLoaded, cfg => {
            this.__initDiscord(cfg);
        });

        // If config already loaded then fire manually
        this.__initDiscord(config);
    }

    // Keep a thin compatibility wrapper that delegates to the new init module when present
    private __initDiscord(config: any): void {
        this.eventBus.Emit(EVENT_NAMES.output, `[TRACE] Entered __initDiscord (delegating to DiscordInit)`);

        if (!config || !this._client) {
            this.eventBus.Emit(EVENT_NAMES.output, `[TRACE] __initDiscord skipped: missing config or client.`);
            return;
        }

        if (this._discordService) {
            this.eventBus.Emit(EVENT_NAMES.output, `[TRACE] DiscordService already initialized.`);
            return;
        }

        const discord = InitDiscord({
            eventBus: this.eventBus,
            client: this._client,
            config,
            setCmdChannelId: id => {
                return (this._cmdChannelId = id);
            },
        });

        if (discord) {
            this._discordService = discord;
        }
    }

    /**
     * @brief Sets up core event handlers for IO and system events
     * @private
     */
    private __setupEventHandlers(): void {
        this.eventBus.On(EVENT_NAMES.input, (data: string) => {
            this.__handleInput(data);
        });

        this.eventBus.On(EVENT_NAMES.systemShutdown, () => {
            this._running = false;
        });
    }

    /**
     * @brief Handles input from the UI or console
     * @param input string The input string from the user
     */
    private __handleInput(input: string): void {
        // For now just echo the input
        this.eventBus.Emit(EVENT_NAMES.output, `Echo: ${input}`);
    }

    /**
     * @brief Starts the main IO loop reading from stdin and emitting events
     * @returns void
     */
    public async Start(): Promise<void> {
        this._running = true;

        /**
         * @brief Handles output events by logging if available otherwise falling back to console
         * @param msg string The message to log
         */
        this.eventBus.On(EVENT_NAMES.output, (msg: string) => {
            // Only log info level messages if current level allows
            if (this._logLevel <= LOG_LEVELS.info) {
                try {
                    Log.info(msg, `App`);
                } catch (err) {
                    // Fallback to console if log fails
                    console.log(msg);
                }
            }
        });

        // Read from stdin asynchronously
        for await (const line of this.__readLines()) {
            this.eventBus.Emit(EVENT_NAMES.input, line);

            if (!this._running) {
                break;
            }
        }
    }

    /**
     * @brief Async generator to read lines from stdin
     * @returns AsyncGenerator of string lines
     * @example
     * for await (const line of this.__readLines()) { ... }
     */
    private async *__readLines(): AsyncGenerator<string, void, unknown> {
        const readline = await import(`readline`);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: true,
        });

        for await (const line of rl) {
            yield line;
        }
    }

    /**
     * @brief Wipes all application commands for global and guild scopes
     * @param client Client DiscordJS client instance
     * @param config any Loaded config containing discordGuildId
     * @private
     */
    private async __wipeAllApplicationCommands(client: Client, config: any): Promise<void> {
        const app = client.application!;
        // Remove all global commands
        await app.commands.set([]);
        // Remove all guild commands if guild ID configured
        if (config.discordGuildId) {
            await app.commands.set([], config.discordGuildId);
        }
    }
}
