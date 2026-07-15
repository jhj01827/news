import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

// ─────────────────────────────────────────────────────────────
// 1. RSS FEED CONFIG
// ─────────────────────────────────────────────────────────────
interface FeedConfig {
  key: 'tech' | 'beauty' | 'fashion' | 'culture' | 'meme' | 'retail';
  sourceName: string;
  url: string;
}

const RSS_FEEDS: FeedConfig[] = [
  // 테크
  { key: 'tech',    sourceName: 'The Verge',  url: 'https://www.theverge.com/rss/index.xml' },
  { key: 'tech',    sourceName: 'Wired',      url: 'https://www.wired.com/feed/rss' },
  { key: 'tech',    sourceName: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  // 패션
  { key: 'fashion', sourceName: 'Hypebeast',  url: 'https://hypebeast.com/feed' },
  { key: 'fashion', sourceName: 'Vogue',      url: 'https://www.vogue.com/feed/rss' },
  { key: 'fashion', sourceName: 'BoF',        url: 'https://www.businessoffashion.com/rss' },
  // 뷰티
  { key: 'beauty',  sourceName: 'Allure',     url: 'https://www.allure.com/feed/rss' },
  { key: 'beauty',  sourceName: 'Byrdie',     url: 'https://www.byrdie.com/rss' },
  { key: 'beauty',  sourceName: 'BeautyMatter', url: 'https://beautymatter.com/feed/' },
  // 리테일/마케팅
  { key: 'retail',  sourceName: 'Adweek',       url: 'https://www.adweek.com/feed/' },
  { key: 'retail',  sourceName: 'Marketing Week', url: 'https://marketingweek.com/feed/' },
  { key: 'retail',  sourceName: 'Retail Dive',  url: 'https://www.retaildive.com/feeds/news/' },
  // 컬처
  { key: 'culture', sourceName: 'Pitchfork',  url: 'https://pitchfork.com/rss/news/' },
  { key: 'culture', sourceName: 'Dazed',      url: 'https://www.dazeddigital.com/rss' },
  { key: 'culture', sourceName: 'NME',        url: 'https://www.nme.com/feed' },
  // 밈/소셜
  { key: 'meme',    sourceName: 'Mashable',   url: 'https://mashable.com/feeds/rss/all' },
  { key: 'meme',    sourceName: 'BuzzFeed',   url: 'https://www.buzzfeed.com/index.xml' },
  { key: 'meme',    sourceName: 'Know Your Meme', url: 'https://knowyourmeme.com/feed' },
];

const FALLBACK_TAGS: Record<string, string[]> = {
  tech:    ['테크', 'IT', '기술'],
  beauty:  ['뷰티', '뷰티트렌드', '스킨케어'],
  fashion: ['패션', '트렌드', '스타일'],
  retail:  ['리테일', '비즈니스', '마케팅'],
  culture: ['컬처', '문화', '트렌드'],
  meme:    ['밈', '인터넷문화', '트렌드'],
};

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
  imageUrl: string | null; // null means no image found from RSS
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
  const enclosureImageM = block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image[^"']*["']/i)
    || block.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i);
  if (enclosureImageM) {
    // find url group specifically
    const urlOnly = block.match(/<enclosure[^>]+(?=.*type=["']image).*?url=["']([^"']+)["']/i)
      || block.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image/i);
    if (urlOnly) return urlOnly[1];
  }

  // 4) <img> tag inside content:encoded or description
  const contentM =
    block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
    block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
  if (contentM) {
    const html = extractCdata(contentM[1]);
    // Try to find the first meaningful image (skip 1x1 tracking pixels)
    const imgMatches = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
    for (const m of imgMatches) {
      const src = m[1];
      // Skip tiny tracking pixels and data URIs
      if (src.startsWith('data:')) continue;
      if (src.includes('1x1') || src.includes('pixel') || src.includes('tracking')) continue;
      return src;
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

    // image from RSS (null if not found)
    const imageUrl = extractImageFromRss(block);

    // pubDate
    const pubM = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const pubDate = pubM ? extractCdata(pubM[1]).trim() : null;

    // description / content:encoded
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
    const pageSize = limitParam ? parseInt(limitParam, 10) : 15; // 15 per feed

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!anthropicApiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY environment variable is not set.' },
        { status: 500 }
      );
    }

    if (!supabaseServiceRoleKey) {
      return NextResponse.json(
        { error: 'SUPABASE_SERVICE_ROLE_KEY environment variable is not set.' },
        { status: 500 }
      );
    }

    // Fetch existing source_urls for duplicate prevention
    const { data: existingArticles, error: dbError } = await supabaseAdmin
      .from('articles')
      .select('source_url');

    if (dbError) {
      console.error('[Sync API] Error fetching existing articles:', dbError.message);
      return NextResponse.json(
        { error: `Database error: ${dbError.message}` },
        { status: 500 }
      );
    }

    const existingUrls = new Set<string>(
      existingArticles
        ? existingArticles.map((a: { source_url: string }) => normalizeUrl(a.source_url))
        : []
    );

    const anthropic = new Anthropic({ apiKey: anthropicApiKey });

    const report: {
      feed: string;
      category: string;
      fetched: number;
      processed: number;
      inserted: number;
      skipped: number;
      no_image: number;
      failed: number;
      errors: string[];
    }[] = [];

    // ── Process each RSS feed ────────────────────────────────
    for (const feed of RSS_FEEDS) {
      const feedReport = {
        feed: feed.sourceName,
        category: feed.key,
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

          // Skip already-saved articles
          if (!forceParam && existingUrls.has(normalizeUrl(sourceUrl))) {
            feedReport.skipped++;
            continue;
          }

          // Skip articles without images entirely — no fallback
          if (!item.imageUrl) {
            console.log(`[Sync API] No image, skipping: ${item.title.substring(0, 50)}`);
            feedReport.no_image++;
            continue;
          }

          feedReport.processed++;

          // ── Claude: filter + translate + summarize + background ─────
          const systemPrompt = `당신은 트렌드 및 기획 전문 매체 BRIEF의 AI 편집장입니다. 기획자, 마케터, 비즈니스 리더들을 위해 영어 뉴스 기사를 선별하고 한국어 트렌드 요약과 배경 지식을 작성해 주세요.

반드시 다음 규칙을 지키십시오:
1. 응답은 오직 JSON 형식으로만 반환해야 합니다. 마크다운 백틱(\`\`\`json ...)이나 부연 설명 없이, 오직 JSON 문자열만 응답하세요.
2. 먼저 기사가 트렌드와 관련이 있는지 판단하십시오. 트렌드 관련 기사의 예시: 소비자 트렌드, 문화적 움직임, 마케팅 캠페인, 신제품/서비스 출시, 바이럴 현상, 패션·뷰티·테크 동향. 트렌드와 무관한 기사의 예시: 주가·금리 등 금융 수치, 정치·선거, 범죄·사건·사고, 재해·재난, 단순 인사이동.
3. JSON 구조는 반드시 다음 5개의 필드를 포함해야 합니다:
   - "skip": 트렌드와 무관한 기사이면 true, 트렌드 관련 기사이면 false. (boolean)
   - "hook_title": skip이 false일 때만 작성. 영어 제목을 한국어로 번역하여, 기획자·마케터의 이목을 끄는 실용적인 한국어 제목으로 작성 (15~25자 내외). 절대 영어 제목을 그대로 유지하지 마십시오. skip이 true이면 빈 문자열("").
   - "summary": skip이 false일 때만 작성. 비전문가 수준의 평이하고 단순한 구어체·대화체 한국어로 작성. 공백 포함 300~400자 사이. 반드시 완전한 문장으로 끝내야 하며 절대 문장 중간에 끊어지거나 말줄임표로 끝나서는 안 됩니다. skip이 true이면 빈 문자열("").
   - "background": skip이 false일 때만 작성. 한국 독자가 모를 수 있는 문화적 맥락, 브랜드 배경, 시장 구조를 1~2문장으로 설명하는 번역자 주석. skip이 true이면 빈 문자열("").
   - "tags": skip이 false일 때만 작성. 한국어로 생성한 1~3개의 핵심 한글 키워드 태그 배열. skip이 true이면 빈 배열([]).`;

          const userContent = `기사 제목: ${item.title}
본문 내용: ${item.description}`;

          try {
            const claudeResponse = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 700,
              system: systemPrompt,
              messages: [{ role: 'user', content: userContent }],
              temperature: 0.2,
            });

            const text =
              claudeResponse.content[0].type === 'text'
                ? claudeResponse.content[0].text
                : '';

            // Parse JSON response
            let parsed: {
              skip?: boolean;
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
                throw new Error('No JSON object found in Claude response');
              }
            } catch (jsonErr: unknown) {
              console.warn(
                `[Sync API] Failed to parse Claude output for ${sourceUrl}:`,
                text,
                (jsonErr as Error).message
              );
            }

            // Skip non-trend articles
            if (parsed?.skip === true) {
              console.log(`[Sync API] Skipped (not trend-related): ${item.title}`);
              feedReport.skipped++;
              continue;
            }

            const hookTitle = parsed?.hook_title || item.title;
            const summaryContent =
              parsed?.summary ||
              (item.description
                ? item.description.substring(0, 347) + '...'
                : '요약 정보가 제공되지 않습니다.');
            const backgroundContent = parsed?.background || null;
            const articleTags =
              parsed && Array.isArray(parsed.tags)
                ? parsed.tags
                : FALLBACK_TAGS[feed.key] || [feed.key];

            // Realtime duplicate check
            const { data: dbDup, error: dupCheckError } = await supabaseAdmin
              .from('articles')
              .select('id')
              .eq('source_url', sourceUrl)
              .maybeSingle();

            if (dupCheckError) {
              console.warn(
                `[Sync API] Error checking duplicate for ${sourceUrl}:`,
                dupCheckError.message
              );
            }

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

            // Insert into Supabase — image_url is always item.imageUrl (already verified non-null above)
            const { error: insertError } = await supabaseAdmin.from('articles').insert({
              category: feed.key,
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
              throw new Error(`Database insert error: ${insertError.message}`);
            }

            feedReport.inserted++;
            existingUrls.add(normalizeUrl(sourceUrl));
          } catch (itemErr: unknown) {
            console.error(
              `[Sync API] Failed to process article ${sourceUrl}:`,
              (itemErr as Error).message
            );
            feedReport.failed++;
            feedReport.errors.push(
              `${item.title.substring(0, 30)}...: ${(itemErr as Error).message}`
            );
          }
        }
      } catch (catErr: unknown) {
        console.error(
          `[Sync API] RSS feed ${feed.sourceName} error:`,
          (catErr as Error).message
        );
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
    console.error('[Sync API] Global execution error:', globalErr);
    return NextResponse.json(
      { error: `Internal server error: ${(globalErr as Error).message}` },
      { status: 500 }
    );
  }
}
