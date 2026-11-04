
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Loader2, VideoOff } from 'lucide-react';


interface VideoSource {
  id: string;
  title: string;
  type: 'YouTube' | 'Vimeo' | 'Custom';
  url: string;
  is_default?: boolean;
  schedule_note?: string;
  // Legacy support if needed, or just optional
  isDefault?: boolean;
  scheduleNote?: string;
}

interface VideoPlayerProps {
  source: VideoSource;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ source }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auto-hide controls after inactivity
  const controlsTimeout = useRef<number | null>(null);

  const resetControlsTimeout = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) window.clearTimeout(controlsTimeout.current);
    if (isPlaying) {
      controlsTimeout.current = window.setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(e => setError("Autoplay prevented or source invalid."));
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
    resetControlsTimeout();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
    }
    setIsMuted(val === 0);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    videoRef.current.muted = newMuted;
    if (!newMuted && volume === 0) {
      setVolume(0.5);
      videoRef.current.volume = 0.5;
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    const requestFs = containerRef.current.requestFullscreen ||
      (containerRef.current as any).webkitRequestFullscreen ||
      (containerRef.current as any).msRequestFullscreen;
    const exitFs = document.exitFullscreen ||
      (document as any).webkitExitFullscreen ||
      (document as any).msExitFullscreen;

    if (!document.fullscreenElement) {
      requestFs.call(containerRef.current).catch(err => {
        console.error(`Fullscreen error: ${err.message}`);
      });
    } else {
      exitFs.call(document);
    }
  };

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, []);

  // Handle embeds (YouTube/Vimeo)
  const isEmbed = source.type === 'YouTube' || source.type === 'Vimeo' || source.url.includes('youtube.com') || source.url.includes('vimeo.com');

  // Keyboard accessibility
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      // If embed (YouTube/Vimeo), don't intercept keys to allow native players' controls
      if (isEmbed) return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === 'KeyF' || e.key === 'f') toggleFullscreen();
      if (e.code === 'KeyM' || e.key === 'm') toggleMute();
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [isPlaying, isMuted, isEmbed]);

  const getEmbedUrl = (url: string, type: string) => {
    try {
      if (type === 'YouTube' || url.includes('youtube.com')) {
        const id = url.includes('v=') ? url.split('v=')[1].split('&')[0] : url.split('/').pop();
        return `https://www.youtube.com/embed/${id}?autoplay=1&mute=0&controls=1`;
      }
      if (type === 'Vimeo' || url.includes('vimeo.com')) {
        const id = url.split('/').pop();
        return `https://player.vimeo.com/video/${id}?autoplay=1`;
      }
    } catch (e) { return url; }
    return url;
  };

  if (isEmbed) {
    return (
      <div className="w-full h-full bg-black">
        <iframe
          className="w-full h-full border-0"
          src={getEmbedUrl(source.url, source.type)}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full group bg-black flex items-center justify-center overflow-hidden select-none"
      onMouseMove={resetControlsTimeout}
      onClick={togglePlay}
    >
      {!isLoaded && !error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white">
          <div className="w-20 h-20 bg-gold-cream rounded-[2.5rem] border border-gold/10 flex items-center justify-center mb-4 shadow-xl">
            <Loader2 className="animate-spin text-burgundy" size={32} />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gold animate-pulse">Securing Feed</p>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white px-12 text-center">
          <div className="w-24 h-24 bg-red-50 rounded-[2.5rem] flex items-center justify-center mb-8 border border-red-100 shadow-sm">
            <VideoOff className="text-red-500" size={48} />
          </div>
          <p className="text-2xl font-black text-[#0d1a14] mb-2 tracking-tight uppercase leading-none">Signal Lost</p>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed max-w-xs mx-auto">{error}</p>
          <button
            onClick={(e) => { e.stopPropagation(); window.location.reload(); }}
            className="mt-10 px-8 py-4 bg-burgundy text-gold rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-burgundy/20 hover:bg-burgundy-dark transition-all active:scale-95 border-b-4 border-gold/40"
          >
            Re-Initialize Handshake
          </button>
        </div>
      )}

      <video
        ref={videoRef}
        src={source.url}
        className="w-full h-full object-contain"
        onCanPlay={() => setIsLoaded(true)}
        onError={() => setError("The source endpoint could not be decrypted or is offline.")}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        playsInline
      />

      {/* Custom Controls Bar */}
      <div className={`
        absolute bottom-0 left-0 right-0 p-4 lg:p-8 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-30 transition-all duration-500
        ${showControls ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}
      `} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-4 md:gap-8">
            <button
              onClick={togglePlay}
              className="w-11 h-11 md:w-14 md:h-14 rounded-full bg-gold text-burgundy flex items-center justify-center shadow-xl hover:scale-110 transition-transform active:scale-95 group/play"
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
            </button>

            {/* Volume Control */}
            <div className="flex items-center gap-3 bg-white/10 px-4 py-2.5 md:py-3.5 rounded-2xl backdrop-blur-md border border-white/5">
              <button onClick={toggleMute} className="text-white hover:text-gold transition-colors" title="Mute (M)">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range" min="0" max="1" step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 md:w-24 accent-gold cursor-pointer"
              />
            </div>
          </div>

          <button
            onClick={toggleFullscreen}
            className="w-11 h-11 md:w-12 md:h-12 rounded-xl bg-white/5 text-white hover:bg-gold hover:text-burgundy flex items-center justify-center transition-all shadow-sm border border-white/5"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
