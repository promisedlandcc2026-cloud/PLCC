import React, { useState, useRef, useEffect } from 'react';
import { X, Send, MessageSquare, Shield, Sparkles } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { AvatarDisplay } from './AvatarDisplay';

export const DirectMessageModal: React.FC = () => {
  const {
    activeChatPartnerId,
    closeChat,
    members,
    currentUser,
    messages,
    sendDirectMessage,
    navigateToMemberProfile,
  } = useChurch();

  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const partner = members.find((m) => m.id === activeChatPartnerId);

  // Filter messages between currentUser and partner
  const conversation = messages.filter(
    (msg) =>
      (msg.senderId === currentUser.id && msg.receiverId === activeChatPartnerId) ||
      (msg.senderId === activeChatPartnerId && msg.receiverId === currentUser.id)
  );

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.length]);

  if (!activeChatPartnerId || !partner) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    sendDirectMessage(partner.id, inputText);
    setInputText('');
  };

  const quickGreetings = [
    'God bless you!',
    'Praying for you today!',
    'See you at Sunday service!',
    'Standing in agreement in prayer.',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full h-[620px] max-h-[90vh] border border-stone-200 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-stone-100 flex items-center justify-between bg-stone-50/80">
          <div
            className="flex items-center gap-3 cursor-pointer group"
            onClick={() => {
              navigateToMemberProfile(partner.id);
              closeChat();
            }}
          >
            <AvatarDisplay
              name={partner.fullName}
              avatarUrl={partner.avatarUrl}
              size="sm"
              showOnlineStatus
              isOnline={true}
            />
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-semibold text-sm text-stone-900 group-hover:text-[#1d372c] transition-colors">
                  {partner.fullName}
                </h3>
                <span className="text-[10px] text-stone-400">@{partner.username}</span>
              </div>
              <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Active in fellowship &middot; {partner.role}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={closeChat}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick notice banner */}
        <div className="bg-[#EEF3EF] px-4 py-2 border-b border-[#1d372c]/10 text-[11px] text-[#1d372c]">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-[#1d372c]" />
            This note stays on this screen. It is not delivered. Use Community for a message that is sent.
          </span>
        </div>

        {/* Messages Body */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#fdfdfd]">
          {conversation.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                <MessageSquare className="w-6 h-6 text-[#1d372c]" />
              </div>
              <p className="text-xs text-stone-600 max-w-xs">
                This is the beginning of your direct fellowship conversation with{' '}
                <strong className="text-stone-900">{partner.fullName}</strong>.
              </p>
              <div className="pt-2 flex flex-wrap gap-1.5 justify-center">
                {quickGreetings.map((greet, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      sendDirectMessage(partner.id, greet);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-stone-100 hover:bg-[#EEF3EF] hover:text-[#1d372c] text-stone-700 transition-colors border border-stone-200"
                  >
                    {greet}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            conversation.map((msg) => {
              const isMine = msg.senderId === currentUser.id;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-xs leading-relaxed ${
                      isMine
                        ? 'bg-[#1d372c] text-white rounded-br-xs'
                        : 'bg-stone-100 text-stone-800 rounded-bl-xs border border-stone-200/60'
                    }`}
                  >
                    <p>{msg.content}</p>
                  </div>
                  <span className="text-[10px] text-stone-400 mt-1 px-1 font-mono tabular-nums">
                    {msg.timestamp}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Send Chips */}
        <div className="px-4 py-1.5 border-t border-stone-100 bg-stone-50/50 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <Sparkles className="w-3 h-3 text-[#C9A35A] shrink-0" />
          {quickGreetings.slice(0, 3).map((g, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInputText(g)}
              className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-stone-200 text-stone-600 hover:text-stone-900 shrink-0"
            >
              {g}
            </button>
          ))}
        </div>

        {/* Input Footer */}
        <form onSubmit={handleSend} className="p-3 bg-white border-t border-stone-100 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={`Message ${partner.preferredName || partner.fullName}...`}
            className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2 rounded-xl bg-[#1d372c] text-white hover:bg-[#12231c] transition-colors disabled:opacity-40"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
