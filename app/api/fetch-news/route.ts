import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

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
      existingArticles ? existingArticles.map((a: { source_url: string }) => a.source_url) : []
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
        guardianUrl.searchParams.append('page-size', '3'); // 호출당 카테고리별 3개씩 가져옴
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

          // 이미 저장된 기사이면 스킵
          if (existingUrls.has(sourceUrl)) {
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
   - "hook_title": 한국 기획자·마케터의 이목을 끄는 흥미롭고 실용적인 한국어 제목 (15~25자 내외). 원문의 단순 번역이 아닌 트렌드 분석적 관점의 매력적인 문구여야 합니다.
   - "summary": 한국어로 작성된 핵심 요약 본문 (공백 포함 300자 ~ 500자 사이). 개조식이나 글머리 기호 없이 하나의 유기적인 문단 형태의 서술형식이어야 하며, 실무에 적용 가능한 인사이트나 배경 상황을 전달해야 합니다.
   - "keywords": 기사 주제와 밀접한 1~3개의 핵심 한글/영어 키워드 태그가 담긴 배열. 예: ["생성형 AI", "Z세대", "리테일테크"]
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
            
            // JSON 응답 파싱 시도 (마크다운 백틱 등의 잔여 찌꺼기 제거)
            let parsed: { hook_title: string; summary: string; keywords: string[] };
            try {
              const cleaned = text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
              parsed = JSON.parse(cleaned);
            } catch (jsonErr: any) {
              console.error(`[Sync API] JSON parse error for article ${sourceUrl}:`, text);
              throw new Error(`Failed to parse Claude output as JSON: ${jsonErr.message}`);
            }

            // 필수 필드 체크
            if (!parsed.hook_title || !parsed.summary || !Array.isArray(parsed.keywords)) {
              throw new Error('Claude response is missing required fields or format is incorrect.');
            }

            // 4. Supabase DB에 저장 (RLS 우회를 위해 supabaseAdmin 사용, 컬럼명은 tags로 매핑)
            const { error: insertError } = await supabaseAdmin.from('articles').insert({
              category: config.key,
              hook_title: parsed.hook_title,
              summary: parsed.summary,
              image_url: article.fields?.thumbnail || null,
              source_url: sourceUrl,
              source_name: 'The Guardian',
              tags: parsed.keywords,
              published_at: article.webPublicationDate || new Date().toISOString(),
            });

            if (insertError) {
              throw new Error(`Database insert error: ${insertError.message}`);
            }

            categoryReport.inserted++;
            existingUrls.add(sourceUrl); // 이번 배치 내 중복 추가 방지
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
