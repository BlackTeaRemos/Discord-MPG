export const ParameterDefinitionSchema = {
    type: `object`,
    properties: {
        key: { type: `string`, description: `Unique parameter identifier`, example: `hitPoints` },
        label: { type: `string`, description: `Display label`, example: `Hit Points` },
        valueType: { type: `string`, enum: [`number`, `string`, `boolean`], description: `Parameter data type` },
        defaultValue: { description: `Default value matching the valueType` },
        category: { type: `string`, description: `Grouping category`, example: `combat` },
        description: { type: `string`, description: `Parameter purpose` },
    },
} as const;

export const ActionDefinitionSchema = {
    type: `object`,
    properties: {
        key: { type: `string`, description: `Unique action identifier`, example: `produceGoods` },
        label: { type: `string`, description: `Display label`, example: `Produce Goods` },
        trigger: { type: `string`, enum: [`onTurnAdvance`, `onManual`, `onCreate`, `onDestroy`], description: `When the action fires` },
        priority: { type: `number`, description: `Execution order priority`, example: 0 },
        expressions: { type: `array`, items: { type: `string` }, description: `Math expressions to evaluate` },
        description: { type: `string`, description: `Action purpose` },
        enabled: { type: `boolean`, description: `Whether the action is active` },
    },
} as const;

export const DisplayGroupSchema = {
    type: `object`,
    properties: {
        key: { type: `string`, description: `Group identifier matching parameter categories`, example: `combat` },
        label: { type: `string`, description: `Display heading for the group`, example: `Combat` },
        iconUrl: { type: `string`, description: `Optional icon URL for the group header` },
        sortOrder: { type: `number`, description: `Render order among groups`, example: 0 },
    },
} as const;

export const ParameterDisplayConfigSchema = {
    type: `object`,
    properties: {
        key: { type: `string`, description: `Parameter key this config applies to`, example: `hitPoints` },
        group: { type: `string`, description: `Override group key`, example: `combat` },
        graphType: { type: `string`, enum: [`sparkline`, `bar`, `none`], description: `Visualization type`, example: `sparkline` },
        hidden: { type: `boolean`, description: `Whether the parameter is hidden from the card`, example: false },
        displayOrder: { type: `number`, description: `Render order within the group`, example: 0 },
    },
} as const;

export const DisplayChartSchema = {
    type: `object`,
    properties: {
        key: { type: `string`, description: `Chart identifier`, example: `resources_chart` },
        label: { type: `string`, description: `Chart heading`, example: `Resource Overview` },
        chartType: { type: `string`, enum: [`combined`, `cumulative`, `relative`], description: `Chart visualization mode` },
        parameterKeys: { type: `array`, items: { type: `string` }, description: `Parameters included in this chart` },
        chartHeight: { type: `number`, description: `Chart height in pixels or 0 for auto`, example: 120 },
        sortOrder: { type: `number`, description: `Render order among charts`, example: 0 },
    },
} as const;

export const CardStyleConfigSchema = {
    type: `object`,
    description: `Color and border overrides for card rendering`,
    properties: {
        cardBackground: { type: `string`, description: `Card body background color`, example: `#000000` },
        panelBackground: { type: `string`, description: `Header and footer panel color`, example: `#09090b` },
        borderColor: { type: `string`, description: `Divider and separator color`, example: `#18181b` },
        accentColor: { type: `string`, description: `Primary accent for highlights`, example: `#f97316` },
        accentFill: { type: `string`, description: `Darkened accent for fills`, example: `#7c2d12` },
        textPrimary: { type: `string`, description: `Heading text color`, example: `#f4f4f5` },
        textValue: { type: `string`, description: `Value text color`, example: `#d4d4d8` },
        textLabel: { type: `string`, description: `Label text color`, example: `#52525b` },
        textSecondary: { type: `string`, description: `Description text color`, example: `#a1a1aa` },
        textMuted: { type: `string`, description: `Muted meta text color`, example: `#3f3f46` },
        cardBorderRadius: { type: `number`, description: `Border radius in pixels`, example: 0 },
    },
} as const;

export const TemplateDisplayConfigSchema = {
    type: `object`,
    description: `Full display configuration for a template card`,
    properties: {
        groups: { type: `array`, items: DisplayGroupSchema, description: `Parameter group definitions` },
        charts: { type: `array`, items: DisplayChartSchema, description: `Chart visualizations` },
        parameterDisplay: { type: `array`, items: ParameterDisplayConfigSchema, description: `Per-parameter display settings` },
        styleConfig: CardStyleConfigSchema,
    },
} as const;

