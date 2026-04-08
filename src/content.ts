import { GoogleGenAI } from '@google/genai';
import { getAIServiceToastMessage } from './ai-service-error';
import {
  identifyAdTimeRangeByAIWithDiagnostics,
  identifyAdTimeRangeByBrowserAI,
  type AdTimeRange,
  type OpenAIClient,
} from './ai';
import {
  DEFAULT_CONFIG,
  getEffectiveApiBaseUrl,
  isMixedContentApiBaseUrl,
  isOpenAIFullEndpointUrl,
  isValidApiBaseUrl,
  normalizeUserConfig,
  type UserConfig,
} from './config';

const AD_TIME_RANGE_CACHE = 'AD_TIME_RANGE_CACHE';

interface AdTimeRangeCacheEntry {
  startTime: number;
  endTime: number;
  createAt: number;
}

interface IdentifyRequestMessageData {
  requestId: string;
  videoId: string;
  subtitleStr: string;
  videoTitle?: string;
  videoDescription?: string;
}

interface SafePageConfig {
  autoSkip: boolean;
  ignoreVideoLessThan5Minutes: boolean;
  ignoreVideoMoreThan30Minutes: boolean;
  usingBrowserAIModel: boolean;
}

let userConfig: UserConfig = DEFAULT_CONFIG;
let resolveConfigLoaded: (() => void) | null = null;
const configLoadedPromise = new Promise<void>((resolve) => {
  resolveConfigLoaded = resolve;
});

console.log('📺 ✔️ Content script loaded');

const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = chrome.runtime.getURL('lib/toastify.min.css');
(document.head || document.documentElement).appendChild(cssLink);

const injectScript = document.createElement('script');
injectScript.src = chrome.runtime.getURL('inject.js');
injectScript.onload = () => {
  console.log('📺 ✔️ Inject script loaded successfully');
  injectScript.remove();

  const toastifyScript = document.createElement('script');
  toastifyScript.src = chrome.runtime.getURL('lib/toastify.min.js');
  toastifyScript.onload = function() {
    console.log('📺 ✔️ Toastify loaded successfully');
    window.postMessage({ type: 'TOASTIFY_LOADED' }, '*');
  };
  (document.head || document.documentElement).appendChild(toastifyScript);
};
(document.head || document.documentElement).appendChild(injectScript);

function buildI18nMessages() {
  return {
    noApiKeyProvided: chrome.i18n.getMessage('noApiKeyProvided'),
    aiNotInitialized: chrome.i18n.getMessage('aiNotInitialized'),
    aiServiceFailed: chrome.i18n.getMessage('aiServiceFailed'),
    aiServiceAuthFailed: chrome.i18n.getMessage('aiServiceAuthFailed'),
    aiServiceForbidden: chrome.i18n.getMessage('aiServiceForbidden'),
    aiServiceServerError: chrome.i18n.getMessage('aiServiceServerError'),
    aiServiceTlsFailed: chrome.i18n.getMessage('aiServiceTlsFailed'),
    aiServiceCorsFailed: chrome.i18n.getMessage('aiServiceCorsFailed'),
    aiServiceTimeout: chrome.i18n.getMessage('aiServiceTimeout'),
    aiServiceNetworkFailed: chrome.i18n.getMessage('aiServiceNetworkFailed'),
    notLoginYet: chrome.i18n.getMessage('notLoginYet'),
    invalidApiBaseUrl: chrome.i18n.getMessage('invalidApiBaseUrl'),
    openAiEndpointPathNotSupported: chrome.i18n.getMessage('openAiEndpointPathNotSupported'),
    httpsPageCannotUseHttpApiBaseUrl: chrome.i18n.getMessage('httpsPageCannotUseHttpApiBaseUrl')
  };
}

function buildSafePageConfig(config: UserConfig): SafePageConfig {
  return {
    autoSkip: config.autoSkip,
    ignoreVideoLessThan5Minutes: config.ignoreVideoLessThan5Minutes,
    ignoreVideoMoreThan30Minutes: config.ignoreVideoMoreThan30Minutes,
    usingBrowserAIModel: config.usingBrowserAIModel,
  };
}

