import mixpanel from 'mixpanel-browser';

const token = process.env.NEXT_PUBLIC_MIXPANEL_TOKEN;

let isInitialized = false;

if (typeof window !== 'undefined') {
  if (token) {
    mixpanel.init(token, {
      debug: process.env.NODE_ENV !== 'production',
      track_pageview: false,
      persistence: 'localStorage',
    });
    isInitialized = true;
  }
}

export const trackEvent = (eventName: string, properties?: Record<string, any>) => {
  if (typeof window !== 'undefined') {
    if (isInitialized) {
      mixpanel.track(eventName, properties);
    } else {
      console.log(`[Mixpanel Mock] ${eventName}`, properties);
    }
  }
};

export default mixpanel;