export const ProjectionGroupEntrySchema = {
    type: `object`,
    properties: {
        key: { type: `string`, description: `Group identifier`, example: `combat` },
        linked: { type: `boolean`, description: `True to inherit from base display config group`, example: true },
        label: { type: `string`, description: `Custom label when not linked` },
        iconUrl: { type: `string`, description: `Custom icon URL when not linked` },
        sortOrder: { type: `number`, description: `Render order`, example: 0 },
        parameterDisplay: { type: `array`, items: ParameterDisplayConfigSchema, description: `Custom parameter display when not linked` },
    },
} as const;

export const ProjectionDisplayProfileSchema = {
    type: `object`,
    description: `A projection display profile defining how an observer sees an object`,
    properties: {
        groups: { type: `array`, items: ProjectionGroupEntrySchema, description: `Group entries for the profile` },
        charts: { type: `array`, items: DisplayChartSchema, description: `Custom chart overrides or null to inherit` },
        styleConfig: CardStyleConfigSchema,
    },
} as const;

export const ErrorResponseSchema = {
    type: `object`,
    properties: {
        error: { type: `string`, description: `Error message` },
    },
} as const;

export const SuccessResponseSchema = {
    type: `object`,
    properties: {
        success: { type: `boolean`, description: `Whether the operation succeeded`, example: true },
    },
} as const;

export const ExpressionValidationErrorSchema = {
    type: `object`,
    properties: {
        actionKey: { type: `string`, description: `Action containing the failed expression`, example: `produceGoods` },
        expressionIndex: { type: `number`, description: `Zero-based index within the action expressions`, example: 0 },
        expression: { type: `string`, description: `The expression text that failed` },
        errors: { type: `array`, items: { type: `string` }, description: `Specific syntax errors` },
    },
} as const;

export const ValidateResponseSchema = {
    type: `object`,
    properties: {
        valid: { type: `boolean`, description: `Whether validation passed`, example: true },
        structuralErrors: { type: `array`, items: { type: `string` }, description: `Schema and structure errors` },
        expressionErrors: { type: `array`, items: ExpressionValidationErrorSchema, description: `Expression syntax errors` },
    },
} as const;

export const ValidationErrorResponseSchema = {
    type: `object`,
    properties: {
        error: { type: `string`, description: `Summary error message` },
        structuralErrors: { type: `array`, items: { type: `string` }, description: `Schema and structure errors` },
        expressionErrors: { type: `array`, items: ExpressionValidationErrorSchema, description: `Per-expression syntax errors` },
    },
} as const;

export const CrossReferenceErrorSchema = {
    type: `object`,
    properties: {
        actionKey: { type: `string`, description: `Action containing the reference` },
        expressionIndex: { type: `number`, description: `Expression index` },
        reference: { type: `string`, description: `The cross-reference string`, example: `@Mine.oreOutput` },
        error: { type: `string`, description: `Error detail` },
    },
} as const;

export const ContextValidateResponseSchema = {
    type: `object`,
    properties: {
        valid: { type: `boolean` },
        structuralErrors: { type: `array`, items: { type: `string` } },
        expressionErrors: { type: `array`, items: ExpressionValidationErrorSchema },
        crossReferenceErrors: { type: `array`, items: CrossReferenceErrorSchema, description: `Cross-template reference errors` },
        availableTemplates: {
            type: `array`,
            items: {
                type: `object`,
                properties: {
                    name: { type: `string`, description: `Template name` },
                    numericParameters: { type: `array`, items: { type: `string` }, description: `Available numeric parameter keys` },
                },
            },
            description: `Known templates and their numeric parameters`,
        },
    },
} as const;

export const TemplateSchema = {
    type: `object`,
    description: `Full template entity`,
    properties: {
        uid: { type: `string`, description: `Template unique identifier`, example: `tpl_factory_abc123` },
        gameUid: { type: `string`, description: `Game this template belongs to`, example: `game_xyz789` },
        name: { type: `string`, description: `Template display name`, example: `Factory` },
        description: { type: `string`, description: `Template purpose`, example: `A production building` },
        parameters: { type: `array`, items: ParameterDefinitionSchema },
        actions: { type: `array`, items: ActionDefinitionSchema },
        displayConfig: TemplateDisplayConfigSchema,
        createdAt: { type: `string`, description: `ISO creation timestamp` },
        updatedAt: { type: `string`, description: `ISO last modified timestamp` },
    },
} as const;

export const TemplateBodySchema = {
    type: `object`,
    required: [`gameUid`, `name`, `parameters`, `actions`],
    description: `Payload for creating or updating a template`,
    properties: {
        gameUid: { type: `string`, description: `Game identifier`, example: `game_xyz789` },
        name: { type: `string`, description: `Template name`, example: `Factory` },
        description: { type: `string`, description: `Template description`, example: `A production building` },
        parameters: { type: `array`, items: ParameterDefinitionSchema },
        actions: { type: `array`, items: ActionDefinitionSchema },
        displayConfig: TemplateDisplayConfigSchema,
    },
} as const;
