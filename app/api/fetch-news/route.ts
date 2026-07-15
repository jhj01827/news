import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout limit on Vercel

// ─────────────────────────────────────────────────────────────
// 1. RSS FEED CONFIG
// ─────────────────────────────────────────────────────────────
type ArticleCategory = 'tech' | 'beauty' | 'fashion' | 'culture' | 'social';

interface FeedConfig {
  hint: ArticleCategory; // suggested category — Claude may override
  sourceName: string;
  url: string;
}

const RSS_FEEDS: FeedConfig[] = [
  // 테크
  { hint: 'tech',    sourceName: 'The Verge',  url: 'https://www.theverge.com/rss/index.xml' },
  { hint: 'tech',    sourceName: 'Wired',      url: 'https://www.wired.com/feed/rss' },
  { hint: 'tech',    sourceName: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  // 패션
  { hint: 'fashion', sourceName: 'Hypebeast',  url: 'https://hypebeast.com/feed' },
  { hint: 'fashion', sourceName: 'Vogue',      url: 'https://www.vogue.com/feed/rss' },
  { hint: 'fashion', sourceName: 'BoF',        url: 'https://www.businessoffashion.com/rss' },
  // 뷰티
  { hint: 'beauty',  sourceName: 'Allure',     url: 'https://www.allure.com/feed/rss' },
  { hint: 'beauty',  sourceName: 'Byrdie',     url: 'https://www.byrdie.com/rss' },
  { hint: 'beauty',  sourceName: 'BeautyMatter', url: 'https://beautymatter.com/feed/' },
  // 컬처
  { hint: 'culture', sourceName: 'Pitchfork',  url: 'https://pitchfork.com/rss/news/' },
  { hint: 'culture', sourceName: 'Dazed',      url: 'https://www.dazeddigital.com/rss' },
  { hint: 'culture', sourceName: 'NME',        url: 'https://www.nme.com/feed' },
  // 소셜
  { hint: 'social',  sourceName: 'Social Media Examiner', url: 'https://www.socialmediaexaminer.com/feed/' },
  { hint: 'social',  sourceName: 'Later',                 url: 'https://later.com/blog/feed/' },
  { hint: 'social',  sourceName: 'Hootsuite',             url: 'https://www.hootsuite.com/resources/feed' },
  { hint: 'social',  sourceName: 'Content Marketing Institute', url: 'https://contentmarketinginstitute.com/feed/' },
  { hint: 'social',  sourceName: 'Search Engine Journal', url: 'https://www.searchenginejournal.com/feed/' },
  { hint: 'social',  sourceName: 'Neil Patel',            url: 'https://neilpatel.com/blog/feed/' },
];

const FALLBACK_TAGS: Record<ArticleCategory, string[]> = {
  tech:    ['테크', 'IT', '기술'],
  beauty:  ['뷰티', '뷰티트렌드', '스킨케어'],
  fashion: ['패션', '트렌드', '스타일'],
  culture: ['컬처', '문화', '트렌드'],
  social:  ['소셜미디어', '바이럴', '트렌드'],
};

const VALID_CATEGORIES = new Set<string>(['tech', 'beauty', 'fashion', 'culture', 'social']);

// Unique Unsplash images to prevent duplicates (5 per category)
const FALLBACK_IMAGES: Record<ArticleCategory, string[]> = {
  tech: [
    'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800',
    'https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=800',
    'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=800',
    'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800',
  ],
  beauty: [
    'https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800',
    'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800',
    'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800',
    'https://images.unsplash.com/photo-1608248597481-496100c80836?w=800',
  ],
  fashion: [
    'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=800',
    'https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800',
    'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800',
    'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=800',
    'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=800',
  ],
  culture: [
    'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800',
    'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800',
    'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800',
    'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=800',
    'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=800',
  ],
  social: [
    'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800',
    'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=800',
    'https://images.unsplash.com/photo-1611605698335-8b15d27e03f9?w=800',
    'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=800',
    'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?w=800',
  ],
};

// Deterministically select fallback image based on string hash
function getFallbackImage(url: string, category: ArticleCategory): string {
  const images = FALLBACK_IMAGES[category] || FALLBACK_IMAGES['tech'];
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = url.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % images.length;
  return images[index];
}

// ─────────────────────────────────────────────────────────────
// 2. URL NORMALIZATION
// ─────────────────────────────────────────────────────────────
function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let path = url.pathname;
    if (path.endsWith('/')) path = path.slice(0, -1);
    return (url.hostname + path).toLowerCase();
  } catch {
    return urlStr.trim().toLowerCase();
  }
}

