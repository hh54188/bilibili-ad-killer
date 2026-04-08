import { skipAnimationClass, aboutToSkipAdStyle, initializeAdBarStyle, thinkingStyle, warningStyle } from './style';

export const progressWrapClassSelector ='.bpx-player-progress-schedule';
export const skipAdBarClass = "bilibili-ad-bar"
export const playerContainerSelector = '.bpx-player-container';
export const playWrapId = 'bilibili-player';

let autoSkipEnabled = true;

export function updateUiConfig(config: { autoSkip: boolean }): void {
    autoSkipEnabled = config.autoSkip;
}

// Cleanup tracking system
let resizeObservers: ResizeObserver[] = [];
let eventListeners: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];
let intervals: number[] = [];
let timeouts: number[] = [];
let videoEventListeners: Array<{ video: HTMLVideoElement; type: string; listener: EventListener }> = [];

export function injectSkipAnimationStyles(): void {
    if (!document.getElementById('bilibili-skip-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'bilibili-skip-animation-styles';
        style.textContent = aboutToSkipAdStyle();
        document.head.appendChild(style);
        console.log('📺 ✔️ Skip animation styles injected');
    }

    if (!document.getElementById('bilibili-thinking-animation-styles')) {
        const thinkingStyleElement = document.createElement('style');
        thinkingStyleElement.id = 'bilibili-thinking-animation-styles';
        thinkingStyleElement.textContent = thinkingStyle();
        document.head.appendChild(thinkingStyleElement);
        console.log('📺 🤖 ✔️ Thinking animation styles injected');
    }

    if (!document.getElementById('bilibili-warning-animation-styles')) {
        const warningStyleElement = document.createElement('style');
        warningStyleElement.id = 'bilibili-warning-animation-styles';
        warningStyleElement.textContent = warningStyle();
        document.head.appendChild(warningStyleElement);
        console.log('📺 🤖 ✔️ Warning animation styles injected');
    }
}

function calculateAdBarPosition(
    adStartSeconds: number,
    adEndSeconds: number,
    videoDuration: number,
    progressBarWidth: number
): { left: number; width: number } {
    if (videoDuration <= 0) {
        console.error('📺 ❌ Video duration is not valid', videoDuration);
        throw Error('Video duration is not valid');
    }

    if (progressBarWidth <= 0) {
        console.error('📺 ❌ Progress bar width is not valid', progressBarWidth);
        throw Error('Progress bar width is not valid');
    }

    const startTime = Math.max(0, Math.min(adStartSeconds, videoDuration));
    const endTime = Math.max(startTime, Math.min(adEndSeconds, videoDuration));

    const leftPercent = startTime / videoDuration;
    const widthPercent = (endTime - startTime) / videoDuration;

    const left = leftPercent * progressBarWidth;
    const width = widthPercent * progressBarWidth;

    return { left, width };
}

function updateAdBarStyles(adStartSeconds: number, adEndSeconds: number): void {
    const adBars = Array.from(document.querySelectorAll(`.${skipAdBarClass}`)) as HTMLElement[];
    if (!adBars?.length) {
        return;
    }

    const progressWraps = Array.from(document.querySelectorAll(progressWrapClassSelector)) as HTMLElement[];
    const video = document.querySelector('video') as HTMLVideoElement;

    if (!progressWraps?.length || !video || !video.duration) {
        return;
    }

    for (const progressWrap of progressWraps) {
        const progressBarWidth = progressWrap.offsetWidth;
        const videoDuration = video.duration;

        const { left, width } = calculateAdBarPosition(
            adStartSeconds,
            adEndSeconds,
            videoDuration,
            progressBarWidth
        );

        const adBar = progressWrap.querySelector(`.${skipAdBarClass}`) as HTMLElement;
        if (!adBar) {
            return;
        }

        adBar.style.left = `${left}px`;
        adBar.style.width = `${width}px`;
    }

}

function createIndividualAdBar(
    progressWrap: HTMLElement,
    adStartSeconds: number,
    adEndSeconds: number,
    videoDuration: number
): void {
    const progressBarWidth = progressWrap.offsetWidth;

    const { left, width } = calculateAdBarPosition(
        adStartSeconds,
        adEndSeconds,
        videoDuration,
        progressBarWidth
    );

    const existingAdBar = progressWrap.querySelector(`.${skipAdBarClass}`);
    if (existingAdBar) {
        existingAdBar.remove();
    }

    const adBar = document.createElement('div');
    adBar.className = skipAdBarClass
    adBar.style.cssText = initializeAdBarStyle(left, width);

    const parentStyle = window.getComputedStyle(progressWrap);
    if (parentStyle.position === 'static') {
        progressWrap.style.position = 'relative';
    }

    progressWrap.appendChild(adBar);
    console.log(`📺 ✔️ Ad bar created: ${adStartSeconds}s - ${adEndSeconds}s (${left.toFixed(2)}px, ${width.toFixed(2)}px)`);
}

function createAdBar(adStartSeconds: number, adEndSeconds: number): void {
    const progressWraps = Array.from(document.querySelectorAll(progressWrapClassSelector)) as HTMLElement[];

    if (!progressWraps?.length) {
        console.error('📺 ❌ Progress bar not found');
        return;
    }

    console.log('📺 ✔️ Progress bars found, creating ad bars...');
    const video = document.querySelector('video') as HTMLVideoElement;
    if (!video || !video.duration) {
        console.error('📺 ❌ Video element or duration not found');
        return;
    }

    for (const progressWrap of progressWraps) {
        createIndividualAdBar(progressWrap, adStartSeconds, adEndSeconds, video.duration);
    }

}

function setupAdBarResizeHandlers(adStartSeconds: number, adEndSeconds: number): void {
    let resizeTimeout: number | null = null;

    const handleResize = () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
            // Remove old timeout from tracking
            timeouts = timeouts.filter(id => id !== resizeTimeout!);
        }

        resizeTimeout = window.setTimeout(() => {
            updateAdBarStyles(adStartSeconds, adEndSeconds);
        }, 100);
        
        // Track timeout for cleanup
        timeouts.push(resizeTimeout);
    };

    window.addEventListener('resize', handleResize);
    // Track event listener for cleanup
    eventListeners.push({ target: window, type: 'resize', listener: handleResize as EventListener });

    const progressWrap = document.querySelector(progressWrapClassSelector);
    if (progressWrap) {
        console.log('📺 ✔️ Progress wrap found, setting up resize handlers...');
        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(progressWrap);
        // Track ResizeObserver for cleanup
        resizeObservers.push(resizeObserver);
    }

    const playerContainer = document.querySelector(playerContainerSelector);
    if (playerContainer) {
        console.log('📺 ✔️ Player container found, setting up resize handlers...');
        const containerResizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        containerResizeObserver.observe(playerContainer);
        // Track ResizeObserver for cleanup
        resizeObservers.push(containerResizeObserver);
    }
}

