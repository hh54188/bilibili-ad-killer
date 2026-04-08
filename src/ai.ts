import { GoogleGenAI } from '@google/genai';
import {
    AIServiceRequestError,
    classifyAIServiceError,
    createAIServiceHttpError,
} from './ai-service-error';
import { buildOpenAIResponsesUrl } from './config';

export type AdTimeRange = {
    startTime: number;
    endTime: number;
} | null;

const geminiResponseSchema = {
    type: 'OBJECT',
    properties: {
        startTime: { type: 'number', nullable: false },
        endTime: { type: 'number', nullable: false },
    },
    required: ['startTime', 'endTime'],
};

const openAIResponseSchema = {
    type: 'object',
    properties: {
        startTime: { type: 'number' },
        endTime: { type: 'number' },
    },
    required: ['startTime', 'endTime'],
    additionalProperties: false,
};

export interface PromptContextOptions {
    subStr: string;
    aiModel: string;
    videoTitle?: string;
    videoDescription?: string;
}

export interface GeminiIdentifyAdTimeRangeOptions extends PromptContextOptions {
    geminiClient: GoogleGenAI;
}

export interface OpenAIClient {
    apiKey: string;
    apiBaseUrl: string;
}

export interface OpenAIIdentifyAdTimeRangeOptions extends PromptContextOptions {
    openAIClient: OpenAIClient;
}

export type IdentifyAdTimeRangeOptions =
    | ({ provider: 'gemini' } & GeminiIdentifyAdTimeRangeOptions)
    | ({ provider: 'openai' } & OpenAIIdentifyAdTimeRangeOptions);

export type CheckAIConnectivityOptions =
    | { provider: 'gemini'; geminiClient: GoogleGenAI; aiModel: string }
    | { provider: 'openai'; openAIClient: OpenAIClient; aiModel: string };

export interface IdentifyAdTimeRangeDiagnostics {
    adTimeRange: AdTimeRange;
    error?: AIServiceRequestError | 'not_initialized';
}

function buildAdIdentifyPrompt(options: PromptContextOptions): string {
    const { subStr, videoTitle, videoDescription } = options;

    const basicPrompt = `
    接下来我会分享给你一段视频字幕，该段字幕由多个字幕语句组成。
    每一句字幕包含三部分内容，分别是起始时间、结束时间以及字幕内容，格式如下：[{起始时间}-{结束时间}]:{字幕内容}。语句之间由分号（;）隔开。
    请帮助我分析其中哪些是与视频主内容无关的广告内容，并给出连续广告内容的起始时间和终止时间。我可能还会分享给你视频标题以及视频描述，用于辅助你判断广告内容。

    如果存在广告内容，请仅返回 JSON，格式为：{"startTime": number, "endTime": number}
    如果不存在广告内容，请仅返回 null

    字幕内容如下：
    ------
    ${subStr}
    `;

    const videoTitlePrompt = `
    ------
    视频标题如下：
    ${videoTitle}
    `;

    const videoDescriptionPrompt = `
    ------
    视频描述如下：
    ${videoDescription}
    `;

    return `${basicPrompt}${videoTitle ? videoTitlePrompt : ''}${videoDescription ? videoDescriptionPrompt : ''}`;
}

function parseAdTimeRangeResponse(rawText?: string | null): AdTimeRange {
    if (!rawText) {
        return null;
    }

    const normalizedText = rawText.trim();
    if (!normalizedText || normalizedText === 'null') {
        return null;
    }

    const jsonBlockMatch = normalizedText.match(/\{[\s\S]*\}/);
    const candidateText = jsonBlockMatch ? jsonBlockMatch[0] : normalizedText;

    let parsedValue: unknown;
    try {
        parsedValue = JSON.parse(candidateText);
    } catch {
        console.log('📺 🤖 ❌ Failed to parse AI response as JSON', normalizedText);
        return null;
    }

    if (!parsedValue || typeof parsedValue !== 'object') {
        console.log('📺 🤖 Invalid AI response payload', parsedValue);
        return null;
    }

    const { startTime, endTime } = parsedValue as { startTime?: unknown; endTime?: unknown };
    const normalizedStartTime = Number(startTime);
    const normalizedEndTime = Number(endTime);

    if (!Number.isFinite(normalizedStartTime) || !Number.isFinite(normalizedEndTime)) {
        console.log('📺 🤖 Invalid ad time range', parsedValue);
        return null;
    }

    if (normalizedStartTime < 0 || normalizedEndTime < 0 || normalizedStartTime >= normalizedEndTime) {
        console.log('📺 🤖 Invalid ad time range', parsedValue);
        return null;
    }

    return {
        startTime: normalizedStartTime,
        endTime: normalizedEndTime,
    };
}