// ─────────────────────────────────────────────────────────────
// 3. RSS XML PARSER
// ─────────────────────────────────────────────────────────────
interface RssItem {
  title: string;
  link: string;
  imageUrl: string | null;
  pubDate: string | null;
  description: string;
}

function extractCdata(raw: string): string {
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function extractImageFromRss(block: string): string | null {
  // 1) media:content url
  const mediaContentM = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
  if (mediaContentM) return mediaContentM[1];

  // 2) media:thumbnail url
  const thumbM = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (thumbM) return thumbM[1];

  // 3) enclosure with image type
  const encUrlImageM = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
  if (encUrlImageM) return encUrlImageM[1];
  const encImageUrlM = block.match(/<enclosure[^>]+type=["']image[^>]+url=["']([^"']+)["']/i);
  if (encImageUrlM) return encImageUrlM[1];

  // 4) <img> tags inside content:encoded or description — skip trackers
  const contentM =
    block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
    block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
  if (contentM) {
    const html = extractCdata(contentM[1]);
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const src = m[1];
      if (src.startsWith('data:')) continue;
      if (/1x1|pixel|tracking|beacon/i.test(src)) continue;
      if (src.startsWith('http')) return src;
    }
  }

  return null;
}

function parseRss(xml: string, limit: number): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];

    // title
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleM ? extractCdata(titleM[1]) : '';
    if (!title) continue;

    // link
    let link = '';
    const linkM = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkM) {
      link = extractCdata(linkM[1]);
    } else {
      const linkAttrM = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkAttrM) link = linkAttrM[1];
    }
    if (!link) continue;

    const imageUrl = extractImageFromRss(block);

    // pubDate
    const pubM = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const pubDate = pubM ? extractCdata(pubM[1]).trim() : null;

    // description text
    const contentM =
      block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const rawDesc = contentM ? extractCdata(contentM[1]) : '';
    const description = rawDesc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);

    items.push({ title, link, imageUrl, pubDate, description });
  }

  return items;
}

// ─────────────────────────────────────────────────────────────
// 4. FETCH RSS
// ─────────────────────────────────────────────────────────────
async function fetchRssFeed(feedUrl: string, limit: number): Promise<RssItem[]> {
  const res = await fetch(feedUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BriefBot/1.0)',
      'Accept': 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`RSS fetch error: ${res.status} ${res.statusText}`);
  const xml = await res.text();
  return parseRss(xml, limit);
}

// ─────────────────────────────────────────────────────────────
// 5. FETCH ARTICLE WEBPAGE DATA (og:image & full text)
// ─────────────────────────────────────────────────────────────
interface PageData {
  imageUrl: string | null;
  content: string | null;
}

async function fetchPageData(articleUrl: string): Promise<PageData> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(8000), // 8 seconds timeout
    });
    if (!res.ok) return { imageUrl: null, content: null };

    const html = await res.text();

    // 1. Image extraction (og:image / twitter:image)
    let imageUrl: string | null = null;
    const ogM = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["']/i) && html.match(/<meta[^>]+property=["']og:image["']/i);
    if (ogM) {
      imageUrl = ogM[1];
    } else {
      const twM = html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        || html.match(/<meta[^>]+content=["']([^"']+)["']/i) && html.match(/<meta[^>]+name=["']twitter:image["']/i);
      if (twM) imageUrl = twM[1];
    }

    // 2. Text extraction
    let bodyHtml = html;
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
      bodyHtml = bodyMatch[1];
    }

    // Remove scripts, styles, and structural boilerplate
    bodyHtml = bodyHtml
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, ' ')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, ' ')
      .replace(/<header[^>]*>([\s\S]*?)<\/header>/gi, ' ')
      .replace(/<footer[^>]*>([\s\S]*?)<\/footer>/gi, ' ')
      .replace(/<nav[^>]*>([\s\S]*?)<\/nav>/gi, ' ')
      .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, ' ');

    const cleanText = bodyHtml
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();

    return { imageUrl, content: cleanText.slice(0, 3500) || null };
  } catch (e) {
    console.error(`[fetchPageData] Error fetching ${articleUrl}:`, e);
    return { imageUrl: null, content: null };
  }
}

