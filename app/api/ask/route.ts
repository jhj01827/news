import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: NextRequest) {
  const { question, context, hookTitle, history = [] } = await req.json();

  const systemPrompt = `당신은 BRIEF의 AI 어시스턴트입니다. 기획자·마케터를 위한 해외 트렌드 뉴스 앱에서 독자의 질문에 답변합니다.

현재 기사 제목: ${hookTitle}
기사 요약: ${context}

반드시 지켜야 할 규칙:
1. 답변은 최대 2~3문장으로 제한한다. 절대 그 이상 쓰지 않는다.
2. 반드시 완전한 문장으로 끝내세요. 문장 중간에 절대 끊기지 마세요.
3. 글머리 기호(•, -, *), 번호 목록, 마크다운 없이 자연스러운 대화체 한국어로 작성한다.
4. 한국 기획자·마케터에게 즉시 실용적인 인사이트를 전달한다.
5. "좋은 질문이에요", "물론이죠" 등 불필요한 서두 없이 바로 본론으로 시작한다.`;

  const messages = [
    ...history.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: question },
  ];

  const stream = await client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === 'content_block_delta' &&
          chunk.delta.type === 'text_delta'
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
