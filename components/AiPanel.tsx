'use client';

import { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '@/lib/types';

interface Props {
  articleId: string;
  context: string;
  hookTitle: string;
  /** 현재 스크롤로 보이는 기사인지 여부 — 입력창 fixed 위치 표시 여부 */
  isActive?: boolean;
}

export default function AiPanel({ articleId, context, hookTitle, isActive = false }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [memos, setMemos] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 스크롤 제어
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 해당 기사의 저장된 메모 로드
  useEffect(() => {
    const saved = localStorage.getItem(`brief_memos_${articleId}`);
    if (saved) {
      setMemos(JSON.parse(saved));
    } else {
      setMemos([]);
    }
  }, [articleId]);

  // Claude API 맞춤형 질문 추천 생성 및 로드
  useEffect(() => {
    const fetchQuestions = async () => {
      setLoadingSuggestions(true);
      try {
        const res = await fetch('/api/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hookTitle, summary: context }),
        });
        if (!res.ok) throw new Error('Failed to generate custom questions');
        const data = await res.json();
        if (Array.isArray(data) && data.length >= 3) {
          setSuggestions(data);
        } else {
          throw new Error('Invalid suggested questions format');
        }
      } catch (e) {
        console.error('Failed to load dynamic questions, fallback to defaults:', e);
        // 오류 발생 시 기본 질문 리스트 제공 (Fallback)
        setSuggestions([
          '이 트렌드가 한국 시장에 미칠 영향은?',
          '우리 브랜드에 어떻게 활용할 수 있을까?',
          '비슷한 해외 사례가 더 있어?',
        ]);
      } finally {
        setLoadingSuggestions(false);
      }
    };

    fetchQuestions();
  }, [articleId, hookTitle, context]);

  // 메모 저장
  const handleSaveMemo = (content: string) => {
    if (memos.includes(content)) return;
    const updated = [...memos, content];
    setMemos(updated);
    localStorage.setItem(`brief_memos_${articleId}`, JSON.stringify(updated));
  };

  // 메모 삭제
  const handleDeleteMemo = (content: string) => {
    const updated = memos.filter((m) => m !== content);
    setMemos(updated);
    localStorage.setItem(`brief_memos_${articleId}`, JSON.stringify(updated));
  };

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: q };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const aiMsg: ChatMessage = { role: 'assistant', content: '' };
    setMessages((prev) => [...prev, aiMsg]);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          context,
          hookTitle,
          history: messages,
        }),
      });

      if (!res.ok) throw new Error('API error');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error('No stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: updated[updated.length - 1].content + chunk,
          };
          return updated;
        });
      }
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: '죄송해요, 잠시 후 다시 시도해주세요.',
        };
        return updated;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="ai-panel">
      {/* 헤더 */}
      <div className="ai-panel-header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="var(--text-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          AI에게 질문하기
        </span>
        <span className="ai-panel-header-sub">이 트렌드에 대해 무엇이든 물어보세요</span>
      </div>

      {/* 저장된 메모(답변 북마크) 영역 */}
      {memos.length > 0 && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '0.5px solid var(--border)',
        }}>
          {memos.map((memo, idx) => (
            <div
              key={idx}
              style={{
                background: 'rgba(255,255,255,0.06)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '12px',
                lineHeight: '1.6',
                color: 'var(--text-secondary)',
                position: 'relative',
              }}
            >
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '4px',
              }}>
                <span style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  color: '#FFFFFF',
                  background: 'rgba(255,255,255,0.15)',
                  padding: '2px 6px',
                  borderRadius: '10px',
                }}>
                  내 메모
                </span>
                <button
                  onClick={() => handleDeleteMemo(memo)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-disabled)',
                    cursor: 'pointer',
                    fontSize: '10px',
                    padding: '2px 4px',
                  }}
                >
                  삭제
                </button>
              </div>
              {memo}
            </div>
          ))}
        </div>
      )}

      {/* 메시지 영역 */}
      <div className="ai-panel-messages">
        {messages.length === 0 && (
          <>
            {loadingSuggestions ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map((n) => (
                  <div
                    key={n}
                    className="skeleton"
                    style={{
                      height: '38px',
                      borderRadius: 10,
                      width: '100%',
                    }}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '0.5px solid var(--border)',
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'background 0.15s ease',
                      lineHeight: 1.5,
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'user' ? 'ai-bubble-user' : 'ai-bubble-ai'}
            style={{ 
              animation: 'fadeInUp 0.15s ease forwards',
              display: 'flex',
              flexDirection: 'column',
              gap: msg.role === 'assistant' ? '6px' : '0px',
            }}
          >
            <div>{msg.content}</div>
            {loading && i === messages.length - 1 && msg.role === 'assistant' && msg.content === '' && (
              <span style={{ opacity: 0.5 }}>···</span>
            )}
            
            {/* AI 답변이며 생성 완료 시 북마크 버튼 제공 */}
            {msg.role === 'assistant' && msg.content && (
              <button
                onClick={() => handleSaveMemo(msg.content)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: memos.includes(msg.content) ? 'var(--btn-primary-bg)' : '#8B8B9A',
                  cursor: 'pointer',
                  padding: '4px 0 0 0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  alignSelf: 'flex-end',
                  gap: '4px',
                  fontSize: '10px',
                  fontWeight: 500,
                  transition: 'color 0.2s ease',
                }}
                aria-label="메모로 저장"
                disabled={memos.includes(msg.content)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill={memos.includes(msg.content) ? 'currentColor' : 'none'}
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                {memos.includes(msg.content) ? '저장됨' : '메모 저장'}
              </button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* 입력창 — 패널 내부에 포함 (구분선 위에 위치하게끔 함) */}
      <div className="ai-panel-input-wrap">
        <input
          className="ai-panel-input"
          placeholder="이 트렌드에 대해 질문해보세요..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          maxLength={200}
        />
        <button
          className="ai-send-btn"
          onClick={send}
          disabled={!input.trim() || loading}
          aria-label="질문 전송"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="#0A0A0F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
