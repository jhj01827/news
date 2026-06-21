import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

function normalizeUrl(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    let path = url.pathname;
    if (path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return (url.hostname + path).toLowerCase();
  } catch (e) {
    return urlStr.trim().toLowerCase();
  }
}

const FALLBACK_TAGS: Record<string, string[]> = {
  tech: ['테크', 'IT', '기술'],
  beauty: ['뷰티', '뷰티트렌드', '스킨케어'],
  fashion: ['패션', '트렌드', '스타일'],
  retail: ['리테일', '비즈니스', '유통'],
  culture: ['컬처', '문화', '트렌드'],
  meme: ['밈', '인터넷문화', '트렌드'],
};

interface CategoryConfig {
  key: 'tech' | 'beauty' | 'fashion' | 'retail' | 'culture' | 'meme';
  section: string;
  q?: string;
}

const CATEGORIES_CONFIG: CategoryConfig[] = [
  { key: 'tech', section: 'technology' },
  { key: 'beauty', section: 'fashion', q: 'beauty' },
  { key: 'fashion', section: 'fashion', q: 'clothing OR trends OR style' },
  { key: 'retail', section: 'business', q: 'retail OR commerce OR shopping' },
  { key: 'culture', section: 'culture' },
  { key: 'meme', section: 'culture', q: 'meme OR viral OR "internet culture"' },
];

