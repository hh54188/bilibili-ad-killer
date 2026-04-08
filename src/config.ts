export type AIProvider = 'gemini' | 'openai';

export interface UserConfig {
    aiProvider: AIProvider;
    apiKey: string;
    apiBaseUrl: string;
    aiModel: string,
    autoSkip: boolean,
    ignoreVideoLessThan5Minutes: boolean,
    ignoreVideoMoreThan30Minutes: boolean,
    usingBrowserAIModel: boolean
}

export const MODEL_OPTIONS: Record<AIProvider, string[]> = {
    gemini: [
        'gemini-3.0-flash',
        'gemini-2.5-pro',
        'gemini-2.5-flash',
    ],
    openai: [
        'gpt-5.4',
        'gpt-5-mini',
        'gpt-4o-mini',
        'gpt-4o',
        'gpt-4.1-mini',
    ],
};

export const DEFAULT_AI_MODEL: Record<AIProvider, string> = {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
};

export const DEFAULT_CONFIG: UserConfig = {
    aiProvider: 'gemini',
    apiKey: '',
    apiBaseUrl: '',
    aiModel: DEFAULT_AI_MODEL.gemini,
    autoSkip: true,
    ignoreVideoLessThan5Minutes: true,
    ignoreVideoMoreThan30Minutes: true,
    usingBrowserAIModel: false
}

export let config: UserConfig = DEFAULT_CONFIG;

export function normalizeAiProvider(inputValue?: string): AIProvider {
    return inputValue === 'openai' ? 'openai' : 'gemini';
}

export function normalizeApiBaseUrl(inputValue?: string): string {
    return (inputValue || '').trim().replace(/\/+$/, '');
}

export function isOpenAIFullEndpointUrl(inputValue?: string): boolean {
    const normalizedValue = normalizeApiBaseUrl(inputValue);
    if (!normalizedValue) {
        return false;
    }

    try {
        const targetUrl = new URL(normalizedValue);
        const normalizedPath = targetUrl.pathname.replace(/\/+$/, '');
        return normalizedPath.endsWith('/responses') || normalizedPath.endsWith('/chat/completions');
    } catch {
        return false;
    }
}

export function isMixedContentApiBaseUrl(
    inputValue?: string,
    pageProtocol: string = 'https:',
): boolean {
    const normalizedValue = normalizeApiBaseUrl(inputValue);
    if (!normalizedValue) {
        return false;
    }

    try {
        const targetUrl = new URL(normalizedValue);
        return pageProtocol === 'https:' && targetUrl.protocol === 'http:';
    } catch {
        return false;
    }
}

export function getEffectiveApiBaseUrl(aiProvider: AIProvider, inputValue?: string): string {
    const normalizedValue = normalizeApiBaseUrl(inputValue);
    if (normalizedValue) {
        return normalizedValue;
    }

    if (aiProvider === 'openai') {
        return 'https://api.openai.com/v1';
    }

    return '';
}

export function getModelOptionsByProvider(aiProvider: AIProvider): string[] {
    return MODEL_OPTIONS[aiProvider];
}

export function getDefaultAiModelForProvider(aiProvider: AIProvider): string {
    return DEFAULT_AI_MODEL[aiProvider];
}

export function buildOpenAIResponsesUrl(inputValue: string): string {
    return `${normalizeApiBaseUrl(inputValue)}/responses`;
}

export function isValidApiBaseUrl(inputValue?: string, aiProvider?: AIProvider): boolean {
    const normalizedValue = normalizeApiBaseUrl(inputValue);
    if (!normalizedValue) {
        return true;
    }

    try {
        const targetUrl = new URL(normalizedValue);
        const isValidProtocol = targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:';
        if (!isValidProtocol) {
            return false;
        }

        if (aiProvider === 'openai' && isOpenAIFullEndpointUrl(normalizedValue)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

export function normalizeUserConfig(inputUserConfig?: Partial<UserConfig>): UserConfig {
    const mergedConfig = {
        ...DEFAULT_CONFIG,
        ...(inputUserConfig || {}),
    };
    const aiProvider = normalizeAiProvider(mergedConfig.aiProvider);
    const normalizedAiModel = (mergedConfig.aiModel || '').trim();

    return {
        ...mergedConfig,
        aiProvider,
        apiKey: (mergedConfig.apiKey || '').trim(),
        apiBaseUrl: normalizeApiBaseUrl(mergedConfig.apiBaseUrl),
        aiModel: normalizedAiModel || getDefaultAiModelForProvider(aiProvider),
    };
}

export function initializeConfig(inputUserConfig: UserConfig) {
    config = normalizeUserConfig(inputUserConfig);
}
