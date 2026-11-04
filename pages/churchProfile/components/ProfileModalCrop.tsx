import React, { useState, useRef, useEffect } from 'react';
import { Camera, ZoomIn, ZoomOut, RotateCw, Check, X, Image as ImageIcon } from 'lucide-react';
import { useChurch } from '../context/ChurchContext';
import { PASTOR_AVATAR, KEISHA_AVATAR } from '../data/initialData';

export const ProfileModalCrop: React.FC = () => {
  const { isCropAvatarOpen, setIsCropAvatarOpen, selectedMember, updateMemberAvatar } = useChurch();
  const [imageSrc, setImageSrc] = useState<string>(selectedMember.avatarUrl || PASTOR_AVATAR);
  const [zoom, setZoom] = useState<number>(1.2);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (selectedMember.avatarUrl) {
      setImageSrc(selectedMember.avatarUrl);
    }
  }, [selectedMember]);

  if (!isCropAvatarOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageSrc(reader.result);
          setZoom(1.1);
          setPanX(0);
          setPanY(0);
          setRotation(0);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleApplyCrop = () => {
    setIsProcessing(true);
    const canvas = canvasRef.current;
    if (!canvas) {
      setIsProcessing(false);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const size = 320;
      canvas.width = size;
      canvas.height = size;

      ctx.clearRect(0, 0, size, size);

      // Clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Transform and draw
      ctx.translate(size / 2 + panX, size / 2 + panY);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.scale(zoom, zoom);

      // Center image
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();

      try {
        const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
        updateMemberAvatar(selectedMember.id, croppedDataUrl);
      } catch (err) {
        // In case of any cross-origin canvas security flag, fallback to direct src
        console.warn('Canvas export note:', err);
        updateMemberAvatar(selectedMember.id, imageSrc);
      }

      setIsProcessing(false);
      setIsCropAvatarOpen(false);
    };

    img.onerror = () => {
      updateMemberAvatar(selectedMember.id, imageSrc);
      setIsProcessing(false);
      setIsCropAvatarOpen(false);
    };

    img.src = imageSrc;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-stone-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div>
            <h3 className="font-semibold text-lg text-stone-900">Crop Profile Photo</h3>
            <p className="text-xs text-stone-500">
              For {selectedMember.fullName} &middot; Church Directory
            </p>
          </div>
          <button
            onClick={() => setIsCropAvatarOpen(false)}
            className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Crop Stencil Area */}
        <div className="p-6 space-y-5">
          <div className="relative w-full h-72 bg-stone-900 rounded-xl overflow-hidden flex items-center justify-center">
            {/* Image Preview with Pan and Zoom */}
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                transform: `translate(${panX}px, ${panY}px) scale(${zoom}) rotate(${rotation}deg)`,
                transition: 'transform 0.05s ease-out',
              }}
            >
              {imageSrc ? (
                <img
                  src={imageSrc}
                  alt="Crop preview"
                  className="max-w-none w-80 h-80 object-cover"
                />
              ) : (
                <div className="text-stone-500 text-sm flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8" />
                  <span>No image selected</span>
                </div>
              )}
            </div>

            {/* Circular Mask / Vignette overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-56 rounded-full border-2 border-[#C9A35A] shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] ring-2 ring-white/30" />
            </div>

            <div className="absolute bottom-3 left-3 bg-black/70 text-[11px] text-[#E8D8B2] px-2.5 py-1 rounded-md backdrop-blur-xs">
              Circular directory preview
            </div>
          </div>

          {/* Controls: Zoom & Pan */}
          <div className="space-y-3 bg-stone-50 p-4 rounded-xl border border-stone-200/80">
            <div className="flex items-center justify-between text-xs font-medium text-stone-700">
              <span className="flex items-center gap-1.5">
                <ZoomIn className="w-3.5 h-3.5 text-stone-500" />
                Zoom Level
              </span>
              <span className="font-mono text-stone-500 tabular-nums">
                {Math.round(zoom * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ZoomOut className="w-4 h-4 text-stone-400" />
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-full accent-[#1d372c] cursor-pointer"
              />
              <ZoomIn className="w-4 h-4 text-stone-400" />
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <label className="text-[11px] font-medium text-stone-500 flex justify-between">
                  <span>Horizontal Pan</span>
                  <span className="font-mono tabular-nums">{panX}px</span>
                </label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={panX}
                  onChange={(e) => setPanX(parseInt(e.target.value))}
                  className="w-full accent-[#1d372c] cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-stone-500 flex justify-between">
                  <span>Vertical Pan</span>
                  <span className="font-mono tabular-nums">{panY}px</span>
                </label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={panY}
                  onChange={(e) => setPanY(parseInt(e.target.value))}
                  className="w-full accent-[#1d372c] cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 90) % 360)}
                className="text-xs text-stone-600 hover:text-stone-900 flex items-center gap-1 px-2.5 py-1 rounded bg-white border border-stone-200"
              >
                <RotateCw className="w-3 h-3" />
                Rotate 90°
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1.2);
                  setPanX(0);
                  setPanY(0);
                  setRotation(0);
                }}
                className="text-xs text-stone-500 hover:text-stone-800 underline"
              >
                Reset Position
              </button>
            </div>
          </div>

          {/* Quick presets or upload button */}
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">Sample Photos:</span>
              <button
                type="button"
                onClick={() => {
                  setImageSrc(PASTOR_AVATAR);
                  setZoom(1.2);
                  setPanX(0);
                  setPanY(0);
                }}
                className="px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-700"
              >
                Pastor Marcus
              </button>
              <button
                type="button"
                onClick={() => {
                  setImageSrc(KEISHA_AVATAR);
                  setZoom(1.2);
                  setPanX(0);
                  setPanY(0);
                }}
                className="px-2 py-1 rounded bg-stone-100 hover:bg-stone-200 text-stone-700"
              >
                Sister Keisha
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 text-xs font-medium text-[#1d372c] hover:text-[#12231c] underline"
            >
              <Camera className="w-3.5 h-3.5" />
              Upload New File
            </button>
          </div>
        </div>

        {/* Hidden Canvas used for cropping render */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsCropAvatarOpen(false)}
            className="px-4 py-2 text-xs font-medium text-stone-600 hover:text-stone-900 rounded-lg hover:bg-stone-100 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApplyCrop}
            disabled={isProcessing}
            className="px-5 py-2 text-xs font-semibold text-white bg-[#1d372c] hover:bg-[#12231c] rounded-lg shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {isProcessing ? 'Saving...' : 'Save Cropped Photo'}
          </button>
        </div>
      </div>
    </div>
  );
};