function logAIServiceError(error: unknown, context: string): AIServiceRequestError {
    const aiError = classifyAIServiceError(error);
    const errorDetails = {
        kind: aiError.kind,
        status: aiError.status,
        targetUrl: aiError.targetUrl,
        responseText: aiError.responseText,
        message: aiError.message,
        cause: aiError.cause,
    };
    console.error(`📺 🤖 ❌ ${context}\n${JSON.stringify(errorDetails, null, 2)}`);
    return aiError;
}

export function extractOpenAIResponseText(responseJson: unknown): string | null {
    if (!responseJson || typeof responseJson !== 'object') {
        return null;
    }

    const responsePayload = responseJson as {
        output_text?: unknown;
        output_parsed?: unknown;
        output?: Array<{
            content?: Array<{
                text?: unknown;
            }>;
        }>;
    };

    if (typeof responsePayload.output_text === 'string' && responsePayload.output_text.trim()) {
        return responsePayload.output_text.trim();
    }

    if (responsePayload.output_parsed && typeof responsePayload.output_parsed === 'object') {
        return JSON.stringify(responsePayload.output_parsed);
    }

    const textFragments = (responsePayload.output || []).flatMap((item) => {
        const contentItems = Array.isArray(item?.content) ? item.content : [];
        return contentItems.flatMap((contentItem) => {
            if (typeof contentItem?.text === 'string' && contentItem.text.trim()) {
                return [contentItem.text.trim()];
            }

            if (
                contentItem?.text
                && typeof contentItem.text === 'object'
                && typeof (contentItem.text as { value?: unknown }).value === 'string'
            ) {
                return [String((contentItem.text as { value: string }).value).trim()];
            }

            return [];
        });
    });

    return textFragments.length ? textFragments.join('\n').trim() : null;
}

