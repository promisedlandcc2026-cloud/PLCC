import React, { useState } from 'react';
import { X, Image as ImageIcon, Check, Sparkles, Upload, RefreshCw } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { SANCTUARY_BANNER } from '../data/initialData';

interface EditCoverBannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  currentCoverUrl?: string;
}

const PRESET_BANNERS = [
  {
    id: 'sanctuary_default',
    title: 'PLCC Sanctuary Altar',
    description: 'Promised Land Christian Center main sanctuary and worship platform.',
    url: SANCTUARY_BANNER,
  },
  {
    id: 'worship_praise',
    title: 'Sunday Praise & Worship',
    description: 'Atmosphere of corporate adoration and praise.',
    url: 'https://images.unsplash.com/photo-1510525004066-9dc9f4007812?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'stained_glass',
    title: 'Cathedral Stained Glass',
    description: 'Golden morning light filtering through sacred stained glass.',
    url: 'https://images.unsplash.com/photo-1548625361-12792e35a109?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'communion_candles',
    title: 'Candlelight & Scripture',
    description: 'Warm reverent candlelight and prayer sanctuary.',
    url: 'https://images.unsplash.com/photo-1519817650390-64a93db51149?q=80&w=1200&auto=format&fit=crop',
  },
  {
    id: 'modern_chapel',
    title: 'Sanctuary Fellowship Hall',
    description: 'Warm architectural church nave and gathering hall.',
    url: 'https://images.unsplash.com/photo-1438032005730-c779502df39b?q=80&w=1200&auto=format&fit=crop',
  },
];

export const EditCoverBannerModal: React.FC<EditCoverBannerModalProps> = ({
  isOpen,
  onClose,
  memberId,
  currentCoverUrl,
}) => {
  const { updateMemberCover } = useChurch();

  const [selectedUrl, setSelectedUrl] = useState<string>(currentCoverUrl || SANCTUARY_BANNER);
  const [customUrl, setCustomUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'presets' | 'custom'>('presets');

  if (!isOpen) return null;

  const handleApply = () => {
    const finalUrl = activeTab === 'custom' && customUrl.trim() ? customUrl.trim() : selectedUrl;
    updateMemberCover(memberId, finalUrl);
    onClose();
  };

  const handleResetToDefault = () => {
    setSelectedUrl(SANCTUARY_BANNER);
    setCustomUrl('');
    updateMemberCover(memberId, SANCTUARY_BANNER);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#EEF3EF] text-[#1d372c] flex items-center justify-center">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-stone-900 text-sm">
                Edit Profile Cover Banner
              </h3>
              <p className="text-[11px] text-stone-500">
                Personalize the header background for this profile view
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Live Preview */}
          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-2">
              Banner Live Preview
            </label>
            <div className="relative h-36 w-full rounded-xl overflow-hidden bg-stone-900 border border-stone-200 shadow-inner">
              <img
                src={activeTab === 'custom' && customUrl.trim() ? customUrl : selectedUrl}
                alt="Banner Preview"
                className="w-full h-full object-cover opacity-85"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] text-[#E8D8B2] border border-[#C9A35A]/30">
                PLCC Vault &middot; Promised Land Christian Center
              </div>
              <div className="absolute bottom-3 left-4 text-white text-xs">
                <span className="font-sans italic">&ldquo;Where Everybody is Somebody&rdquo;</span>
              </div>
            </div>
          </div>

          {/* Tab buttons */}
          <div className="flex items-center gap-2 border-b border-stone-200 pb-2">
            <button
              onClick={() => setActiveTab('presets')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'presets'
                  ? 'bg-[#1d372c] text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sanctuary Presets</span>
            </button>

            <button
              onClick={() => setActiveTab('custom')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                activeTab === 'custom'
                  ? 'bg-[#1d372c] text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Custom Photo URL</span>
            </button>
          </div>

          {/* Presets Grid */}
          {activeTab === 'presets' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PRESET_BANNERS.map((preset) => {
                const isSelected = selectedUrl === preset.url;
                return (
                  <div
                    key={preset.id}
                    onClick={() => setSelectedUrl(preset.url)}
                    className={`group cursor-pointer rounded-xl border overflow-hidden transition-all ${
                      isSelected
                        ? 'border-[#1d372c] ring-2 ring-[#1d372c]/30 shadow-xs'
                        : 'border-stone-200 hover:border-stone-300 hover:shadow-2xs'
                    }`}
                  >
                    <div className="relative h-24 w-full bg-stone-900 overflow-hidden">
                      <img
                        src={preset.url}
                        alt={preset.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        referrerPolicy="no-referrer"
                      />
                      {isSelected && (
                        <div className="absolute top-2 right-2 bg-[#1d372c] text-white p-1 rounded-full shadow-md">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 bg-white">
                      <p className="text-xs font-bold text-stone-900">{preset.title}</p>
                      <p className="text-[10px] text-stone-500 line-clamp-1">{preset.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Direct Image URL
                </label>
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://example.com/church-worship-banner.jpg"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 focus:outline-none focus:ring-2 focus:ring-[#1d372c]"
                />
                <p className="text-[11px] text-stone-400 mt-1">
                  Paste any high-resolution HTTPS image URL (recommended 1200 &times; 400px).
                </p>
              </div>

              {customUrl && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedUrl(customUrl)}
                    className="text-xs text-[#1d372c] font-semibold hover:underline flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> Test and preview this URL
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-stone-100 flex items-center justify-between bg-stone-50/50">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="text-xs text-stone-500 hover:text-stone-800 flex items-center gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reset to PLCC Sanctuary Default</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Cover Banner</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
