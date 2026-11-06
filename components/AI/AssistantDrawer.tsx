
import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, Send, Sparkles, Bot, User, Loader2, Trash2, ExternalLink } from 'lucide-react';
import { useNav } from '../../App';
import { apiFetch, ApiError } from '../../lib/api';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

interface AssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Parse path + optional query from Ask Admin (/path) or (/path?tab=forms&form=Title) */
function parseVaultLink(raw: string): { to: string; label: string } {
  const trimmed = raw.trim();
  return { to: trimmed, label: trimmed };
}

const AssistantDrawer: React.FC<AssistantDrawerProps> = ({ isOpen, onClose }: AssistantDrawerProps) => {
  const { userId, askAdminPrompt, clearAskAdminPrompt } = useNav();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content:
        "Hi! I'm Ask Admin. I explain Canaan in plain words.\n\nAsk me things like how to check someone in (/events/check-someone-in), open Chat (/community/chat), or find Members (/members).\n\nTap any path I show — I stay open so you can check you're in the right place.",
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seedHandledRef = useRef<string | null>(null);
  const handleSendRef = useRef<(manualInput?: string) => Promise<void>>(async () => {});


  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/vault?resource=organization&subResource=church-stats');
        const data = await res.json();
        if (data.ok) setStats(data.stats);
      } catch (err) {
        console.error("AI Sync Error:", err);
      }
    };
    fetchStats();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Close with Esc only — path clicks do not dismiss Ask Admin
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Helper to render message content with clickable links (Ask Admin stays open)
  const renderMessageContent = (content: string) => {
    // Match (/path), (/path/sub), (/path?query=...)
    const urlPattern = /\((\/[^\s)]+)\)/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = urlPattern.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      const { to, label } = parseVaultLink(match[1]);
      parts.push(
        <Link
          key={`${match.index}-${to}`}
          to={to}
          className="inline-flex items-center gap-1 mx-0.5 my-0.5 px-1.5 py-0.5 rounded-md bg-burgundy/10 text-burgundy border border-burgundy/20 hover:bg-burgundy hover:text-gold transition-colors font-bold text-[11px] no-underline align-middle"
          title="Open this page — Ask Admin stays open"
        >
          <ExternalLink size={12} className="shrink-0 opacity-70" />
          {label}
        </Link>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? parts : content;
  };

  const handleSend = async (manualInput?: string) => {
    const textToSend = manualInput || input.trim();
    if (!textToSend || isLoading) return;

    setInput('');
    const nextMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(nextMessages);
    setIsLoading(true);

    try {
      const data = await apiFetch<{
        ok: boolean;
        text?: string;
        provider?: string;
        model?: string;
        error?: string;
      }>('/api/vault?resource=ask-admin', {
        method: 'POST',
        userId,
        body: JSON.stringify({
          messages: nextMessages,
          stats,
        }),
      });

      const aiText =
        data.text ||
        "I'm having trouble retrieving that specific record. Please try rephrasing your request.";
      setMessages((prev) => [...prev, { role: 'ai', content: aiText }]);
    } catch (error) {
      console.error('AI Error:', error);
      let msg =
        error instanceof ApiError
          ? error.message
          : 'Connection interrupted. Please verify OpenAI / Anthropic API keys and credits.';
      if (
        error instanceof ApiError &&
        (error.status === 401 || /bearer|unauthorized/i.test(error.message || ''))
      ) {
        msg = 'Your login session expired. Log out and sign back in, then try Ask Admin again.';
      }
      setMessages((prev) => [
        ...prev,
        {
          role: 'ai',
          content: msg || 'Connection interrupted. Please verify OpenAI / Anthropic API keys and credits.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  handleSendRef.current = handleSend;

  // Page title links: open drawer with a how-to and auto-send once.
  useEffect(() => {
    if (!isOpen) {
      seedHandledRef.current = null;
      return;
    }
    const prompt = (askAdminPrompt || '').trim();
    if (!prompt || isLoading) return;
    if (seedHandledRef.current === prompt) return;
    seedHandledRef.current = prompt;
    clearAskAdminPrompt();
    void handleSendRef.current(prompt);
  }, [isOpen, askAdminPrompt, isLoading, clearAskAdminPrompt]);

  const suggestions = [
    "How do I check in a child?",
    "Where are consent forms?",
    "How do I add a member?",
    "How do I record contributions?",
    "Where are the policies?"
  ];

  if (!isOpen) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label="Ask Admin"
        className="fixed bottom-4 right-4 z-[70] flex flex-col w-[min(100vw-1.5rem,20rem)] max-h-[min(68vh,24rem)] bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden pointer-events-auto"
      >

        <div className="px-3 py-2.5 bg-white border-b border-stone-100 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-burgundy rounded-lg flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-gold" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-sm text-stone-900 leading-none truncate">Ask Admin</h2>
              <p className="text-[10px] text-stone-500 mt-0.5 truncate">Stays open while you follow a path.</p>
            </div>
          </div>
          <div className="flex items-center shrink-0">
            <button onClick={() => setMessages([{ role: 'ai', content: "Okay — fresh start. What do you need help with? Tap any path I give you and I'll stay open." }])} className="p-1 text-stone-300 hover:text-red-500 rounded-lg hover:bg-red-50" aria-label="Clear Ask Admin"><Trash2 size={14} /></button>
            <button onClick={onClose} className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-burgundy" aria-label="Close Ask Admin">
              <X size={16} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-stone-50 custom-scrollbar relative">

          {/* Historical Messages */}
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-6 duration-500`}>
              <div className={`flex max-w-[92%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'} items-start gap-1.5`}>
                <div className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-burgundy text-gold' : 'bg-white text-burgundy border border-stone-100'
                  }`}>
                  {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                </div>
                <div className={`px-2.5 py-1.5 text-xs leading-5 shadow-sm font-medium ${msg.role === 'user'
                  ? 'bg-burgundy text-white rounded-xl rounded-tr-sm'
                  : 'bg-white text-stone-800 border border-stone-100 rounded-xl rounded-tl-sm border-l-2 border-l-gold'
                  }`}>
                  {renderMessageContent(msg.content)}
                </div>
              </div>
            </div>
          ))}

          {/* Loading Indicator */}
          {isLoading && (
            <div className="flex justify-start">
              <div className="flex max-w-[92%] flex-row items-start gap-1.5 animate-pulse">
                <div className="w-6 h-6 rounded-md shrink-0 flex items-center justify-center bg-white text-gold border border-stone-100">
                  <Loader2 size={12} className="animate-spin" />
                </div>
                <div className="px-2.5 py-1.5 rounded-xl rounded-tl-sm bg-white text-stone-500 border border-stone-100 italic text-xs font-medium">
                  Looking that up…
                </div>
              </div>
            </div>
          )}

          <div className="w-full h-1" />
        </div>

        {/* Improved Input Area with Suggestions */}
        <div className="p-2.5 bg-white border-t border-stone-100 shrink-0">

          {!isLoading && messages.length < 3 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(s)}
                  className="px-2 py-1 bg-stone-50 hover:bg-[#EEF3EF] border border-stone-100 rounded-full text-[10px] font-semibold text-stone-500 hover:text-burgundy transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-end gap-1.5 bg-stone-50 border border-stone-100 rounded-xl p-1">
            <textarea
              className="flex-1 bg-transparent border-0 text-xs px-2 py-1.5 resize-none outline-none text-stone-800 placeholder:text-stone-400 min-h-[32px] max-h-[72px]"
              placeholder="Type your inquiry..."
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || isLoading}
              className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${input.trim() && !isLoading
                ? 'bg-burgundy text-gold'
                : 'bg-white text-stone-300 border border-stone-100'
                }`}
              aria-label="Send"
            >
              <Send size={14} fill={input.trim() ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(29, 55, 44, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(29, 55, 44, 0.1); }
      `}</style>
    </>
  );
};

export default AssistantDrawer;