let commonAnimationElement: HTMLElement | null = null;

// Cleanup function to remove all created elements and listeners
export function cleanupAll(): void {
    console.log('📺 🧹 Starting cleanup of all elements and listeners...');
    
    // Remove all ad bars
    const adBars = document.querySelectorAll(`.${skipAdBarClass}`);
    adBars.forEach(bar => {
        bar.remove();
        console.log('📺 🧹 Removed ad bar');
    });
    
    // Remove common animation element
    if (commonAnimationElement) {
        commonAnimationElement.remove();
        commonAnimationElement = null;
        console.log('📺 🧹 Removed common animation element');
    }
    
    // Remove skip animation elements (may exist from setupAutoSkip)
    const skipAnimations = document.querySelectorAll(`.${skipAnimationClass}`);
    skipAnimations.forEach(anim => {
        anim.remove();
        console.log('📺 🧹 Removed skip animation element');
    });
    
    // Disconnect all ResizeObservers
    resizeObservers.forEach(observer => {
        observer.disconnect();
        console.log('📺 🧹 Disconnected ResizeObserver');
    });
    resizeObservers = [];
    
    // Remove all event listeners
    eventListeners.forEach(({ target, type, listener }) => {
        target.removeEventListener(type, listener);
        console.log(`📺 🧹 Removed event listener: ${type}`);
    });
    eventListeners = [];
    
    // Remove all video event listeners
    videoEventListeners.forEach(({ video, type, listener }) => {
        video.removeEventListener(type, listener);
        console.log(`📺 🧹 Removed video event listener: ${type}`);
    });
    videoEventListeners = [];
    
    // Clear all intervals
    intervals.forEach(id => {
        clearInterval(id);
        console.log('📺 🧹 Cleared interval');
    });
    intervals = [];
    
    // Clear all timeouts
    timeouts.forEach(id => {
        clearTimeout(id);
        console.log('📺 🧹 Cleared timeout');
    });
    timeouts = [];
    
    console.log('📺 🧹 ✔️ Cleanup completed');
}

export function addAnimation(targetAnimationClass: string): void {
    // Ensure styles are injected before adding animation
    injectSkipAnimationStyles();
    
    const playerWrap = document.getElementById(playWrapId) as HTMLElement;
    if (!playerWrap) {
        console.error('📺 ❌ Player wrap not found');
        return;
    }

    if (commonAnimationElement) {
        commonAnimationElement.remove();
        commonAnimationElement = null;
    }

    commonAnimationElement = document.createElement('div');
    commonAnimationElement.classList.add(targetAnimationClass);
    playerWrap.appendChild(commonAnimationElement);
    console.log(`📺 ✨ ${targetAnimationClass} added`);
}

