const crypto = require('crypto');

const IG_APP_ID = '936619743392459';
const IG_DOC_ID = '8845758582119845';   // 2026-06 — from yt-dlp source
const IG_BASE   = 'https://www.instagram.com';
const IG_UA     = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';

function parseShortcode(url) {
  const m = url.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('Not a recognised Instagram post/reel URL');
  return m[1];
}

async function bootstrapSession() {
  const res = await fetch(`${IG_BASE}/`, {
    headers: {
      'User-Agent': IG_UA,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const headers = res.headers;
  // Try to parse set-cookie
  let raw = [];
  if (headers.getSetCookie) {
    raw = headers.getSetCookie();
  } else {
    const rawVal = headers.get('set-cookie');
    if (rawVal) raw = [rawVal];
  }
  const cookieStr = raw.map(c => c.split(';')[0]).join('; ');
  let csrfToken = '';
  for (const c of raw) {
    const m = c.match(/csrftoken=([^;]+)/);
    if (m) { csrfToken = m[1]; break; }
  }
  return { csrfToken, cookieStr };
}

async function queryGraphQL(shortcode, csrfToken, cookieStr) {
  const variables = JSON.stringify({
    shortcode,
    child_comment_count: 3,
    fetch_comment_count: 40,
    parent_comment_count: 24,
    has_threaded_comments: true,
  });

  const url =
    `${IG_BASE}/graphql/query/?doc_id=${IG_DOC_ID}` +
    `&variables=${encodeURIComponent(variables)}`;

  console.log('Sending request to GraphQL: ', url);

  const res = await fetch(url, {
    headers: {
      'User-Agent': IG_UA,
      'X-IG-App-ID': IG_APP_ID,
      'X-CSRFToken': csrfToken,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': `${IG_BASE}/reel/${shortcode}/`,
      ...(cookieStr ? { 'Cookie': cookieStr } : {}),
    },
  });

  console.log('Response Status:', res.status, res.statusText);
  if (!res.ok) {
    const text = await res.text();
    console.log('Error Body:', text);
    return null;
  }
  const json = await res.json().catch(() => null);
  console.log('Response JSON keys:', Object.keys(json || {}));
  console.log('Response Data:', JSON.stringify(json, null, 2));
  if (json && json.errors) {
    console.log('GraphQL errors:', json.errors);
  }
  return json?.data?.xdt_shortcode_media ?? null;
}

async function run() {
  const url = 'https://www.instagram.com/reel/C24g8i7pQ8T/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==';
  try {
    const shortcode = parseShortcode(url);
    console.log('Shortcode:', shortcode);
    const { csrfToken, cookieStr } = await bootstrapSession();
    console.log('CSRF Token:', csrfToken);
    console.log('Cookie String:', cookieStr);
    const media = await queryGraphQL(shortcode, csrfToken, cookieStr);
    if (!media) {
      console.log('Failed to fetch media (media is null/undefined)');
    } else {
      console.log('Success! Media keys:', Object.keys(media));
      console.log('Media typename:', media.__typename);
      console.log('Is Video:', media.is_video);
      console.log('Video URL:', media.video_url);
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
