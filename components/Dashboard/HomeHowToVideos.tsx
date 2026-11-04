import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Clapperboard, Play, ChevronRight, AlertCircle } from 'lucide-react';

export type HomeHowToVideo = {
  id: string;
  title: string;
  description?: string | null;
  video_url?: string;
  thumbnail_url?: string | null;
};

type Props = {
  videos: HomeHowToVideo[];
  loading?: boolean;
};

const HomeHowToVideos: React.FC<Props> = ({ videos, loading }) => {
  const navigate = useNavigate();
  const list = videos.slice(0, 3);
  const openLibrary = () => navigate('/help/how-to-videos');

  if (loading) {
    return (
      <div className="bg-white rounded-[2rem] border border-burgundy/10 shadow-sm overflow-hidden animate-pulse">
        <div className="bg-burgundy/80 h-[88px]" />
        <div className="p-4 space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-gray-50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[2rem] border border-burgundy/10 shadow-sm overflow-hidden">
      <div className="bg-burgundy p-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-gold shrink-0">
            <Clapperboard size={20} />
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-white text-sm tracking-tight">HOW TO VIDEOS</h3>
            <p className="text-[10px] font-bold text-gold/60 uppercase tracking-widest">
              Vault walkthroughs
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={openLibrary}
          className="px-3 py-1 bg-gold text-burgundy text-[10px] font-black rounded-lg shadow-lg shrink-0 hover:bg-white transition-colors"
        >
          {videos.length > 0 ? `${videos.length} VIDEO${videos.length === 1 ? '' : 'S'}` : 'LIBRARY'}
        </button>
      </div>

      <div className="p-4 space-y-3">
        {list.length === 0 ? (
          <button
            type="button"
            onClick={openLibrary}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-dashed border-gray-200 hover:border-burgundy/20 hover:bg-gray-50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0">
              <Play size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-[#0d1a14] text-sm">Open the how-to library</h4>
              <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase tracking-widest">
                Watch or add walkthroughs
              </p>
            </div>
            <ChevronRight
              size={16}
              className="text-gray-300 group-hover:text-burgundy transition-colors shrink-0"
            />
          </button>
        ) : (
          list.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => navigate(`/help/how-to-videos?v=${encodeURIComponent(v.id)}`)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-gray-50 transition-all border border-transparent hover:border-burgundy/5 group text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-burgundy/5 text-burgundy flex items-center justify-center shrink-0 overflow-hidden group-hover:scale-110 transition-transform">
                {v.thumbnail_url ? (
                  <img src={v.thumbnail_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Play size={18} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-[#0d1a14] text-sm truncate">{v.title}</h4>
                <div className="flex items-center gap-2 mt-1 min-w-0">
                  <span className="text-[9px] font-black text-gold uppercase tracking-tighter bg-gold/5 px-2 rounded-md shrink-0">
                    Guide
                  </span>
                  <span className="text-[9px] font-bold text-gray-400 truncate">
                    {v.description?.trim() || 'Watch in library'}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-gray-300 group-hover:text-burgundy transition-colors shrink-0"
              />
            </button>
          ))
        )}

        {videos.length > 3 && (
          <button
            type="button"
            onClick={openLibrary}
            className="w-full py-3 text-center text-[10px] font-black text-burgundy/40 uppercase tracking-widest hover:text-burgundy transition-colors"
          >
            See all videos (+{videos.length - 3})
          </button>
        )}
      </div>

      <div className="px-6 py-4 bg-gray-50/50 border-t border-gray-50 flex items-center gap-2">
        <AlertCircle size={12} className="text-burgundy/40 shrink-0" />
        <p className="text-[9px] font-bold text-gray-400">
          Short Vault walkthroughs. Open the library to watch the full set.
        </p>
      </div>
    </div>
  );
};

export default HomeHowToVideos;
