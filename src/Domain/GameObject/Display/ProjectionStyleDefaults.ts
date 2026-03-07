import type { ICardStyleConfig } from './ICardStyleConfig.js';
import type { ITemplateDisplayConfig } from './ITemplateDisplayConfig.js';

const OWNER_STYLE: ICardStyleConfig = {
    accentColor: `#3b82f6`,
    accentFill: `#1e3a5f`,
    panelBackground: `#0a0a14`,
    borderColor: `#1e293b`,
};

const ALLIED_STYLE: ICardStyleConfig = {
    accentColor: `#22c55e`,
    accentFill: `#14532d`,
    panelBackground: `#0a140a`,
    borderColor: `#1a2e1a`,
};

const HOSTILE_STYLE: ICardStyleConfig = {
    accentColor: `#ef4444`,
    accentFill: `#7f1d1d`,
    panelBackground: `#140a0a`,
    borderColor: `#2e1a1a`,
};

const NEUTRAL_STYLE: ICardStyleConfig = {
    accentColor: `#a1a1aa`,
    accentFill: `#3f3f46`,
    panelBackground: `#09090b`,
    borderColor: `#18181b`,
};

const UNKNOWN_STYLE: ICardStyleConfig = {
    accentColor: `#71717a`,
    accentFill: `#27272a`,
    panelBackground: `#09090b`,
    borderColor: `#18181b`,
};

const STYLE_MAP: Record<string, ICardStyleConfig> = {
    OWNER: OWNER_STYLE,
    ALLIED: ALLIED_STYLE,
    HOSTILE: HOSTILE_STYLE,
    NEUTRAL: NEUTRAL_STYLE,
    UNKNOWN: UNKNOWN_STYLE,
};

/**
 * @brief Resolves a default card style config for a projection display style
 *
 * Returns a minimal ITemplateDisplayConfig containing only the style config preset for the given
 * display style or undefined when the style has no built in default
 *
 * @param displayStyle string Display style name such as OWNER or ALLIED
 * @returns ITemplateDisplayConfig or undefined The default config preset
 */
export function ResolveDefaultProjectionStyle(displayStyle: string): ITemplateDisplayConfig | undefined {
    const styleConfig = STYLE_MAP[displayStyle.toUpperCase()];
    if (!styleConfig) {
        return undefined;
    }

    return {
        groups: [],
        parameterDisplay: [],
        styleConfig,
    };
}
