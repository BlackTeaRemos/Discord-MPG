import Fastify, { type FastifyInstance } from 'fastify';
import FastifyCors from '@fastify/cors';
import FastifySwagger from '@fastify/swagger';
import FastifySwaggerUi from '@fastify/swagger-ui';
import { Log } from '../Common/Log.js';
import { ExpressionEvaluator } from '../Flow/GameObject/ExpressionEvaluator.js';
import { GameObjectTemplateRepository } from '../Repository/GameObject/GameObjectTemplateRepository.js';
import {
    RegisterPageRoutes,
    RegisterHealthRoutes,
    RegisterTemplateRoutes,
    RegisterDisplayConfigRoutes,
    RegisterProjectionConfigRoutes,
    RegisterProjectionRoutes,
    RegisterPreviewRoutes,
    RegisterGameRoutes,
    RegisterAuditRoutes,
    RegisterMetricsRoutes,
    RegisterTagRoutes,
    RegisterDiplomacyRoutes,
} from './Routes/index.js';

const DEFAULT_PORT = 3500;

const LOG_TAG = `Web/TemplateEditorServer`;

export interface ITemplateEditorServerConfig {
    port: number;
}

export class TemplateEditorServer {
    private _fastify: FastifyInstance;
    private _port: number;
    private readonly _expressionEvaluator: ExpressionEvaluator;
    private readonly _templateRepository: GameObjectTemplateRepository;

    public constructor(config: ITemplateEditorServerConfig) {
        this._port = config.port;
        this._expressionEvaluator = new ExpressionEvaluator();
        this._templateRepository = new GameObjectTemplateRepository();
        this._fastify = Fastify({
            logger: false,
            bodyLimit: 1_048_576,
            ajv: {
                customOptions: {
                    keywords: [`example`],
                },
            },
        });
    }

    public async Start(): Promise<void> {
        await this._fastify.register(FastifyCors, {
            origin: `*`,
            methods: [`GET`, `POST`, `PUT`, `DELETE`, `OPTIONS`],
        });

        await this._fastify.register(FastifySwagger, {
            openapi: {
                info: {
                    title: `MPG Template Editor API`,
                    description: `API for managing game object templates and display configurations`,
                    version: `1.0.0`,
                },
                tags: [
                    { name: `Health`, description: `Service health` },
                    { name: `Games`, description: `Game management` },
                    { name: `Templates`, description: `Template management and validation` },
                    { name: `Display Config`, description: `Card display configuration` },
                    { name: `Projection Config`, description: `Projection display profiles` },
                    { name: `Projections`, description: `Organization projection assignments` },
                    { name: `Audit`, description: `User action audit log` },
                    { name: `Metrics`, description: `System metrics and event counters` },
                    { name: `Tags`, description: `Template tag management` },
                    { name: `Preview`, description: `Card preview rendering` },
                ],
            },
        });

        await this._fastify.register(FastifySwaggerUi, {
            routePrefix: `/docs`,
        });

        const routeContext = {
            templateRepository: this._templateRepository,
            expressionEvaluator: this._expressionEvaluator,
        };

        RegisterPageRoutes(this._fastify);
        RegisterHealthRoutes(this._fastify);
        RegisterTemplateRoutes(this._fastify, routeContext);
        RegisterDisplayConfigRoutes(this._fastify, routeContext);
        RegisterProjectionConfigRoutes(this._fastify, routeContext);
        RegisterProjectionRoutes(this._fastify);
        RegisterPreviewRoutes(this._fastify);
        RegisterGameRoutes(this._fastify);
        RegisterAuditRoutes(this._fastify);
        RegisterMetricsRoutes(this._fastify);
        RegisterTagRoutes(this._fastify);
        RegisterDiplomacyRoutes(this._fastify);

        await this._fastify.listen({ port: this._port, host: `0.0.0.0` });
        Log.info(`Template editor available at http://localhost:${this._port}`, LOG_TAG);
        Log.info(`Swagger UI available at http://localhost:${this._port}/docs`, LOG_TAG);
    }

    public async Stop(): Promise<void> {
        await this._fastify.close();
        Log.info(`Template editor server stopped.`, LOG_TAG);
    }
}

export function ResolveEditorPort(): number {
    const envPort = process.env.TEMPLATE_EDITOR_PORT;
    if (envPort) {
        const parsed = parseInt(envPort, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return DEFAULT_PORT;
}