// ─────────────────────────────────────────────────────────────
// 6. MAIN HANDLER
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const startTime = Date.now();
  // Vercel serverless execution limit is 10s by default (Hobby).
  // We leave a 2.5 second headroom to exit cleanly before 504 gateway timeout occurs.
  const TIMEOUT_LIMIT = 7500; 

  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const forceParam = req.nextUrl.searchParams.get('force') === 'true';
    const pageSize = limitParam ? parseInt(limitParam, 10) : 15;

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!anthropicApiKey || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'API key or Supabase credentials missing.' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    // ─────────────────────────────────────────────────────────
    // PHASE 1: RSS INGESTION (Fast)
    // ─────────────────────────────────────────────────────────
    let ingestedCount = 0;
    let skippedIngestCount = 0;

    // Fetch existing urls from articles and queue to prevent duplicates
    const { data: existingArticles } = await supabaseAdmin.from('articles').select('source_url');
    const { data: existingQueue } = await supabaseAdmin.from('news_queue').select('url');

    const processedUrls = new Set<string>([
      ...(existingArticles?.map(a => normalizeUrl(a.source_url)) ?? []),
      ...(existingQueue?.map(q => normalizeUrl(q.url)) ?? [])
    ]);

    for (const feed of RSS_FEEDS) {
      try {
        const rssItems = await fetchRssFeed(feed.url, pageSize);
        for (const item of rssItems) {
          const normUrl = normalizeUrl(item.link);
          if (processedUrls.has(normUrl)) {
            skippedIngestCount++;
            continue;
          }

          // Insert raw item into queue
          const { error: queueErr } = await supabaseAdmin.from('news_queue').insert({
            url: item.link,
            category: feed.hint,
            title: item.title,
            source_name: feed.sourceName,
            pub_date: item.pubDate,
            description: item.description,
            image_url: item.imageUrl,
            status: 'pending',
            retry_count: 0
          });

          if (!queueErr) {
            ingestedCount++;
            processedUrls.add(normUrl);
          }
        }
      } catch (feedErr: any) {
        console.error(`[Ingestion] Failed for ${feed.sourceName}:`, feedErr.message);
      }
    }

    // ─────────────────────────────────────────────────────────
    // PHASE 2: QUEUE PROCESSING (Time-guarded & Batched)
    // ─────────────────────────────────────────────────────────
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    while (Date.now() - startTime < TIMEOUT_LIMIT) {
      // Get one pending article from queue
      const { data: queueItem, error: fetchErr } = await supabaseAdmin
        .from('news_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchErr || !queueItem) {
        break; // No items in queue to process
      }

      processedCount++;
      const sourceUrl = queueItem.url;

      // Mark as processing immediately to prevent parallel execution conflicts
      await supabaseAdmin
        .from('news_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', queueItem.id);

      try {
        let finalImageUrl = queueItem.image_url;
        let finalContent = queueItem.description || '';

        // Webpage fetch for better text and og:images if missing or teaser-only
        if (!finalImageUrl || finalContent.length < 600) {
          const pageData = await fetchPageData(sourceUrl);
          if (pageData.imageUrl) {
            finalImageUrl = pageData.imageUrl;
          }
          if (pageData.content && pageData.content.length > finalContent.length) {
            finalContent = pageData.content;
          }
        }

        // CRITICAL CHECK: Ensure article body was scraped successfully
        if (finalContent.length < 300) {
          throw new Error('Article body scraping failed: Scraped content too short (< 300 chars).');
        }

        // Image fallback (guaranteed unique per article via hashing)
        if (!finalImageUrl) {
          finalImageUrl = getFallbackImage(sourceUrl, queueItem.category as ArticleCategory);
        }

        // Claude AI summarization
        const systemPrompt = `당신은 트렌드 및 기획 전문 매체 BRIEF의 AI 편집장입니다. 기획자, 마케터, 비즈니스 리더들을 위해 영어 뉴스 기사를 선별하고 한국어 트렌드 요약과 배경 지식을 작성해 주세요.

반드시 다음 규칙을 지키십시오:
1. 응답은 오직 JSON 형식으로만 반환해야 합니다. 마크다운 백틱(\`\`\`json ...)이나 부연 설명 없이, 오직 JSON 문자열만 응답하세요.
2. 먼저 기사가 트렌드와 관련이 있는지 판단하십시오. 트렌드 관련 기사의 예시: 소비자 트렌드, 문화적 움직임, 마케팅 캠페인, 신제품/서비스 출시, 바이럴 현상, 패션·뷰티·테크 동향, 소셜 미디어 플랫폼 업데이트, 크리에이터 이코노미 트렌드, 바이럴 마케팅 캠페인, 인플루언서 트렌드, 콘텐츠 전략. 트렌드와 무관한 기사의 예시: 주가·금리 등 금융 수치, 정치·선거, 범죄·사건·사고, 재해·재난, 단순 인사이동.
3. 트렌드 관련 기사라면, 기사의 PRIMARY 주제를 기반으로 가장 정확한 카테고리를 직접 판단하세요:
   - "tech": 테크 제품, AI, 앱, 디지털 트렌드
   - "beauty": 스킨케어, 메이크업, 헤어케어, 뷰티 제품
   - "fashion": 의류, 액세서리, 스타일, 런웨이
   - "culture": 음악, 영화, 예술, 라이프스타일, 사회적 현상
   - "social": 소셜 미디어 플랫폼 업데이트(Instagram, TikTok, YouTube 등), 크리에이터 이코노미 트렌드, 바이럴 마케팅 캠페인, 인플루언서 트렌드, 콘텐츠 전략
   출처 매체가 아닌 기사의 실제 내용을 기준으로 카테고리를 할당하세요.
4. JSON 구조는 반드시 다음 6개의 필드를 포함해야 합니다:
   - "skip": 트렌드와 무관한 기사이면 true, 트렌드 관련 기사이면 false. (boolean)
   - "category": skip이 false일 때 위 5개 카테고리 중 하나를 정확히 입력. skip이 true이면 빈 문자열("").
   - "hook_title": skip이 false일 때만 작성. 영어 제목을 한국어로 번역하여, 기획자·마케터의 이목을 끄는 실용적인 한국어 제목으로 작성 (15~25자 내외). 절대 영어 제목을 그대로 유지하지 마십시오. skip이 true이면 빈 문자열("").
   - "summary": skip이 false일 때만 작성. 다음 규칙을 반드시 따르세요:
     * 가장 놀랍거나 즉시 활용 가능한 인사이트로 시작하세요. "이 기사는 ~을 소개합니다", "~에 대해 다루고 있습니다" 같은 서술식 도입부는 절대 쓰지 마세요.
     * 기사에 나온 구체적인 수치, 브랜드명, 인물명, 전략명, 캠페인명을 1~2개 이상 직접 언급하세요. 막연한 표현("일부 브랜드", "여러 기업") 대신 실제 이름을 쓰세요.
     * 마치 트렌드를 잘 아는 동료가 "야, 이거 봤어?" 하는 톤으로 핵심만 전달하세요.
     * 나쁜 예: "패션 산업으로의 진입이 점점 어려워지고 있는 가운데, 이 기사는 신입들이 업계 문을 열 수 있는 방법들을 소개합니다."
     * 좋은 예: "포트폴리오 대신 SNS 팔로워를 보여주는 시대. 보그 편집장 출신 멘토 연결 플랫폼 'The Intern', 링크드인보다 인스타그램 DM이 더 잘 통한다는 현직자 조언이 눈길을 끈다."
     * 공백 포함 250~350자 사이. 반드시 완전한 문장으로 끝내야 하며 말줄임표로 끝나서는 안 됩니다. skip이 true이면 빈 문자열("").
   - "background": skip이 false일 때만 작성. 한국 독자가 모를 수 있는 문화적 맥락, 브랜드 배경, 시장 구조를 1~2문장으로 설명. skip이 true이면 빈 문자열("").
   - "tags": skip이 false일 때만 작성. 한국어로 생성한 1~3개의 핵심 한글 키워드 태그 배열. skip이 true이면 빈 배열([]).`;

        const userContent = `기사 제목: ${queueItem.title}\n본문 내용: ${finalContent}`;

        const claudeResponse = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 750,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          temperature: 0.2,
        });

        const text =
          claudeResponse.content[0].type === 'text'
            ? claudeResponse.content[0].text
            : '';

        let parsed: {
          skip?: boolean;
          category?: string;
          hook_title?: string;
          summary?: string;
          background?: string;
          tags?: string[];
        } | null = null;

        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in Claude response.');
          }
        } catch (jsonErr: any) {
          throw new Error(`Claude JSON parse failed: ${jsonErr.message}`);
        }

        // Delete from queue and skip if Claude determines it's not trend-related
        if (parsed?.skip === true) {
          await supabaseAdmin.from('news_queue').delete().eq('id', queueItem.id);
          successCount++;
          continue;
        }

        const finalCategory = parsed?.category && VALID_CATEGORIES.has(parsed.category)
          ? parsed.category
          : queueItem.category;

        const hookTitle = parsed?.hook_title || queueItem.title;
        const summaryContent = parsed?.summary || '요약 정보가 제공되지 않습니다.';
        const backgroundContent = parsed?.background || null;
        const articleTags = parsed && Array.isArray(parsed.tags) && parsed.tags.length > 0
          ? parsed.tags
          : FALLBACK_TAGS[finalCategory as ArticleCategory];

        // Parse pubDate
        let publishedAt = new Date().toISOString();
        if (queueItem.pub_date) {
          const d = new Date(queueItem.pub_date);
          if (!isNaN(d.getTime())) publishedAt = d.toISOString();
        }

        // Insert into Supabase articles
        const { error: insertErr } = await supabaseAdmin.from('articles').insert({
          category: finalCategory,
          hook_title: hookTitle,
          summary: summaryContent,
          background: backgroundContent,
          image_url: finalImageUrl,
          source_url: sourceUrl,
          source_name: queueItem.source_name,
          tags: articleTags,
          published_at: publishedAt,
        });

        if (insertErr) {
          throw new Error(`Database insert failed: ${insertErr.message}`);
        }

        // Delete processed item from queue
        await supabaseAdmin.from('news_queue').delete().eq('id', queueItem.id);
        successCount++;

      } catch (itemErr: any) {
        failedCount++;
        const errMsg = itemErr.message || 'Unknown processing error';
        console.error(`[Queue Worker] Failed for ${sourceUrl}:`, errMsg);
        errors.push(`${queueItem.title.substring(0, 30)}: ${errMsg}`);

        const nextRetry = queueItem.retry_count + 1;
        if (nextRetry >= 3) {
          // Permanently fail and keep in queue with 'failed' status for inspection
          await supabaseAdmin
            .from('news_queue')
            .update({
              status: 'failed',
              retry_count: nextRetry,
              error_message: errMsg,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueItem.id);
        } else {
          // Re-queue back to pending for next worker invocation
          await supabaseAdmin
            .from('news_queue')
            .update({
              status: 'pending',
              retry_count: nextRetry,
              error_message: errMsg,
              updated_at: new Date().toISOString()
            })
            .eq('id', queueItem.id);
        }
      }
    }

    return NextResponse.json({
      status: 'completed',
      time_elapsed_ms: Date.now() - startTime,
      ingested: ingestedCount,
      skipped_ingest: skippedIngestCount,
      queue_processed: processedCount,
      queue_success: successCount,
      queue_failed: failedCount,
      errors,
    });

  } catch (globalErr: any) {
    console.error('[Sync API] Global execution error:', globalErr);
    return NextResponse.json(
      { error: `Internal server error: ${globalErr.message}` },
      { status: 500 }
    );
  }
}
