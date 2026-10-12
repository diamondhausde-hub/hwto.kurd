/**
 * Vercel serverless HLS-manifest proxy for Fastvid
 */

const FETCH_TIMEOUT_MS = 10000;
const DEFAULT_REFERER = 'https://shaheid4u.name/';

function isSafeHttpUrl(raw) {
  let url;
  try {
    url = new URL(String(raw || '').trim());
  } catch (error) {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  // فحص أمني مبسط ومباشر لمنع السيرفر المحلي من مناداة نفسه
  if (url.hostname === 'localhost' || url.hostname.startsWith('127.')) {
    return null;
  }

  return url;
}

export function proxifyPlaylist(body, targetUrl, fromParam) {
  const proxyBase = '/api/fastvid';

  return body
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      const wrapUrl = (rawUrl) => {
        try {
          if (rawUrl.startsWith('data:')) return rawUrl;
          const absoluteUrl = new URL(rawUrl, targetUrl).href;
          return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}&from=${encodeURIComponent(fromParam)}`;
        } catch {
          return rawUrl;
        }
      };

      if (trimmed.startsWith('#')) {
        return line.replace(/(URI=")([^"]+)(")/i, (match, prefix, uri, suffix) => {
          return prefix + wrapUrl(uri) + suffix;
        });
      }

      return wrapUrl(trimmed);
    })
    .join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // قراءة المتغيرات مباشرة وبشكل آمن (يدعم Vercel وسيرفرك المحلي)
  let rawUrl = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url;
  let rawFrom = Array.isArray(req.query?.from) ? req.query.from[0] : req.query?.from;

  if (rawFrom && !rawFrom.startsWith('http')) {
      rawFrom = 'https://' + rawFrom;
  }

  const target = isSafeHttpUrl(rawUrl);
  if (!target) {
    console.error("[fastvid] Blocked invalid URL:", rawUrl);
    return res.status(400).json({ error: 'Missing or invalid url parameter' });
  }

  const from = isSafeHttpUrl(rawFrom);
  // إرسال الرابط الكامل كما هو بدلاً من اقتطاع النطاق فقط
  const referer = from ? from.href : process.env.FASTVID_REFERER || DEFAULT_REFERER;
  const fromParam = from ? from.href : referer;

  try {
    const response = await fetch(target.href, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Referer: referer,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, text/plain, */*'
      }
    });

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: `Failed to fetch from origin (${response.status})` });
    }

    const originType = response.headers.get('content-type') || '';
    const isManifest =
      /\.m3u8(\?|$)/i.test(target.href) ||
      originType.includes('mpegurl') ||
      originType.startsWith('text/');

    if (!isManifest) {
      const bytes = Buffer.from(await response.arrayBuffer());
      res.setHeader('Content-Type', originType || 'application/octet-stream');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.status(200).send(bytes);
    }

    const m3u8Content = await response.text();
    // تمرير الرابط الكامل لقطع الفيديو لتخطي حظر الـ Referer
    const modifiedContent = proxifyPlaylist(m3u8Content, target.href, fromParam);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(modifiedContent);
  } catch (error) {
    console.error('[fastvid]', error && error.name === 'TimeoutError' ? 'origin timeout' : error);
    return res.status(500).json({ error: 'Server Error' });
  }
}