import { GoogleGenAI } from '@google/genai';
import { initializeAdBar, addAnimation, removeAnimation, cleanupAll } from './bilibili-ui'
import { convertSubtitleObjToStr, subtitle, getVideoIdFromCurrentPage } from './util';
import { thinkingAnimationClass, warningAnimationClass } from './style';
import { showToast, initToastMessages, messages, notifyDelayedMessages } from './toast'
import { identifyAdTimeRangeByGeminiAI, AdTimeRange, checkGeminiConnectivity, identifyAdTimeRangeByDify } from './ai';
import { initializeConfig, UserConfig } from './config'

interface AdTimeRangeCache {
  [videoId: string]: AdTimeRange | null;
}

let config: UserConfig | null = null;
let geminiClient: GoogleGenAI | null = null;
let adTimeRangeCache: AdTimeRangeCache | null = null;

console.log('📺 ✔️ Inject script ready, signaling to content script');

window.postMessage({ type: 'BILIBILI_AD_SKIP_READY' }, '*');
window.postMessage({ type: 'REQUEST_VIDEO_AD_TIMERANGE' }, '*');

const webResponseCache: { [videoBvid: string]: object } = {};
let currentVideoId: string | null = null;

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  if (event.data.type === 'TOASTIFY_LOADED') {
    console.log('📺 ✔️ Toastify loaded successfully, waiting for document.body');

    const notifyWhenBodyReady = () => {
      if (document.body) {
        console.log('📺 ✔️ document.body is ready, notifying delayed messages');
        notifyDelayedMessages();
      } else {
        console.log('📺 ⏳ document.body not ready yet, checking again...');
        requestAnimationFrame(notifyWhenBodyReady);
      }
    };

    notifyWhenBodyReady();
    return;
  }

  if (event.data.type === 'SEND_VIDEO_AD_TIMERANGE') {
    console.log('📺 💬 Retrived ad time cache', event.data);
    adTimeRangeCache = event.data.data
    if (!adTimeRangeCache || (adTimeRangeCache && Object.keys(adTimeRangeCache).length == 0)) {
      return;
    }
  }

  if (event.data.type === 'BILIBILI_AD_SKIP_CONFIG') {
    console.log('📺 ⚙️ 💬 Received message:', event.data);
    const receivedConfig = event.data.config;
    config = receivedConfig;
    initializeConfig(config!)

    if (event.data.i18n) {
      initToastMessages(event.data.i18n)
    }

    console.log('📺 ⚙️ ✔️ Config received via postMessage:', {
      apiKey: receivedConfig.apiKey,
      aiModel: receivedConfig.aiModel,
      autoSkip: receivedConfig.autoSkip,
      ignoreVideoLessThan5Minutes: receivedConfig.ignoreVideoLessThan5Minutes,
      usingBrowserAIModel: receivedConfig.usingBrowserAIModel,
      usingDify: receivedConfig.usingDify,
      difyServiceAPI: receivedConfig.difyServiceAPI,
      difyApiKey: receivedConfig.difyApiKey,
    });
    if (!config?.usingDify) {
      if (receivedConfig.apiKey) {
        geminiClient = new GoogleGenAI({ apiKey: receivedConfig.apiKey });
        console.log('📺 🤖 ✔️ AI initialized');
      } else {
        console.log('📺 🤖 ❌ No API key provided');
        showToast(messages.noApiKeyProvided);
      }
    } else {
      if (!(receivedConfig.difyServiceAPI && receivedConfig.difyApiKey)) {
        console.log('📺 🤖 ❌ No Dify service API or API key provided');
        showToast(messages.difyNotInitialized);
      }else{
        console.log('📺 🤖 ✔️ Dify initialized');
      }
    }
  }
});