export async function GET(req: NextRequest) {
  try {
    const limitParam = req.nextUrl.searchParams.get('limit');
    const forceParam = req.nextUrl.searchParams.get('force') === 'true';
    const pageSize = limitParam ? parseInt(limitParam, 10) : 5; // default page-size is 5

    const guardianApiKey = process.env.GUARDIAN_API_KEY;
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!guardianApiKey) {
      return NextResponse.json(
        { error: 'GUARDIAN_API_KEY environment variable is not set.' },
        { status: 500 }
      );
    }

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

    // 1. Supabase에서 기존 기사의 source_url 목록을 조회해 중복 방지 캐시로 사용 (RLS 우회하는 Admin 클라이언트 사용)
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
      existingArticles ? existingArticles.map((a: { source_url: string }) => normalizeUrl(a.source_url)) : []
    );

    const anthropic = new Anthropic({
      apiKey: anthropicApiKey,
    });

    const report: {
      category: string;
      fetched: number;
      processed: number;
      inserted: number;
      skipped: number;
      failed: number;
      errors: string[];
    }[] = [];

    // 2. 카테고리별로 Guardian API에서 최신 기사 가져오기
    for (const config of CATEGORIES_CONFIG) {
      const categoryReport = {
        category: config.key,
        fetched: 0,
        processed: 0,
        inserted: 0,
        skipped: 0,
        failed: 0,
        errors: [] as string[],
      };

      try {
        const guardianUrl = new URL('https://content.guardianapis.com/search');
        guardianUrl.searchParams.append('api-key', guardianApiKey);
        guardianUrl.searchParams.append('section', config.section);
        if (config.q) {
          guardianUrl.searchParams.append('q', config.q);
        }
        guardianUrl.searchParams.append('show-fields', 'headline,bodyText,thumbnail,shortUrl');
        guardianUrl.searchParams.append('page-size', pageSize.toString()); // 호출당 가져오는 기사 개수
        guardianUrl.searchParams.append('order-by', 'newest');

        const guardianRes = await fetch(guardianUrl.toString());
        if (!guardianRes.ok) {
          throw new Error(`Guardian API error: ${guardianRes.status} ${guardianRes.statusText}`);
        }

        const guardianData = await guardianRes.json();
        const results = guardianData.response?.results || [];
        categoryReport.fetched = results.length;

        for (const article of results) {
          const sourceUrl = article.webUrl;

          // 이미 저장된 기사이면 스킵 (forceParam이 true가 아닐 때만)
          if (!forceParam && existingUrls.has(normalizeUrl(sourceUrl))) {
            categoryReport.skipped++;
            continue;
          }

          categoryReport.processed++;

          const headline = article.fields?.headline || article.webTitle || '';
          const bodyText = article.fields?.bodyText || '';
          const truncatedBody = bodyText.substring(0, 4000); // 프롬프트 토큰 조절을 위해 본문 단축

          // 3. Claude를 사용하여 한글 요약 및 메타 정보 생성
          const systemPrompt = `당신은 트렌드 및 기획 전문 매체 BRIEF의 AI 편집장입니다. 기획자, 마케터, 비즈니스 리더들을 위해 영어 뉴스 기사를 바탕으로 가치 있는 한국어 트렌드 요약 및 키워드를 작성해 주세요.

반드시 다음 규칙을 지키십시오:
1. 응답은 오직 JSON 형식으로만 반환해야 합니다. 마크다운 백틱 (\`\`\`json ...)이나 부연 설명 없이, 오직 JSON 문자열만 응답하세요.
2. JSON 구조는 반드시 다음 필드들을 포함해야 합니다:
   - "hook_title": 반드시 영어 기사 제목을 한국어로 번역하고, 기획자·마케터의 이목을 끄는 실용적인 한국어 제목으로 작성해 주세요 (15~25자 내외). 절대 영어 제목을 그대로 유지하지 마십시오.
   - "summary": 한국어로 작성된 핵심 요약 본문으로, 다음 세부 사항을 반드시 준수해야 합니다:
     * 한국의 기획자 및 마케터가 읽기 쉽도록 비전문가 수준의 평이하고 단순한 구어체/대화체 한국어(존댓말 혹은 친근한 문체)로 작성하세요. 전문 용어(Jargon)는 배제하고 쉬운 단어로 풀어 쓰십시오.
     * 공백 포함 최대 150자 이내로 간결하게 작성하세요.
     * 반드시 완전한 문장으로 끝내야 하며, 절대 문장 중간에 끊어지거나 말줄임표로 끝나서는 안 됩니다.
   - "keywords": 반드시 한국어로 생성한 1~3개의 핵심 한글 키워드 태그가 담긴 배열이어야 합니다. 예: ["생성형 AI", "Z세대", "리테일테크"]
`;

          const userContent = `기사 제목: ${headline}
본문 내용: ${truncatedBody}`;

          try {
            const claudeResponse = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 600,
              system: systemPrompt,
              messages: [{ role: 'user', content: userContent }],
              temperature: 0.2,
            });

            const text = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : '';
            
            // JSON 응답 파싱 시도 (Regex로 '{' 와 '}' 사이를 추출하여 파싱)
            let parsed: { hook_title?: string; summary?: string; keywords?: string[] } | null = null;
            try {
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
              } else {
                throw new Error('No JSON object found in Claude response');
              }
            } catch (jsonErr: any) {
              console.warn(`[Sync API] Failed to parse Claude output as JSON for article ${sourceUrl}:`, text, jsonErr.message);
              // JSON 파싱 실패시 null로 두어 폴백을 타게 함
            }

            // 파싱된 데이터 적용 또는 폴백(Fallback) 처리
            const hookTitle = parsed?.hook_title || headline;
            const summaryContent = parsed?.summary || (bodyText ? bodyText.substring(0, 147) + '...' : '요약 정보가 제공되지 않습니다.');
            const articleTags = (parsed && Array.isArray(parsed.keywords)) 
              ? parsed.keywords 
              : (FALLBACK_TAGS[config.key] || [config.key]);

            // 4. Supabase DB에 저장 (RLS 우회를 위해 supabaseAdmin 사용, 컬럼명은 tags로 매핑)
            const { error: insertError } = await supabaseAdmin.from('articles').insert({
              category: config.key,
              hook_title: hookTitle,
              summary: summaryContent,
              image_url: article.fields?.thumbnail || null,
              source_url: sourceUrl,
              source_name: 'The Guardian',
              tags: articleTags,
              published_at: article.webPublicationDate || new Date().toISOString(),
            });

            if (insertError) {
              throw new Error(`Database insert error: ${insertError.message}`);
            }

            categoryReport.inserted++;
            existingUrls.add(normalizeUrl(sourceUrl)); // 이번 배치 내 중복 추가 방지
          } catch (itemErr: any) {
            console.error(`[Sync API] Failed to process article ${sourceUrl}:`, itemErr.message);
            categoryReport.failed++;
            categoryReport.errors.push(`${headline.substring(0, 30)}...: ${itemErr.message}`);
          }
        }
      } catch (catErr: any) {
        console.error(`[Sync API] Category ${config.key} fetch/process error:`, catErr.message);
        categoryReport.errors.push(`Category level error: ${catErr.message}`);
      }

      report.push(categoryReport);
    }

    return NextResponse.json({
      status: 'completed',
      timestamp: new Date().toISOString(),
      summary: report,
    });
  } catch (globalErr: any) {
    console.error('[Sync API] Global execution error:', globalErr);
    return NextResponse.json(
      { error: `Internal server error: ${globalErr.message}` },
      { status: 500 }
    );
  }
}
