import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { hookTitle, summary } = await req.json();

    // API 키가 없는 경우 fallback 처리
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = `당신은 BRIEF의 AI 어시스턴트입니다. 
사용자가 읽고 있는 다음 뉴스 기사를 기반으로 기획자나 마케터가 유용하게 질문할 만한 흥미롭고 실용적인 질문 3가지를 추천해 주세요.

기사 제목: ${hookTitle}
기사 요약: ${summary}

질문 선정 기준:
1. 기획자, 마케터, 비즈니스 분석가 관점에서 실무적이고 인사이트를 얻을 수 있는 질문
2. 기사의 구체적인 내용과 트렌드에 밀착된 흥미로운 질문
3. 간결하고 자연스러운 한국어 질문 3가지 (각 20자 내외 권장)

응답 형식:
반드시 추가 텍스트(예: 설명이나 마크다운 백틱 등) 없이 아래와 같은 순수 JSON 문자열 배열 형식으로만 응답해야 합니다. 예외는 없습니다.
["질문 1", "질문 2", "질문 3"]`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: "You are a professional assistant that outputs only raw JSON arrays.",
      messages: [{ role: 'user', content: prompt }],
    });

    const content = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // JSON 파싱 시도
    let questions = [];
    try {
      const cleaned = content.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      questions = JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse Claude questions JSON:', e);
      throw new Error('Invalid JSON format');
    }

    if (!Array.isArray(questions) || questions.length < 3) {
      throw new Error('Questions generated are not in a valid list of size 3.');
    }

    // 앞부분의 숫자 인덱스 등이 있으면 청소 (예: "1. 질문 내용" -> "질문 내용")
    const cleanedQuestions = questions.slice(0, 3).map((q: string) => {
      return q.replace(/^\d+\.\s*/, '').trim();
    });

    return new Response(JSON.stringify(cleanedQuestions), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    // 실패 시 500에러와 함께 빈배열을 돌려주어 프론트에서 기본 fallback 질문으로 대체하게 함
    return new Response(JSON.stringify([]), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