async function requestOpenAIResponse(
    openAIClient: OpenAIClient,
    aiModel: string,
    prompt: string,
    useStructuredOutput: boolean,
    timeoutMs: number,
): Promise<string | null> {
    const targetUrl = buildOpenAIResponsesUrl(openAIClient.apiBaseUrl);
    const payload: Record<string, unknown> = {
        model: aiModel,
        instructions: '你的任务是识别视频中的广告内容，并返回广告的起止时间。',
        input: prompt,
    };

    if (useStructuredOutput) {
        payload.text = {
            format: {
                type: 'json_schema',
                name: 'ad_time_range',
                strict: true,
                schema: openAIResponseSchema,
            },
        };
    }

    const controller = new AbortController();
    const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
        console.log('📺 🤖 🌐 Sending OpenAI Responses API request', {
            targetUrl,
            aiModel,
            useStructuredOutput,
            hasAuthorization: Boolean(openAIClient.apiKey),
            authorizationScheme: openAIClient.apiKey ? 'Bearer' : 'none',
        });

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${openAIClient.apiKey}`,
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (!response.ok) {
            const responseText = await response.text();
            console.error(
                `📺 🤖 ❌ OpenAI Responses API returned non-2xx response\n${JSON.stringify({
                    targetUrl,
                    status: response.status,
                    responseText,
                }, null, 2)}`
            );
            throw createAIServiceHttpError(response.status, responseText, targetUrl);
        }

        const responseJson = await response.json();
        const content = extractOpenAIResponseText(responseJson);
        if (content) {
            return content;
        }

        throw new AIServiceRequestError('OpenAI Responses API 返回空响应内容', {
            kind: 'unknown',
            targetUrl,
            responseText: JSON.stringify(responseJson),
        });
    } catch (error) {
        throw classifyAIServiceError(error, { targetUrl });
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function identifyAdTimeRangeByBrowserAI(options: PromptContextOptions): Promise<AdTimeRange | undefined> {
    if (!window.LanguageModel || !window.LanguageModel.create) {
        console.error('📺 🤖 ❌ Browser AI not initialized yet, cannot identify ads');
        return null;
    }

    try {
        const session = await window.LanguageModel.create({
            initialPrompts: [
                { role: 'system', content: '你的任务是识别视频中的广告内容，并返回广告的起止时间。' },
            ],
        });

        const response = await session.prompt([
            {
                role: 'user',
                content: buildAdIdentifyPrompt(options),
            },
        ]);

        console.log('📺 🤖 Browser AI response', response);
    } catch (err) {
        console.log('📺 🤖 ❌ Failed to reach Browser AI service, message:', err);
    }

    return undefined;
}

export async function checkGeminiConnectivity(geminiClient: GoogleGenAI, aiModel: string): Promise<string | undefined> {
    try {
        const response = await geminiClient.models.generateContent({
            model: aiModel,
            config: {
                responseJsonSchema: {
                    type: 'boolean',
                },
                responseMimeType: 'application/json',
                httpOptions: {
                    timeout: 1000 * 15,
                }
            },
            contents: 'Hi'
        });
        return response.text;
    } catch (err) {
        throw logAIServiceError(err, 'Gemini 连通性检查失败');
    }
}

export async function checkOpenAIConnectivity(openAIClient: OpenAIClient, aiModel: string): Promise<string | undefined> {
    try {
        return await requestOpenAIResponse(
            openAIClient,
            aiModel,
            '请只返回 true',
            false,
            1000 * 15,
        ) || undefined;
    } catch (err) {
        throw logAIServiceError(err, 'OpenAI 连通性检查失败');
    }
}

export async function checkAIConnectivity(options: CheckAIConnectivityOptions): Promise<string | undefined> {
    if (options.provider === 'openai') {
        return checkOpenAIConnectivity(options.openAIClient, options.aiModel);
    }

    return checkGeminiConnectivity(options.geminiClient, options.aiModel);
}

export async function identifyAdTimeRangeByGeminiAIWithDiagnostics(
    options: GeminiIdentifyAdTimeRangeOptions,
): Promise<IdentifyAdTimeRangeDiagnostics> {
    const { geminiClient, aiModel } = options;

    if (!geminiClient || !aiModel) {
        console.error('📺 🤖 ❌ AI not initialized yet, cannot identify ads');
        return {
            adTimeRange: null,
            error: 'not_initialized',
        };
    }

    try {
        const response = await geminiClient.models.generateContent({
            model: aiModel,
            config: {
                responseJsonSchema: geminiResponseSchema,
                responseMimeType: 'application/json',
                httpOptions: {
                    timeout: 1000 * 60,
                }
            },
            contents: buildAdIdentifyPrompt(options),
        });

        console.log('📺 🤖 AI response text', response.text);

        const targetAdTimeRange = parseAdTimeRangeResponse(response.text);
        if (!targetAdTimeRange) {
            console.log('📺 🤖 No ad found');
            return {
                adTimeRange: null,
            };
        }

        return {
            adTimeRange: targetAdTimeRange,
        };
    } catch (err) {
        return {
            adTimeRange: null,
            error: logAIServiceError(err, 'Gemini 广告识别请求失败'),
        };
    }
}

export async function identifyAdTimeRangeByGeminiAI(
    options: GeminiIdentifyAdTimeRangeOptions,
): Promise<AdTimeRange | undefined> {
    const result = await identifyAdTimeRangeByGeminiAIWithDiagnostics(options);
    return result.adTimeRange;
}

export async function identifyAdTimeRangeByOpenAIWithDiagnostics(
    options: OpenAIIdentifyAdTimeRangeOptions,
): Promise<IdentifyAdTimeRangeDiagnostics> {
    const { openAIClient, aiModel } = options;

    if (!openAIClient?.apiKey || !aiModel) {
        console.error('📺 🤖 ❌ AI not initialized yet, cannot identify ads');
        return {
            adTimeRange: null,
            error: 'not_initialized',
        };
    }

    const prompt = buildAdIdentifyPrompt(options);

    try {
        const responseText = await requestOpenAIResponse(
            openAIClient,
            aiModel,
            prompt,
            true,
            1000 * 60,
        );

        console.log('📺 🤖 AI response text', responseText);

        const targetAdTimeRange = parseAdTimeRangeResponse(responseText);
        if (!targetAdTimeRange) {
            console.log('📺 🤖 No ad found');
            return {
                adTimeRange: null,
            };
        }

        return {
            adTimeRange: targetAdTimeRange,
        };
    } catch (err) {
        return {
            adTimeRange: null,
            error: logAIServiceError(err, 'OpenAI 广告识别请求失败'),
        };
    }
}

export async function identifyAdTimeRangeByOpenAI(
    options: OpenAIIdentifyAdTimeRangeOptions,
): Promise<AdTimeRange | undefined> {
    const result = await identifyAdTimeRangeByOpenAIWithDiagnostics(options);
    return result.adTimeRange;
}

export async function identifyAdTimeRangeByAIWithDiagnostics(
    options: IdentifyAdTimeRangeOptions,
): Promise<IdentifyAdTimeRangeDiagnostics> {
    if (options.provider === 'openai') {
        return identifyAdTimeRangeByOpenAIWithDiagnostics(options);
    }

    return identifyAdTimeRangeByGeminiAIWithDiagnostics(options);
}

export async function identifyAdTimeRangeByAI(options: IdentifyAdTimeRangeOptions): Promise<AdTimeRange | undefined> {
    const result = await identifyAdTimeRangeByAIWithDiagnostics(options);
    return result.adTimeRange;
}
