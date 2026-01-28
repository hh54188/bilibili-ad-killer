const DEFAULT_CONFIG = {
  apiKey: '',
  aiModel: 'gemini-2.5-flash',
  autoSkip: true,
  ignoreVideoLessThan5Minutes: true,
  usingBrowserAIModel: false,
  usingDify: false,
  difyServiceAPI: '',
  difyApiKey: '',
}

console.log('📺 ✔️ Content script loaded');
const AD_TIME_RANGE_CACHE = 'AD_TIME_RANGE_CACHE';

// Inject Toastify CSS first
const cssLink = document.createElement('link');
cssLink.rel = 'stylesheet';
cssLink.href = chrome.runtime.getURL('lib/toastify.min.css');
(document.head || document.documentElement).appendChild(cssLink);

// Inject inject script, then Toastify JS
const injectScript = document.createElement('script');
injectScript.src = chrome.runtime.getURL('inject.js');
injectScript.onload = () => {
  console.log('📺 ✔️ Inject script loaded successfully');
  injectScript.remove();
  // Now inject Toastify
  const toastifyScript = document.createElement('script');
  toastifyScript.src = chrome.runtime.getURL('lib/toastify.min.js');
  toastifyScript.onload = function() {
    console.log('📺 ✔️ Toastify loaded successfully');
    window.postMessage({ type: 'TOASTIFY_LOADED' }, '*');
  };
  (document.head || document.documentElement).appendChild(toastifyScript);
};
(document.head || document.documentElement).appendChild(injectScript);

(async () => {
  const result = await chrome.storage.local.get(['apiKey', 'aiModel', 'autoSkip', 'ignoreVideoLessThan5Minutes', 'usingBrowserAIModel', 'usingDify','difyServiceAPI','difyApiKey']);
  const apiKey = result.apiKey || DEFAULT_CONFIG.apiKey;
  const aiModel = result.aiModel || DEFAULT_CONFIG.aiModel;
  const usingDify = typeof result.usingDify !== undefined 
    ? result.usingDify 
    : DEFAULT_CONFIG.usingDify;
  const difyServiceAPI = typeof result.difyServiceAPI !== undefined 
    ? result.difyServiceAPI 
    : DEFAULT_CONFIG.difyServiceAPI;
  const difyApiKey = typeof result.difyApiKey !== undefined 
    ? result.difyApiKey 
    : DEFAULT_CONFIG.difyApiKey;
  const autoSkip = typeof result.autoSkip !== undefined 
    ? result.autoSkip 
    : DEFAULT_CONFIG.autoSkip;
  const usingBrowserAIModel = typeof result.usingBrowserAIModel !== undefined 
    ? result.usingBrowserAIModel 
    : DEFAULT_CONFIG.usingBrowserAIModel;
  const ignoreVideoLessThan5Minutes = typeof result.ignoreVideoLessThan5Minutes !== undefined 
    ? result.ignoreVideoLessThan5Minutes 
    : DEFAULT_CONFIG.ignoreVideoLessThan5Minutes;

  console.log('📺 ✔️ Content script - Config retrieved:', { apiKey, aiModel, autoSkip, usingBrowserAIModel, ignoreVideoLessThan5Minutes });

  const sendConfig = () => {
    console.log('📺 ✔️ Sending config via postMessage');
    window.postMessage({
      type: 'BILIBILI_AD_SKIP_CONFIG',
      config: {
        apiKey,
        aiModel,
        autoSkip,
        ignoreVideoLessThan5Minutes,
        usingBrowserAIModel,
        usingDify,
        difyServiceAPI,
        difyApiKey,
      },
      i18n: {
        noApiKeyProvided: chrome.i18n.getMessage('noApiKeyProvided'),
        aiNotInitialized: chrome.i18n.getMessage('aiNotInitialized'),
        aiServiceFailed: chrome.i18n.getMessage('aiServiceFailed'),
        notLoginYet: chrome.i18n.getMessage('notLoginYet')
      }
    }, '*');
  };

  const sendAdTimeRangeCache = async () => {
    const adTimeRangeCache = (await chrome.storage.local.get(AD_TIME_RANGE_CACHE))[AD_TIME_RANGE_CACHE]
    window.postMessage({
      type: 'SEND_VIDEO_AD_TIMERANGE',
      data: adTimeRangeCache 
    }, '*');
  }

  const cleanOldCache = async () => {
    const adTimeRangeCache = (await chrome.storage.local.get(AD_TIME_RANGE_CACHE))[AD_TIME_RANGE_CACHE] || {};
    const threeDaysAgo = +new Date() - (3 * 24 * 60 * 60 * 1000); // 3 days in milliseconds
    
    const cleanedCache = Object.entries(adTimeRangeCache).reduce((acc, [videoId, cacheEntry]: [string, any]) => {
      // Keep entries that were created less than 3 days ago
      if (cacheEntry.createAt && cacheEntry.createAt > threeDaysAgo) {
        acc[videoId] = cacheEntry;
      }
      return acc;
    }, {} as Record<string, any>);

    await chrome.storage.local.set({
      [AD_TIME_RANGE_CACHE]: cleanedCache
    });

    const removedCount = Object.keys(adTimeRangeCache).length - Object.keys(cleanedCache).length;
    if (removedCount > 0) {
      console.log(`📺 ✔️ Cleaned ${removedCount} old cache entries (older than 3 days)`);
    }
  }

  window.addEventListener('message', async (event) => {
    if (event.source === window && event.data.type === 'BILIBILI_AD_SKIP_READY') {
      console.log('📺 💬 Received raw BILIBILI_AD_SKIP_READY event', event)
      console.log('📺 ✔️ Inject script ready, sending config');
      sendConfig();
    }

    if (event.source === window && event.data.type === "REQUEST_VIDEO_AD_TIMERANGE") {
      console.log('📺 💬 Received raw REQUEST_VIDEO_AD_TIMERANGE event', event)
      console.log('📺 ✔️ Received request for AD time range cache');
      await sendAdTimeRangeCache()
    }

    if (event.source === window && event.data.type === 'SAVE_VIDEO_AD_TIMERANGE') {
      console.log('📺 💬 Received raw SAVE_VIDEO_AD_TIMERANGE event', event)
      const adTimeRangeCache = (await chrome.storage.local.get(AD_TIME_RANGE_CACHE))[AD_TIME_RANGE_CACHE] || {};
      const eventData = event.data.data;
      if (!eventData.videoId || !eventData.startTime || !eventData.endTime) {
        console.log('📺 ❌ No ad time range received')
      }

      await chrome.storage.local.set({
        [AD_TIME_RANGE_CACHE]: {
          ...adTimeRangeCache,
          [eventData.videoId]: {
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            createAt: +new Date()
          }
        }
      })

      await cleanOldCache()
    }
  });
})();