async function processVideoSubtitles(response: any, videoId: string): Promise<void> {

  if (!response.data?.name) {
    console.error("📺 ❌ Not login yet")
    showToast(messages.notLoginYet);
    return;
  }

  if (!response.data?.subtitle?.subtitles?.length) {
    console.error("📺 ❌ No subtitles found in response")
    addAnimation(warningAnimationClass);
    setTimeout(() => {
      removeAnimation();
    }, 1000 * 3);
    return;
  }

  const subtitles = response.data.subtitle.subtitles;
  console.log('📺 Found subtitles array:', subtitles);

  const targetSubtitle = subtitles[0]
  if (!targetSubtitle.subtitle_url) {
    console.error('📺 ❌ Unable to get the subtitle url from', subtitles);
    addAnimation(warningAnimationClass);
    setTimeout(() => {
      removeAnimation();
    }, 1000 * 3);
    return;
  }

  const fullUrl = targetSubtitle.subtitle_url.startsWith('//')
    ? 'https:' + targetSubtitle.subtitle_url
    : targetSubtitle.subtitle_url;

  console.log(`📺 ✔️ Language: ${targetSubtitle.lan_doc} (${targetSubtitle.lan})`);
  console.log(`📺 ✔️ Type: ${targetSubtitle.type}`);
  console.log(`📺 ✔️ URL: ${fullUrl}`);
  console.log(`📺 ✔️ Full subtitle object:`, targetSubtitle);

  const jsonRes = await (await fetch(fullUrl)).json();
  const subtitlesRes: subtitle[] = jsonRes.body;
  const subtitleStr = convertSubtitleObjToStr(subtitlesRes);

  let adTimeRange: AdTimeRange | undefined = null;

  console.log('📺 📦 ✔️ Video ID:', videoId);
  console.log('📺 📦 ✔️ Ad time range cache:', adTimeRangeCache);

  if (adTimeRangeCache && videoId && adTimeRangeCache[videoId]) {
    adTimeRange = adTimeRangeCache[videoId];
    console.log('📺 📦 ✔️ Ad time range cache found for video:', videoId, adTimeRange);
  } else {
    console.log('📺 📦 ✔️ No ad time range cache found for video:', videoId);
    // @ts-ignore
    const videoTitle = window.__INITIAL_STATE__.videoData.title
    // @ts-ignore
    const videoDescription = window.__INITIAL_STATE__.videoData.desc
    try {
      addAnimation(thinkingAnimationClass);
      // if dify is enabled, use dify to identify ad time range
      if (config?.usingDify) {
        console.info('📺 🤖 Using Dify to identify ad time range');
        adTimeRange = await identifyAdTimeRangeByDify({
          difyServiceAPI: config.difyServiceAPI,
          difyApiKey: config.difyApiKey,
          subStr: subtitleStr,
          videoTitle,
          videoDescription,
        });
      } else {
        if (!geminiClient || !config?.aiModel) {
          console.error('📺 🤖 ❌ Unable continue to identify ad due to lack uninitialized Gemini client');
          return
        }
      
        const connectivity = await checkGeminiConnectivity(geminiClient, config.aiModel);
        console.log("📺 🤖 Check Gemini connectivity", connectivity);
        adTimeRange = await identifyAdTimeRangeByGeminiAI({
          geminiClient: geminiClient,
          subStr: subtitleStr,
          aiModel: config.aiModel,
          videoTitle,
          videoDescription
        });
      }
      removeAnimation();
    } catch (error) {
      console.error('📺 🤖 ❌ Error identifying ad time range:', error);
      removeAnimation();
    }
  }

  if (!adTimeRange) {
    console.log('📺 ✔️ No ads detected in this video');
    return;
  }

  console.log('📺 ✔️ Ad detected:', adTimeRange);
  initializeAdBar(adTimeRange.startTime, adTimeRange.endTime);
}

(function () {

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...args: any[]) {
    // @ts-ignore
    this._url = url.toString();
    // @ts-ignore
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args: any[]) {
    // @ts-ignore
    const url = this._url;

    if (window.location.pathname.startsWith('/video/') && url && url.includes('api.bilibili.com/x/player/wbi/v2')) {
      console.log('📺 ✔️ Detected player API request');

      this.addEventListener('load', async function () {
        try {
          if (this.status !== 200) {
            console.error("📺 ❌ Failed to fetch the api.bilibili.com/x/player/wbi/v2 API", this.status, this.responseText);
            return;
          }

          const videoId = getVideoIdFromCurrentPage();
          const response = JSON.parse(this.responseText);
          const videoBvid = response.data.bvid;
          webResponseCache[videoBvid] = response;

          if (videoBvid !== videoId) {
            return;
          }

          if (config?.ignoreVideoLessThan5Minutes) {
            // @ts-ignore
            const videoDuration = window.__INITIAL_STATE__.videoData.duration
            console.log('📺 ✔️ Video duration', videoDuration)
            if (videoDuration !== null && videoDuration <= 60 * 5) {
              console.log(`📺 ✔️ Ignoring video processing: video duration (${videoDuration.toFixed(2)}s) is less than 5 minutes`);
              return;
            }
          }

          if (!videoId) {
            console.error('📺 ❌ No video ID found');
            return;
          }

          await processVideoSubtitles(response, videoId);
        } catch (error) {
          console.error('📺 ❌ Error parsing response:', error);
        }
      });
    }

    // @ts-ignore
    return originalSend.call(this, ...args);
  };

  console.log('📺 ✔️ XHR interception active');
})();

function monitorUrlChanges() {
  setInterval(async () => {
    if (!window.location.pathname.startsWith('/video/')) {
      return;
    }

    const urlVideoId = getVideoIdFromCurrentPage();

    if (!urlVideoId || urlVideoId === currentVideoId) {
      return;
    }

    console.log('📺 🔄 URL changed:', currentVideoId, '→', urlVideoId);

    cleanupAll();
    currentVideoId = urlVideoId;

    if (webResponseCache[urlVideoId]) {
      console.log('📺 ⚡ Processing from cache:', urlVideoId);
      await processVideoSubtitles(webResponseCache[urlVideoId], urlVideoId);
    } else {
      console.log('📺 ⏭️ Cache miss for:', urlVideoId, '- cleaned up only');
    }

  }, 300);
}

if (window.location.pathname.startsWith('/video/')) {
  currentVideoId = getVideoIdFromCurrentPage();
  console.log('📺 ✔️ Initial video ID:', currentVideoId);
}

monitorUrlChanges();
console.log('📺 ✔️ URL monitoring active');

