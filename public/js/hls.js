/**
 * hls.js loader — native-HLS playback on the watch screen.
 *
 * The library is vendored at /vendor/hls.min.js (the app's CSP is
 * `script-src 'self'`, so a CDN copy would be blocked). It is injected only
 * when native playback is actually requested, so the home screen's first-load
 * payload stays untouched.
 *
 * Every segment the manifest references lives on the embed server's CDN
 * (cross-origin). hls.js fetches those with XHR, which would trip both
 * `connect-src` and CORS. So the custom loader rewrites any cross-origin URL
 * back through the same-origin /api/fastvid proxy — one code path, no CORS,
 * no CSP violations. Trade-off: segments transit Vercel. If an embed server
 * ever serves segments with `Access-Control-Allow-Origin`, set
 * `window.HWTO_HLS_DIRECT = true` to bypass the proxy for those.
 */

let libPromise = null;

/** Inject <script src="/vendor/hls.min.js"> once; resolves with window.Hls. */
export function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (libPromise) return libPromise;

  libPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-hls-lib]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Hls));
      existing.addEventListener('error', () => reject(new Error('hls.js failed to load')));
      return;
    }
    const script = document.createElement('script');
    script.src = '/vendor/hls.min.js';
    script.async = true;
    script.dataset.hlsLib = '1';
    script.addEventListener('load', () => resolve(window.Hls));
    script.addEventListener('error', () => {
      libPromise = null;
      reject(new Error('hls.js failed to load'));
    });
    document.head.appendChild(script);
  });

  return libPromise;
}

const proxyUrl = (url, from) =>
  `/api/fastvid?url=${encodeURIComponent(url)}${from ? `&from=${encodeURIComponent(from)}` : ''}`;

/**
 * hls.js loader that transparently proxies cross-origin requests. Same-origin
 * URLs (already-proxied manifests) pass through untouched.
 */
function makeProxiedLoader(Hls, from) {
  const BaseLoader = Hls.DefaultConfig.loader;
  return class ProxiedLoader extends BaseLoader {
    load(context, config, callbacks) {
      const url = context.url;
      const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(url);
      const isCrossOrigin = isAbsolute && !url.startsWith(window.location.origin);
      if (isCrossOrigin && !window.HWTO_HLS_DIRECT) {
        context.url = proxyUrl(url, from);
        if (context.stats) context.stats.url = context.url;
      }
      super.load(context, config, callbacks);
    }
  };
}

/**
 * Start HLS playback of `m3u8Url` on `video`. Returns { destroy() }.
 * The manifest is fetched through the same-origin proxy; segments follow the
 * loader rule above. Errors are recovered the way the original snippet did.
 */
export async function attachHls(video, m3u8Url, { signal, from } = {}) {
  const Hls = await loadHls();
  if (signal && signal.aborted) return { destroy() {} };

  // The manifest itself always goes through the proxy (it carries the spoofed
  // Referer the origin requires); the loader handles the rest.
  const source = proxyUrl(m3u8Url, from);

  if (!Hls.isSupported()) {
    // Safari plays HLS natively; give it the proxied manifest directly.
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      return {
        destroy() {
          video.removeAttribute('src');
          video.load();
        }
      };
    }
    throw new Error('HLS is not supported in this browser');
  }

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: false,
    maxBufferLength: 30,
    loader: makeProxiedLoader(Hls, from)
  });

  hls.loadSource(source);
  hls.attachMedia(video);

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    /* autoplay stays off — the viewer presses play */
  });

  hls.on(Hls.Events.ERROR, (_event, data) => {
    if (!data || !data.fatal) return;
    console.error('[hls]', data.type, data.details, data.response && data.response.code, data.url || '');
    switch (data.type) {
      case Hls.ErrorTypes.NETWORK_ERROR:
        hls.startLoad();
        break;
      case Hls.ErrorTypes.MEDIA_ERROR:
        hls.recoverMediaError();
        break;
      default:
        hls.destroy();
        break;
    }
  });

  return {
    destroy() {
      try {
        hls.destroy();
      } catch {
        /* already torn down */
      }
    }
  };
}