function sendConfigToPage() {
  window.postMessage({
    type: 'BILIBILI_AD_SKIP_CONFIG',
    config: buildSafePageConfig(userConfig),
    i18n: buildI18nMessages(),
  }, '*');
}

function sendToastToPage(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'error') {
  if (!message) {
    return;
  }

  window.postMessage({
    type: 'BILIBILI_AD_SKIP_TOAST',
    data: {
      message,
      type,
    }
  }, '*');
}

function sendIdentifyResultToPage(requestId: string, videoId: string, adTimeRange: AdTimeRange) {
  window.postMessage({
    type: 'BILIBILI_AD_IDENTIFY_RESULT',
    data: {
      requestId,
      videoId,
      adTimeRange,
    }
  }, '*');
}

async function cleanOldCache() {
  const adTimeRangeCache = (await chrome.storage.local.get(AD_TIME_RANGE_CACHE))[AD_TIME_RANGE_CACHE] || {};
  const threeDaysAgo = Date.now() - (3 * 24 * 60 * 60 * 1000);

  const cleanedCache = Object.entries(adTimeRangeCache).reduce((acc, [videoId, cacheEntry]: [string, any]) => {
    if (cacheEntry.createAt && cacheEntry.createAt > threeDaysAgo) {
      acc[videoId] = cacheEntry;
    }
    return acc;
  }, {} as Record<string, AdTimeRangeCacheEntry>);

  await chrome.storage.local.set({
    [AD_TIME_RANGE_CACHE]: cleanedCache
  });
}

async function saveAdTimeRange(videoId: string, adTimeRange: Exclude<AdTimeRange, null>) {
  const adTimeRangeCache = (await chrome.storage.local.get(AD_TIME_RANGE_CACHE))[AD_TIME_RANGE_CACHE] || {};

  await chrome.storage.local.set({
    [AD_TIME_RANGE_CACHE]: {
      ...adTimeRangeCache,
      [videoId]: {
        startTime: adTimeRange.startTime,
        endTime: adTimeRange.endTime,
        createAt: Date.now(),
      }
    }
  });

  await cleanOldCache();
}

async function getCachedAdTimeRange(videoId: string): Promise<AdTimeRange | undefined> {
  const adTimeRangeCache = (await chrome.storage.local.get(AD_TIME_RANGE_CACHE))[AD_TIME_RANGE_CACHE] || {};
  const cacheEntry = adTimeRangeCache[videoId] as AdTimeRangeCacheEntry | undefined;
  if (!cacheEntry) {
    return undefined;
  }

  return {
    startTime: cacheEntry.startTime,
    endTime: cacheEntry.endTime,
  };
}

function getOpenAIClient(config: UserConfig): OpenAIClient | null {
  const effectiveApiBaseUrl = getEffectiveApiBaseUrl(config.aiProvider, config.apiBaseUrl);
  if (!isValidApiBaseUrl(effectiveApiBaseUrl, 'openai')) {
    sendToastToPage(
      isOpenAIFullEndpointUrl(effectiveApiBaseUrl)
        ? chrome.i18n.getMessage('openAiEndpointPathNotSupported')
        : chrome.i18n.getMessage('invalidApiBaseUrl')
    );
    return null;
  }

  if (isMixedContentApiBaseUrl(effectiveApiBaseUrl, window.location.protocol)) {
    sendToastToPage(chrome.i18n.getMessage('httpsPageCannotUseHttpApiBaseUrl'));
    return null;
  }

  return {
    apiKey: config.apiKey,
    apiBaseUrl: effectiveApiBaseUrl,
  };
}

