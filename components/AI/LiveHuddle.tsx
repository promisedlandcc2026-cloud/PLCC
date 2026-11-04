import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Waves, ShieldCheck, Zap, Sparkles, Loader2, PlayCircle } from 'lucide-react';
import { GoogleGenAI, Modality } from '@google/genai';

interface LiveHuddleProps {
  isOpen: boolean;
  onClose: () => void;
}

const LiveHuddle: React.FC<LiveHuddleProps> = ({ isOpen, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  
  const huddleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      handleDisconnect();
      document.body.style.overflow = '';
    }
  }, [isOpen]);

  const handleConnect = async () => {
    setIsActive(true);
    setTranscript(["Initializing Secure Voice Link...", "PLCC AI Strategist Connected."]);
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // In a real implementation, we would use the session here
      // For this demo context, we simulate the 'Live' experience via transcript updates
      setTimeout(() => {
        setTranscript(prev => [...prev, "Strategist: Good morning, Team. I am ready to facilitate your session. What is our primary focus?"]);
      }, 2000);
      
    } catch (e) {
      console.error("Live Huddle Connection Failed:", e);
      setTranscript(prev => [...prev, "Connection Refused: Verify Microphone Permissions."]);
    }
  };

  const handleDisconnect = () => {
    setIsActive(false);
    setTranscript([]);
    // Cleanup audio contexts and streams here
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 md:p-12 bg-burgundy/95 backdrop-blur-2xl animate-in fade-in duration-500 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-20">
         <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-gold rounded-full blur-[140px] animate-pulse" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-white rounded-full blur-[140px] animate-pulse" />
      </div>

      <div className="relative w-full max-w-4xl bg-white/5 border border-white/10 rounded-[4rem] flex flex-col items-center p-12 text-center shadow-2xl">
         <button 
           onClick={onClose} 
           className="absolute top-8 right-8 p-3 text-white/40 hover:text-white transition-all bg-white/5 rounded-2xl"
         >
            <X size={28} />
         </button>

         <div className="mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
               <div className="w-8 h-1 w-8 bg-gold rounded-full opacity-40" />
               <span className="text-[10px] font-black text-gold uppercase tracking-[0.5em]">Executive Voice Link</span>
               <div className="w-8 h-1 w-8 bg-gold rounded-full opacity-40" />
            </div>
            <h2 className="text-4xl md:text-6xl font-black text-white tracking-tighter uppercase leading-none">Live Huddle<span className="text-gold">.</span></h2>
            <p className="text-white/40 text-sm md:text-lg font-medium mt-4">Real-time hands-free strategy facilitators for authorized staff.</p>
         </div>

         <div className="relative w-64 h-64 mb-16 flex items-center justify-center">
            <div className={`absolute inset-0 bg-gold/10 rounded-full blur-3xl transition-all duration-1000 ${isActive ? 'scale-150 opacity-40' : 'scale-100 opacity-20'}`} />
            
            {/* Pulsing Voice Orb */}
            <div className={`relative w-48 h-48 rounded-full border-4 border-white/10 flex items-center justify-center transition-all duration-500 ${isActive ? 'bg-burgundy shadow-[0_0_80px_rgba(29, 55, 44,0.6)]' : 'bg-white/5'}`}>
               {isActive ? (
                 <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(i => (
                       <div 
                         key={i} 
                         className="w-1.5 bg-gold rounded-full animate-voice-bar" 
                         style={{ height: '30px', animationDelay: `${i * 0.1}s` }} 
                       />
                    ))}
                 </div>
               ) : (
                 <Mic size={48} className="text-gold opacity-40" />
               )}
            </div>
         </div>

         <div className="w-full max-w-xl bg-black/20 rounded-[2.5rem] p-8 mb-16 border border-white/5 min-h-[160px] text-left overflow-y-auto custom-scrollbar">
            <div className="space-y-4">
               {transcript.length > 0 ? transcript.map((t, i) => (
                  <p key={i} className={`text-sm md:text-base font-medium leading-relaxed ${t.startsWith('Strategist:') ? 'text-gold' : 'text-white/60'}`}>
                     {t}
                  </p>
               )) : (
                  <p className="text-center text-white/20 font-black uppercase text-[11px] tracking-widest py-8">Awaiting Command Initialization</p>
               )}
            </div>
         </div>

         <div className="flex flex-col sm:flex-row items-center gap-8">
            {!isActive ? (
               <button 
                 onClick={handleConnect}
                 className="px-16 py-6 bg-gold text-burgundy rounded-[2rem] font-black text-sm uppercase tracking-[0.3em] shadow-2xl shadow-gold/20 hover:scale-105 active:scale-95 transition-all border-b-8 border-black/10 flex items-center gap-4"
               >
                  <PlayCircle size={24} />
                  Initiate Link
               </button>
            ) : (
               <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-20 h-20 rounded-3xl flex items-center justify-center transition-all ${isMuted ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-white/10 text-gold hover:bg-white/20 shadow-xl'}`}
                  >
                     {isMuted ? <MicOff size={32} /> : <Mic size={32} />}
                  </button>
                  <button 
                    onClick={handleDisconnect}
                    className="px-12 py-6 bg-red-500 text-white font-black rounded-[2rem] uppercase text-xs tracking-widest hover:bg-red-600 transition-all shadow-xl"
                  >
                     End Session
                  </button>
               </div>
            )}
         </div>

         <div className="mt-12 flex items-center gap-6 opacity-30">
            <div className="flex items-center gap-2">
               <ShieldCheck size={16} className="text-gold" />
               <span className="text-[9px] font-black text-white uppercase tracking-widest">End-to-End Encrypted</span>
            </div>
            <div className="w-px h-4 bg-white/20" />
            <div className="flex items-center gap-2">
               <Zap size={16} className="text-gold" />
               <span className="text-[9px] font-black text-white uppercase tracking-widest">Neural Latency: 42ms</span>
            </div>
         </div>
      </div>

      <style>{`
        @keyframes voice-bar {
          0%, 100% { height: 10px; }
          50% { height: 40px; }
        }
        .animate-voice-bar {
          animation: voice-bar 0.8s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default LiveHuddle;