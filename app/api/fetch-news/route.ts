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
  { key: 'tech',    sourceName: 'TechCrunch',    url: 'https://techcrunch.com/feed/' },
  { key: 'fashion', sourceName: 'Hypebeast',     url: 'https://hypebeast.com/feed' },
  { key: 'beauty',  sourceName: 'BeautyMatter',  url: 'https://beautymatter.com/feed/' },
  { key: 'retail',  sourceName: 'Adweek',        url: 'https://www.adweek.com/feed/' },
  { key: 'culture', sourceName: 'Pitchfork',     url: 'https://pitchfork.com/rss/news/' },
  { key: 'meme',    sourceName: 'Mashable',      url: 'https://mashable.com/feeds/rss/all' },
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
// 2. URL NORMALIZATION (duplicate prevention)
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

function parseRss(xml: string, limit: number): RssItem[] {
  const items: RssItem[] = [];

  // Split into <item> blocks
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];

    // title
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleM ? extractCdata(titleM[1]) : '';
    if (!title) continue;

    // link — prefer <link> text node over CDATA; some feeds use <link href="...">
    let link = '';
    const linkM = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    if (linkM) {
      link = extractCdata(linkM[1]);
    } else {
      const linkAttrM = block.match(/<link[^>]+href=["']([^"']+)["']/i);
      if (linkAttrM) link = linkAttrM[1];
    }
    if (!link) continue;

    // image — try media:content first, then enclosure, then og:image in description
    let imageUrl: string | null = null;

    const mediaM = block.match(/<media:content[^>]+url=["']([^"']+)["']/i);
    if (mediaM) {
      imageUrl = mediaM[1];
    } else {
      const enclosureM = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
      if (enclosureM) {
        imageUrl = enclosureM[1];
      } else {
        // try <media:thumbnail>
        const thumbM = block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
        if (thumbM) imageUrl = thumbM[1];
      }
    }

    // pubDate
    const pubM = block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i);
    const pubDate = pubM ? extractCdata(pubM[1]).trim() : null;

    // description / content:encoded (for summary text)
    const contentM =
      block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i) ||
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i);
    const rawDesc = contentM ? extractCdata(contentM[1]) : '';
    // Strip HTML tags from description
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
    const pageSize = limitParam ? parseInt(limitParam, 10) : 5;

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

    // Fetch existing source_urls from Supabase (duplicate prevention)
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
      category: string;
      fetched: number;
      processed: number;
      inserted: number;
      skipped: number;
      failed: number;
      errors: string[];
    }[] = [];

    // ── Process each RSS feed ────────────────────────────────
    for (const feed of RSS_FEEDS) {
      const categoryReport = {
        category: feed.key,
        fetched: 0,
        processed: 0,
        inserted: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      try {
        const rssItems = await fetchRssFeed(feed.url, pageSize);
        categoryReport.fetched = rssItems.length;

        for (const item of rssItems) {
          const sourceUrl = item.link;

          // Skip already-saved articles (unless force=true)
          if (!forceParam && existingUrls.has(normalizeUrl(sourceUrl))) {
            categoryReport.skipped++;
            continue;
          }

          categoryReport.processed++;

          // ── Claude: translate + summarize + background ─────
          const systemPrompt = `당신은 트렌드 및 기획 전문 매체 BRIEF의 AI 편집장입니다. 기획자, 마케터, 비즈니스 리더들을 위해 영어 뉴스 기사를 바탕으로 한국어 트렌드 요약과 배경 지식을 작성해 주세요.

반드시 다음 규칙을 지키십시오:
1. 응답은 오직 JSON 형식으로만 반환해야 합니다. 마크다운 백틱(\`\`\`json ...)이나 부연 설명 없이, 오직 JSON 문자열만 응답하세요.
2. JSON 구조는 반드시 다음 4개의 필드를 포함해야 합니다:
   - "hook_title": 영어 제목을 한국어로 번역하여, 기획자·마케터의 이목을 끄는 실용적인 한국어 제목으로 작성 (15~25자 내외). 절대 영어 제목을 그대로 유지하지 마십시오.
   - "summary": 한국어로 작성된 핵심 요약 본문. 비전문가 수준의 평이하고 단순한 구어체·대화체 한국어로 작성하세요. 공백 포함 300~400자 사이로 작성. 반드시 완전한 문장으로 끝내야 하며 절대 문장 중간에 끊어지거나 말줄임표로 끝나서는 안 됩니다.
   - "background": 한국 독자가 모를 수 있는 문화적 맥락, 브랜드 배경, 시장 구조를 1~2문장으로 설명하는 번역자 주석 형식의 배경 지식. 기사에 등장하는 브랜드·인물·플랫폼·문화적 현상이 무엇인지, 왜 중요한지 쉽게 설명하세요. (예: "TechCrunch는 2005년 창간된 실리콘밸리 중심의 IT 전문 미디어로, 스타트업 투자 및 빅테크 동향을 가장 먼저 보도하는 매체입니다.")
   - "tags": 반드시 한국어로 생성한 1~3개의 핵심 한글 키워드 태그가 담긴 배열. 예: ["생성형 AI", "Z세대", "리테일테크"]`;

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

            const hookTitle = parsed?.hook_title || item.title;
            const summaryContent =
              parsed?.summary ||
              (item.description
                ? item.description.substring(0, 347) + '...'
                : '요약 정보가 제공되지 않습니다.');
            const backgroundContent = parsed?.background || null;
            const articleTags = parsed && Array.isArray(parsed.tags)
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
              categoryReport.skipped++;
              existingUrls.add(normalizeUrl(sourceUrl));
              continue;
            }

            // Parse pubDate
            let publishedAt = new Date().toISOString();
            if (item.pubDate) {
              const parsed = new Date(item.pubDate);
              if (!isNaN(parsed.getTime())) publishedAt = parsed.toISOString();
            }

            // Insert into Supabase
            const { error: insertError } = await supabaseAdmin.from('articles').insert({
              category: feed.key,
              hook_title: hookTitle,
              summary: summaryContent,
              background: backgroundContent,
              image_url: item.imageUrl || null,
              source_url: sourceUrl,
              source_name: feed.sourceName,
              tags: articleTags,
              published_at: publishedAt,
            });

            if (insertError) {
              throw new Error(`Database insert error: ${insertError.message}`);
            }

            categoryReport.inserted++;
            existingUrls.add(normalizeUrl(sourceUrl));
          } catch (itemErr: unknown) {
            console.error(
              `[Sync API] Failed to process article ${sourceUrl}:`,
              (itemErr as Error).message
            );
            categoryReport.failed++;
            categoryReport.errors.push(
              `${item.title.substring(0, 30)}...: ${(itemErr as Error).message}`
            );
          }
        }
      } catch (catErr: unknown) {
        console.error(
          `[Sync API] RSS feed ${feed.key} error:`,
          (catErr as Error).message
        );
        categoryReport.errors.push(`Feed error: ${(catErr as Error).message}`);
      }

      report.push(categoryReport);
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
