/**
 * Build 20 blog + 20 shorts + 20 video rows from Linkr/goobl discover sources.
 * Output: data/livelinkr-content.json (committed; import script loads this)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const gooblRoot = join(root, '..', 'goobl');
const seedPath = join(gooblRoot, 'data', 'discover-seed-real.json');
const catalogPath = join(gooblRoot, 'data', 'discover-search-catalog.json');

const seed = JSON.parse(readFileSync(seedPath, 'utf8'));
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const categories = [
  '피부과',
  '내과',
  '정형외과',
  '치과',
  '산부인과',
  '소아청소년과',
  '이비인후과',
  '안과',
  '정신건강의학과',
  '건강검진',
  '성형외과',
  '약국',
];

function pickCategory(i) {
  return categories[i % categories.length];
}

const blogPosts = (seed.posts || [])
  .filter((p) => p.url && (p.url.includes('googleblog') || p.url.includes('blogspot.com')))
  .slice(0, 20)
  .map((p, i) => ({
    kind: 'blog',
    title: String(p.title || '').slice(0, 200),
    summary: String(p.excerpt || 'Linkr Discover · Google Blogger 원문').slice(0, 500),
    url: p.url,
    category: pickCategory(i),
    author_label: 'Linkr Discover · Google Blog',
    source: 'livelinkr',
    external_key: `linkr-blog-${i + 1}`,
  }));

/** Resolve @handle → channel id via YouTube oEmbed redirect HTML (no API key). */
async function resolveChannelId(handle) {
  const url = `https://www.youtube.com/@${handle.replace(/^@/, '')}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MEDIPICK-import/1.0)' },
    redirect: 'follow',
  });
  const html = await res.text();
  const m =
    html.match(/"channelId":"(UC[a-zA-Z0-9_-]{20,})"/) ||
    html.match(/"externalId":"(UC[a-zA-Z0-9_-]{20,})"/);
  return m ? m[1] : null;
}

async function fetchLatestVideos(channelId, max = 5) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const res = await fetch(feedUrl, { headers: { 'User-Agent': 'MEDIPICK-import/1.0' } });
  if (!res.ok) return [];
  const xml = await res.text();
  const ids = [...xml.matchAll(/<yt:videoId>([^<]+)<\/yt:videoId>/g)].map((x) => x[1]);
  const titles = [...xml.matchAll(/<entry>[\s\S]*?<title>([^<]*)<\/title>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>/g)];
  const out = [];
  for (const t of titles.slice(0, max)) {
    out.push({ id: t[2], title: t[1] });
  }
  if (!out.length && ids.length) {
    for (const id of ids.slice(0, max)) out.push({ id, title: `YouTube · ${id}` });
  }
  return out;
}

const ytChannels = catalog.items
  .filter((i) => i.searchable && i.type === 'youtube' && i.formats.includes('shorts'))
  .slice(0, 40);

const shorts = [];
const videos = [];
const usedShort = new Set();
const usedVideo = new Set();

for (const ch of ytChannels) {
  if (shorts.length >= 20 && videos.length >= 20) break;
  const handleMatch = String(ch.url || '').match(/youtube\.com\/@([^/?#]+)/i);
  if (!handleMatch) continue;
  let channelId;
  try {
    channelId = await resolveChannelId(handleMatch[1]);
  } catch {
    continue;
  }
  if (!channelId) continue;
  let latest = [];
  try {
    latest = await fetchLatestVideos(channelId, 8);
  } catch {
    continue;
  }
  for (const v of latest) {
    if (shorts.length < 20 && !usedShort.has(v.id)) {
      usedShort.add(v.id);
      shorts.push({
        kind: 'shorts',
        title: `${ch.name} · ${v.title}`.slice(0, 200),
        summary: `Linkr Discover 채널(${ch.country})에서 수집한 YouTube Shorts 원문 링크입니다.`,
        url: `https://www.youtube.com/shorts/${v.id}`,
        category: pickCategory(shorts.length),
        author_label: `Linkr Discover · ${ch.name}`,
        source: 'livelinkr',
        external_key: `linkr-shorts-${shorts.length + 1}`,
      });
    }
    if (videos.length < 20 && !usedVideo.has(v.id)) {
      usedVideo.add(v.id);
      videos.push({
        kind: 'video',
        title: `${ch.name} · ${v.title}`.slice(0, 200),
        summary: `Linkr Discover 채널(${ch.country})에서 수집한 YouTube 영상 원문 링크입니다.`,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        category: pickCategory(videos.length),
        author_label: `Linkr Discover · ${ch.name}`,
        source: 'livelinkr',
        external_key: `linkr-video-${videos.length + 1}`,
      });
    }
  }
}

const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'goobl/lib/discover (Linkr Live catalog)',
  counts: { blog: blogPosts.length, shorts: shorts.length, video: videos.length },
  items: [...blogPosts, ...shorts, ...videos],
};

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data', 'livelinkr-content.json'), JSON.stringify(manifest, null, 2), 'utf8');
console.log('wrote', manifest.counts, 'total', manifest.items.length);
