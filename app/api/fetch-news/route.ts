import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

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
  { hint: 'social',  sourceName: 'Mashable',        url: 'https://mashable.com/feeds/rss/all' },
  { hint: 'social',  sourceName: 'BuzzFeed',        url: 'https://www.buzzfeed.com/index.xml' },
  { hint: 'social',  sourceName: 'Social Media Today', url: 'https://www.socialmediatoday.com/rss/' },
  { hint: 'social',  sourceName: 'Sprout Social',   url: 'https://sproutsocial.com/insights/feed/' },
];

const FALLBACK_TAGS: Record<ArticleCategory, string[]> = {
  tech:    ['테크', 'IT', '기술'],
  beauty:  ['뷰티', '뷰티트렌드', '스킨케어'],
  fashion: ['패션', '트렌드', '스타일'],
  culture: ['컬처', '문화', '트렌드'],
  social:  ['소셜미디어', '바이럴', '트렌드'],
};

const VALID_CATEGORIES = new Set<string>(['tech', 'beauty', 'fashion', 'culture', 'social']);

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
// 5. MAIN HANDLER
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const forceParam = req.nextUrl.searchParams.get('force') === 'true';
    const pageSize = limitParam ? parseInt(limitParam, 10) : 15;

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!anthropicApiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set.' }, { status: 500 });
    }
    if (!supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set.' }, { status: 500 });
    }

    // Fetch existing source_urls for duplicate prevention
    const { data: existingArticles, error: dbError } = await supabaseAdmin
      .from('articles')
      .select('source_url');

    if (dbError) {
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    }

    const existingUrls = new Set<string>(
      existingArticles?.map((a: { source_url: string }) => normalizeUrl(a.source_url)) ?? []
    );

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const report: {
      feed: string;
      fetched: number;
      processed: number;
      inserted: number;
      skipped: number;
      no_image: number;
      failed: number;
      errors: string[];
    }[] = [];

    for (const feed of RSS_FEEDS) {
      const feedReport = {
        feed: feed.sourceName,
        fetched: 0,
        processed: 0,
        inserted: 0,
        skipped: 0,
        no_image: 0,
        failed: 0,
        errors: [] as string[],
      };

      try {
        const rssItems = await fetchRssFeed(feed.url, pageSize);
        feedReport.fetched = rssItems.length;

        for (const item of rssItems) {
          const sourceUrl = item.link;

          if (!forceParam && existingUrls.has(normalizeUrl(sourceUrl))) {
            feedReport.skipped++;
            continue;
          }

          // Skip articles without images entirely
          if (!item.imageUrl) {
            feedReport.no_image++;
            continue;
          }

          feedReport.processed++;

          // ── Claude: filter + categorize + translate + summarize ─
          const systemPrompt = `당신은 트렌드 및 기획 전문 매체 BRIEF의 AI 편집장입니다. 기획자, 마케터, 비즈니스 리더들을 위해 영어 뉴스 기사를 선별하고 한국어 트렌드 요약과 배경 지식을 작성해 주세요.

반드시 다음 규칙을 지키십시오:
1. 응답은 오직 JSON 형식으로만 반환해야 합니다. 마크다운 백틱(\`\`\`json ...)이나 부연 설명 없이, 오직 JSON 문자열만 응답하세요.
2. 먼저 기사가 트렌드와 관련이 있는지 판단하십시오. 트렌드 관련 기사의 예시: 소비자 트렌드, 문화적 움직임, 마케팅 캠페인, 신제품/서비스 출시, 바이럴 현상, 패션·뷰티·테크 동향. 트렌드와 무관한 기사의 예시: 주가·금리 등 금융 수치, 정치·선거, 범죄·사건·사고, 재해·재난, 단순 인사이동.
3. 트렌드 관련 기사라면, 기사의 PRIMARY 주제를 기반으로 가장 정확한 카테고리를 직접 판단하세요:
   - "tech": 테크 제품, AI, 앱, 디지털 트렌드
   - "beauty": 스킨케어, 메이크업, 헤어케어, 뷰티 제품
   - "fashion": 의류, 액세서리, 스타일, 런웨이
   - "culture": 음악, 영화, 예술, 라이프스타일, 사회적 현상
   - "social": 소셜미디어 플랫폼, 크리에이터 이코노미, 바이럴 트렌드, 밈, SNS 마케팅
   출처 매체가 아닌 기사의 실제 내용을 기준으로 카테고리를 할당하세요.
4. JSON 구조는 반드시 다음 6개의 필드를 포함해야 합니다:
   - "skip": 트렌드와 무관한 기사이면 true, 트렌드 관련 기사이면 false. (boolean)
   - "category": skip이 false일 때 위 5개 카테고리 중 하나를 정확히 입력. skip이 true이면 빈 문자열("").
   - "hook_title": skip이 false일 때만 작성. 영어 제목을 한국어로 번역하여, 기획자·마케터의 이목을 끄는 실용적인 한국어 제목으로 작성 (15~25자 내외). 절대 영어 제목을 그대로 유지하지 마십시오. skip이 true이면 빈 문자열("").
   - "summary": skip이 false일 때만 작성. 비전문가 수준의 평이하고 단순한 구어체·대화체 한국어로 작성. 공백 포함 300~400자 사이. 반드시 완전한 문장으로 끝내야 합니다. skip이 true이면 빈 문자열("").
   - "background": skip이 false일 때만 작성. 한국 독자가 모를 수 있는 문화적 맥락, 브랜드 배경, 시장 구조를 1~2문장으로 설명. skip이 true이면 빈 문자열("").
   - "tags": skip이 false일 때만 작성. 한국어로 생성한 1~3개의 핵심 한글 키워드 태그 배열. skip이 true이면 빈 배열([]).`;

          const userContent = `기사 제목: ${item.title}
본문 내용: ${item.description}`;

          try {
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
                throw new Error('No JSON found in response');
              }
            } catch (jsonErr: unknown) {
              console.warn(
                `[Sync API] JSON parse failed for ${sourceUrl}:`,
                (jsonErr as Error).message
              );
            }

            // Skip non-trend articles
            if (parsed?.skip === true) {
              feedReport.skipped++;
              continue;
            }

            // Determine final category: Claude's choice takes priority, fallback to feed hint
            const claudeCategory = parsed?.category;
            const finalCategory: ArticleCategory =
              claudeCategory && VALID_CATEGORIES.has(claudeCategory)
                ? (claudeCategory as ArticleCategory)
                : feed.hint;

            const hookTitle = parsed?.hook_title || item.title;
            const summaryContent =
              parsed?.summary ||
              (item.description
                ? item.description.substring(0, 347) + '...'
                : '요약 정보가 제공되지 않습니다.');
            const backgroundContent = parsed?.background || null;
            const articleTags =
              parsed && Array.isArray(parsed.tags) && parsed.tags.length > 0
                ? parsed.tags
                : FALLBACK_TAGS[finalCategory];

            // Realtime duplicate check
            const { data: dbDup } = await supabaseAdmin
              .from('articles')
              .select('id')
              .eq('source_url', sourceUrl)
              .maybeSingle();

            if (dbDup) {
              feedReport.skipped++;
              existingUrls.add(normalizeUrl(sourceUrl));
              continue;
            }

            // Parse pubDate
            let publishedAt = new Date().toISOString();
            if (item.pubDate) {
              const d = new Date(item.pubDate);
              if (!isNaN(d.getTime())) publishedAt = d.toISOString();
            }

            // Insert — image guaranteed non-null (checked above)
            const { error: insertError } = await supabaseAdmin.from('articles').insert({
              category: finalCategory,
              hook_title: hookTitle,
              summary: summaryContent,
              background: backgroundContent,
              image_url: item.imageUrl,
              source_url: sourceUrl,
              source_name: feed.sourceName,
              tags: articleTags,
              published_at: publishedAt,
            });

            if (insertError) {
              throw new Error(`DB insert error: ${insertError.message}`);
            }

            feedReport.inserted++;
            existingUrls.add(normalizeUrl(sourceUrl));
          } catch (itemErr: unknown) {
            feedReport.failed++;
            feedReport.errors.push(
              `${item.title.substring(0, 30)}: ${(itemErr as Error).message}`
            );
          }
        }
      } catch (catErr: unknown) {
        feedReport.errors.push(`Feed error: ${(catErr as Error).message}`);
      }

      report.push(feedReport);
    }

    return NextResponse.json({
      status: 'completed',
      timestamp: new Date().toISOString(),
      summary: report,
    });
  } catch (globalErr: unknown) {
    return NextResponse.json(
      { error: `Internal server error: ${(globalErr as Error).message}` },
      { status: 500 }
    );
  }
}