export function removeAnimation(): void {
    if (commonAnimationElement) {
        commonAnimationElement.remove();
        commonAnimationElement = null;
        console.log('📺 ✨ Common animation removed');
    }
}

function setupAutoSkip(video: HTMLVideoElement, adStartSeconds: number, adEndSeconds: number): void {
    const autoSkip = autoSkipEnabled;

    let hasSkipped = false;
    let animationAdded = false;
    const ANIMATION_LEAD_TIME = 3;

    const playerWrap = document.querySelector(`#${playWrapId}`) as HTMLElement;
    let animationElement: HTMLElement | null = null;

    const addSkipAnimation = () => {
        if (playerWrap && !animationAdded && !animationElement) {
            animationElement = document.createElement('div');
            animationElement.classList.add(skipAnimationClass);
            playerWrap.appendChild(animationElement);
            animationAdded = true;
            console.log('📺 ✨ Skip animation added');
        }
    };

    const removeSkipAnimation = () => {
        if (animationElement && animationAdded) {
            animationElement.remove();
            animationElement = null;
            animationAdded = false;
            console.log('📺 ✨ Skip animation removed');
        }
    };

    const handleTimeUpdate = () => {
        const currentTime = video.currentTime;
        const animationStartTime = Math.max(0, adStartSeconds - ANIMATION_LEAD_TIME);

        if (currentTime >= animationStartTime && 
            currentTime < adEndSeconds && 
            !animationAdded) {
            addSkipAnimation();
        }

        if (autoSkip) {
            if (currentTime >= adStartSeconds && currentTime < adEndSeconds && !hasSkipped) {
                console.log(`📺 ⏩ Auto-skipping ad: ${currentTime.toFixed(2)}s → ${adEndSeconds}s`);
                video.currentTime = adEndSeconds;
                hasSkipped = true;
            }
        }

        if (hasSkipped && currentTime >= adEndSeconds) {
            removeSkipAnimation();
        }

        const resetBeforeTime = Math.max(0, adStartSeconds - ANIMATION_LEAD_TIME - 1);
        if (currentTime < resetBeforeTime || currentTime >= adEndSeconds + 1) {
            hasSkipped = false;
            removeSkipAnimation();
        }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    // Track video event listener for cleanup
    videoEventListeners.push({ video, type: 'timeupdate', listener: handleTimeUpdate as EventListener });
    console.log(`📺 ✔️ Auto-skip enabled: ${adStartSeconds}s - ${adEndSeconds}s`);
}

export function initializeAdBar(adStartSeconds: number, adEndSeconds: number): void {
    injectSkipAnimationStyles();

    const video = document.querySelector('video') as HTMLVideoElement;

    if (!video) {
        console.log('📺 ❌ Video element not found, checking again...');
        const checkVideo = window.setInterval(() => {
            const v = document.querySelector('video') as HTMLVideoElement;
            if (v) {
                console.log('📺 ✔️ Video element found, initializing ad bar...');
                clearInterval(checkVideo);
                // Remove from tracking when cleared
                intervals = intervals.filter(id => id !== checkVideo);
                initializeAdBar(adStartSeconds, adEndSeconds);
            }
        }, 500);
        // Track interval for cleanup
        intervals.push(checkVideo);
        return;
    }

    const createAndSetup = () => {
        const progressWrap = document.querySelector(progressWrapClassSelector);
        if (!progressWrap) {
            console.log('📺 ❌ Progress wrap not found, checking again...');
            const timeout = window.setTimeout(createAndSetup, 200);
            // Track timeout for cleanup
            timeouts.push(timeout);
            return;
        }
        console.log('📺 ✔️ Progress wrap found, initializing ad bar...');

        createAdBar(adStartSeconds, adEndSeconds);
        setupAdBarResizeHandlers(adStartSeconds, adEndSeconds);
        setupAutoSkip(video, adStartSeconds, adEndSeconds);
    };


    // Ready State: 2 = HTMLMediaElement.HAVE_CURRENT_DATA:
    // Data is available for the current playback position, but not enough to actually play more than one frame.
    if (video.readyState >= 2) {
        console.log('📺 ✔️ Video ready, initializing ad bar...');
        createAndSetup();
    } else {
        console.log('📺 ❌ Video not ready, checking again...');
        const checkVideoReady = window.setInterval(() => {
            if (video.readyState >= 2) {
                console.log('📺 ✔️ Video ready, initializing ad bar...');
                clearInterval(checkVideoReady);
                // Remove from tracking when cleared
                intervals = intervals.filter(id => id !== checkVideoReady);
                createAndSetup();
            }
        }, 100);
        // Track interval for cleanup
        intervals.push(checkVideoReady);
    }
}
