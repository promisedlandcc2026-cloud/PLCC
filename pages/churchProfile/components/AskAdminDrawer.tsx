import React, { useEffect, useState } from 'react';
import { Bot, Send, Sparkles, User, X } from 'lucide-react';

interface Message {
  role: 'user' | 'ai';
  content: string;
}

const SUGGESTIONS = [
  'How do I edit my profile?',
  'How do I message a member?',
  'How do I open the directory?',
  'How does a child profile lock work?',
];

function answerFor(question: string): string {
  const q = question.toLowerCase();
  if (q.includes('edit') || q.includes('photo') || q.includes('cover')) {
    return 'Open your own profile, then use Edit My Profile. The camera on your photo crops the avatar, and Change Cover updates the banner. Super Admins can also use Admin Edit on someone else’s profile.';
  }
  if (q.includes('message') || q.includes('dm') || q.includes('chat')) {
    return 'Messages that reach another member are sent from Community. A note typed on a profile is not delivered.';
  }
  if (q.includes('directory') || q.includes('find') || q.includes('search')) {
    return 'Use Directory on the profile to search members by name or household. Selecting a person opens their profile.';
  }
  if (q.includes('child') || q.includes('lock') || q.includes('parent') || q.includes('pin')) {
    return 'Parents and guardians can lock a child profile by age. A lock can hide the photo, contact details, and directory listing. A parent PIN unlocks the profile for the current session.';
  }
  if (q.includes('qr')) {
    return 'Member QR on a profile shows that person’s code so someone can scan it and open the profile quickly.';
  }
  return 'I can help with profiles, the directory, direct messages, and child profile locks. Try one of the suggestions, or ask in plain words.';
}

export const AskAdminDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'ai',
      content: "Ask how to edit a profile, message someone, or open the directory.",
    },
  ]);
  const [input, setInput] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const send = (text?: string) => {
    const next = (text ?? input).trim();
    if (!next) return;
    setInput('');
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: next },
      { role: 'ai', content: answerFor(next) },
    ]);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Ask Admin"
        className="fixed bottom-4 right-4 z-[70] flex flex-col w-[min(100vw-1.5rem,20rem)] max-h-[min(68vh,24rem)] bg-white rounded-2xl shadow-xl border border-stone-200 overflow-hidden"
      >
        <div className="px-3 py-2.5 bg-white border-b border-stone-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 bg-burgundy rounded-lg flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-gold" />
            </div>
            <h2 className="font-bold text-sm text-stone-900 truncate">Ask Admin</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-stone-50 rounded-lg text-stone-400 hover:text-burgundy"
            aria-label="Close Ask Admin"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 bg-stone-50">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex max-w-[92%] gap-1.5 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div
                  className={`w-6 h-6 rounded-md shrink-0 flex items-center justify-center ${
                    msg.role === 'user' ? 'bg-burgundy text-gold' : 'bg-white text-burgundy border border-stone-100'
                  }`}
                >
                  {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                </div>
                <div
                  className={`px-2.5 py-1.5 text-xs leading-5 whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-burgundy text-white rounded-xl rounded-tr-sm'
                      : 'bg-white text-stone-800 border border-stone-100 rounded-xl rounded-tl-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-2.5 bg-white border-t border-stone-100 shrink-0">
          {messages.length < 3 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="px-2 py-1 bg-stone-50 hover:bg-[#EEF3EF] border border-stone-100 rounded-full text-[10px] font-semibold text-stone-500 hover:text-burgundy"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-1.5 bg-stone-50 border border-stone-100 rounded-xl p-1">
            <textarea
              className="flex-1 bg-transparent border-0 text-xs px-2 py-1.5 resize-none outline-none text-stone-800 placeholder:text-stone-400 min-h-[32px] max-h-[72px]"
              placeholder="Ask a question"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={!input.trim()}
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                input.trim() ? 'bg-burgundy text-gold' : 'bg-white text-stone-300 border border-stone-100'
              }`}
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