async function identifyAdTimeRange(data: IdentifyRequestMessageData): Promise<AdTimeRange> {
  if (!data.videoId || !data.subtitleStr) {
    return null;
  }

  const cachedAdTimeRange = await getCachedAdTimeRange(data.videoId);
  if (cachedAdTimeRange) {
    console.log('📺 📦 ✔️ Content script cache hit:', data.videoId, cachedAdTimeRange);
    return cachedAdTimeRange;
  }

  if (userConfig.usingBrowserAIModel) {
    return await identifyAdTimeRangeByBrowserAI({
      subStr: data.subtitleStr,
      aiModel: userConfig.aiModel,
      videoTitle: data.videoTitle,
      videoDescription: data.videoDescription,
    }) || null;
  }

  if (!userConfig.apiKey) {
    sendToastToPage(chrome.i18n.getMessage('noApiKeyProvided'));
    return null;
  }

  if (userConfig.aiProvider === 'openai') {
    const openAIClient = getOpenAIClient(userConfig);
    if (!openAIClient) {
      return null;
    }

    const result = await identifyAdTimeRangeByAIWithDiagnostics({
      provider: 'openai',
      openAIClient,
      subStr: data.subtitleStr,
      aiModel: userConfig.aiModel,
      videoTitle: data.videoTitle,
      videoDescription: data.videoDescription,
    });

    if (result.error && result.error !== 'not_initialized') {
      sendToastToPage(getAIServiceToastMessage(result.error, buildI18nMessages()));
    } else if (result.error === 'not_initialized') {
      sendToastToPage(chrome.i18n.getMessage('aiNotInitialized'));
    }

    return result.adTimeRange;
  }

  const geminiClient = userConfig.apiBaseUrl
    ? new GoogleGenAI({
        apiKey: userConfig.apiKey,
        httpOptions: {
          baseUrl: userConfig.apiBaseUrl,
        },
      })
    : new GoogleGenAI({ apiKey: userConfig.apiKey });

  const result = await identifyAdTimeRangeByAIWithDiagnostics({
    provider: 'gemini',
    geminiClient,
    subStr: data.subtitleStr,
    aiModel: userConfig.aiModel,
    videoTitle: data.videoTitle,
    videoDescription: data.videoDescription,
  });

  if (result.error && result.error !== 'not_initialized') {
    sendToastToPage(getAIServiceToastMessage(result.error, buildI18nMessages()));
  } else if (result.error === 'not_initialized') {
    sendToastToPage(chrome.i18n.getMessage('aiNotInitialized'));
  }

  return result.adTimeRange;
}

async function handleIdentifyRequest(data: IdentifyRequestMessageData) {
  const adTimeRange = await identifyAdTimeRange(data);

  if (adTimeRange) {
    await saveAdTimeRange(data.videoId, adTimeRange);
  }

  sendIdentifyResultToPage(data.requestId, data.videoId, adTimeRange);
}

window.addEventListener('message', async (event) => {
  if (event.source !== window) {
    return;
  }

  if (event.data.type === 'BILIBILI_AD_SKIP_READY') {
    await configLoadedPromise;
    sendConfigToPage();
    return;
  }

  if (event.data.type === 'BILIBILI_AD_IDENTIFY_REQUEST') {
    await configLoadedPromise;
    await handleIdentifyRequest(event.data.data as IdentifyRequestMessageData);
  }
});

(async () => {
  const result = await chrome.storage.local.get(Object.keys(DEFAULT_CONFIG));
  userConfig = normalizeUserConfig(result);

  console.log('📺 ✔️ Content script - Config retrieved:', {
    aiProvider: userConfig.aiProvider,
    hasApiKey: Boolean(userConfig.apiKey),
    apiBaseUrl: userConfig.apiBaseUrl,
    aiModel: userConfig.aiModel,
    autoSkip: userConfig.autoSkip,
    ignoreVideoLessThan5Minutes: userConfig.ignoreVideoLessThan5Minutes,
    ignoreVideoMoreThan30Minutes: userConfig.ignoreVideoMoreThan30Minutes,
    usingBrowserAIModel: userConfig.usingBrowserAIModel,
  });

  await cleanOldCache();
  if (resolveConfigLoaded !== null) {
    (resolveConfigLoaded as () => void)();
  }
  resolveConfigLoaded = null;
})();
