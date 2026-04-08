import { initializeAdBar, addAnimation, removeAnimation, cleanupAll, updateUiConfig } from './bilibili-ui';
import { convertSubtitleObjToStr, subtitle, getVideoIdFromCurrentPage } from './util';
import { thinkingAnimationClass, warningAnimationClass } from './style';
import { showToast, initToastMessages, messages, notifyDelayedMessages } from './toast';

interface AdTimeRange {
  startTime: number;
  endTime: number;
}

interface PageConfig {
  autoSkip: boolean;
  ignoreVideoLessThan5Minutes: boolean;
  ignoreVideoMoreThan30Minutes: boolean;
  usingBrowserAIModel: boolean;
}

let config: PageConfig | null = null;

console.log('📺 ✔️ Inject script ready, signaling to content script');

window.postMessage({ type: 'BILIBILI_AD_SKIP_READY' }, '*');

const webResponseCache: { [videoBvid: string]: object } = {};
let currentVideoId: string | null = null;
let latestIdentifyRequestId: string | null = null;

window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return;
  }

  if (event.data.type === 'TOASTIFY_LOADED') {
    const notifyWhenBodyReady = () => {
      if (document.body) {
        notifyDelayedMessages();
      } else {
        requestAnimationFrame(notifyWhenBodyReady);
      }
    };

    notifyWhenBodyReady();
    return;
  }

  if (event.data.type === 'BILIBILI_AD_SKIP_TOAST') {
    const toastData = event.data.data || {};
    showToast(toastData.message, toastData.type);
    return;
  }

  if (event.data.type === 'BILIBILI_AD_SKIP_CONFIG') {
    config = event.data.config as PageConfig;
    updateUiConfig({ autoSkip: Boolean(config?.autoSkip) });

    if (event.data.i18n) {
      initToastMessages(event.data.i18n);
    }

    console.log('📺 ⚙️ ✔️ Safe config received via postMessage:', {
      autoSkip: config?.autoSkip,
      ignoreVideoLessThan5Minutes: config?.ignoreVideoLessThan5Minutes,
      ignoreVideoMoreThan30Minutes: config?.ignoreVideoMoreThan30Minutes,
      usingBrowserAIModel: config?.usingBrowserAIModel
    });
    return;
  }

  if (event.data.type === 'BILIBILI_AD_IDENTIFY_RESULT') {
    const resultData = event.data.data || {};
    if (!resultData.requestId || resultData.requestId !== latestIdentifyRequestId) {
      return;
    }

    const currentPageVideoId = getVideoIdFromCurrentPage();
    if (!resultData.videoId || resultData.videoId !== currentPageVideoId) {
      return;
    }

    removeAnimation();

    const adTimeRange = resultData.adTimeRange as AdTimeRange | null;
    if (!adTimeRange) {
      console.log('📺 ✔️ No ads detected in this video');
      return;
    }

    console.log('📺 ✔️ Ad detected:', adTimeRange);
    initializeAdBar(adTimeRange.startTime, adTimeRange.endTime);
  }
});

async function requestAdIdentification(response: any, videoId: string): Promise<void> {
  if (!response.data?.name) {
    console.error('📺 ❌ Not login yet');
    showToast(messages.notLoginYet);
    return;
  }

  if (!response.data?.subtitle?.subtitles?.length) {
    console.error('📺 ❌ No subtitles found in response');
    addAnimation(warningAnimationClass);
    setTimeout(() => {
      removeAnimation();
    }, 1000 * 3);
    return;
  }

  const subtitles = response.data.subtitle.subtitles;
  const targetSubtitle = subtitles[0];
  if (!targetSubtitle.subtitle_url) {
    console.error('📺 ❌ Unable to get the subtitle url from', subtitles);
    addAnimation(warningAnimationClass);
    setTimeout(() => {
      removeAnimation();
    }, 1000 * 3);
    return;
  }

  const fullUrl = targetSubtitle.subtitle_url.startsWith('//')
    ? `https:${targetSubtitle.subtitle_url}`
    : targetSubtitle.subtitle_url;

  const jsonRes = await (await fetch(fullUrl)).json();
  const subtitlesRes: subtitle[] = jsonRes.body;
  const subtitleStr = convertSubtitleObjToStr(subtitlesRes);

  // @ts-ignore
  const videoTitle = window.__INITIAL_STATE__.videoData.title;
  // @ts-ignore
  const videoDescription = window.__INITIAL_STATE__.videoData.desc;

  latestIdentifyRequestId = `${videoId}:${Date.now()}`;
  addAnimation(thinkingAnimationClass);

  window.postMessage({
    type: 'BILIBILI_AD_IDENTIFY_REQUEST',
    data: {
      requestId: latestIdentifyRequestId,
      videoId,
      subtitleStr,
      videoTitle,
      videoDescription,
    }
  }, '*');
}

(function() {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method: string, url: string | URL, ...args: any[]) {
    // @ts-ignore
    this._url = url.toString();
    // @ts-ignore
    return originalOpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function(...args: any[]) {
    // @ts-ignore
    const url = this._url;

    if (window.location.pathname.startsWith('/video/') && url && url.includes('api.bilibili.com/x/player/wbi/v2')) {
      this.addEventListener('load', async function() {
        try {
          if (this.status !== 200) {
            console.error('📺 ❌ Failed to fetch the api.bilibili.com/x/player/wbi/v2 API', this.status, this.responseText);
            return;
          }

          const videoId = getVideoIdFromCurrentPage();
          const response = JSON.parse(this.responseText);
          const videoBvid = response.data.bvid;
          webResponseCache[videoBvid] = response;

          if (videoBvid !== videoId) {
            return;
          }

          // @ts-ignore
          const videoDuration = window.__INITIAL_STATE__.videoData.duration;
          if (config?.ignoreVideoLessThan5Minutes && videoDuration !== null && videoDuration <= 60 * 5) {
            console.log(`📺 ✔️ Ignoring video processing: video duration (${videoDuration.toFixed(2)}s) is less than 5 minutes`);
            return;
          }

          if (config?.ignoreVideoMoreThan30Minutes && videoDuration !== null && videoDuration > 60 * 30) {
            console.log(`📺 ✔️ Ignoring video processing: video duration (${videoDuration.toFixed(2)}s) is more than 30 minutes`);
            return;
          }

          if (!videoId) {
            console.error('📺 ❌ No video ID found');
            return;
          }

          await requestAdIdentification(response, videoId);
        } catch (error) {
          console.error('📺 ❌ Error processing player response:', error);
          removeAnimation();
        }
      });
    }

    // @ts-ignore
    return originalSend.call(this, ...args);
  };
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
    removeAnimation();
    currentVideoId = urlVideoId;

    if (webResponseCache[urlVideoId]) {
      await requestAdIdentification(webResponseCache[urlVideoId], urlVideoId);
    }
  }, 300);
}

if (window.location.pathname.startsWith('/video/')) {
  currentVideoId = getVideoIdFromCurrentPage();
}

monitorUrlChanges();
