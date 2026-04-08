export type AIServiceErrorKind =
    | 'http_401'
    | 'http_403'
    | 'http_5xx'
    | 'http_other'
    | 'timeout'
    | 'tls'
    | 'cors'
    | 'network'
    | 'unknown';

export interface AIServiceErrorOptions {
    kind: AIServiceErrorKind;
    status?: number;
    responseText?: string;
    targetUrl?: string;
    cause?: unknown;
}

export interface AIServiceToastMessages {
    aiServiceFailed?: string;
    aiServiceAuthFailed?: string;
    aiServiceForbidden?: string;
    aiServiceServerError?: string;
    aiServiceTlsFailed?: string;
    aiServiceCorsFailed?: string;
    aiServiceTimeout?: string;
    aiServiceNetworkFailed?: string;
}

export class AIServiceRequestError extends Error {
    kind: AIServiceErrorKind;
    status?: number;
    responseText?: string;
    targetUrl?: string;
    cause?: unknown;

    constructor(message: string, options: AIServiceErrorOptions) {
        super(message);
        this.name = 'AIServiceRequestError';
        this.kind = options.kind;
        this.status = options.status;
        this.responseText = options.responseText;
        this.targetUrl = options.targetUrl;
        this.cause = options.cause;
    }
}

function normalizeText(inputValue?: string): string {
    return (inputValue || '').trim().toLowerCase();
}

function extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (error === null || error === undefined) {
        return '';
    }

    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    return (error as { name?: string }).name === 'AbortError';
}

export function createAIServiceHttpError(
    status: number,
    responseText: string,
    targetUrl?: string,
): AIServiceRequestError {
    let kind: AIServiceErrorKind = 'http_other';

    if (status === 401) {
        kind = 'http_401';
    } else if (status === 403) {
        kind = 'http_403';
    } else if (status >= 500) {
        kind = 'http_5xx';
    }

    return new AIServiceRequestError(`HTTP ${status}: ${responseText}`, {
        kind,
        status,
        responseText,
        targetUrl,
    });
}

export function classifyAIServiceError(
    error: unknown,
    metadata: Pick<AIServiceErrorOptions, 'targetUrl'> = {},
): AIServiceRequestError {
    if (error instanceof AIServiceRequestError) {
        return error;
    }

    const message = extractErrorMessage(error);
    const normalizedMessage = normalizeText(message);

    if (isAbortError(error) || normalizedMessage.includes('abort')) {
        return new AIServiceRequestError(message || 'Request timed out', {
            kind: 'timeout',
            targetUrl: metadata.targetUrl,
            cause: error,
        });
    }

    if (/\b(certificate|cert|ssl|tls)\b/.test(normalizedMessage)) {
        return new AIServiceRequestError(message || 'TLS request failed', {
            kind: 'tls',
            targetUrl: metadata.targetUrl,
            cause: error,
        });
    }

    if (/\bcors\b|access-control-allow-origin|preflight/.test(normalizedMessage)) {
        return new AIServiceRequestError(message || 'CORS request failed', {
            kind: 'cors',
            targetUrl: metadata.targetUrl,
            cause: error,
        });
    }

    if (
        error instanceof TypeError
        || normalizedMessage.includes('failed to fetch')
        || normalizedMessage.includes('networkerror')
        || normalizedMessage.includes('load failed')
    ) {
        return new AIServiceRequestError(message || 'Network request failed', {
            kind: 'network',
            targetUrl: metadata.targetUrl,
            cause: error,
        });
    }

    return new AIServiceRequestError(message || 'Unknown request error', {
        kind: 'unknown',
        targetUrl: metadata.targetUrl,
        cause: error,
    });
}

export function getAIServiceToastMessage(
    error: AIServiceRequestError,
    toastMessages: AIServiceToastMessages,
): string {
    if (error.kind === 'http_401') {
        return toastMessages.aiServiceAuthFailed || toastMessages.aiServiceFailed || '';
    }

    if (error.kind === 'http_403') {
        return toastMessages.aiServiceForbidden || toastMessages.aiServiceFailed || '';
    }

    if (error.kind === 'http_5xx') {
        return toastMessages.aiServiceServerError || toastMessages.aiServiceFailed || '';
    }

    if (error.kind === 'tls') {
        return toastMessages.aiServiceTlsFailed || toastMessages.aiServiceFailed || '';
    }

    if (error.kind === 'cors') {
        return toastMessages.aiServiceCorsFailed || toastMessages.aiServiceFailed || '';
    }

    if (error.kind === 'timeout') {
        return toastMessages.aiServiceTimeout || toastMessages.aiServiceFailed || '';
    }

    if (error.kind === 'network') {
        return toastMessages.aiServiceNetworkFailed || toastMessages.aiServiceFailed || '';
    }

    return toastMessages.aiServiceFailed || '';
}
