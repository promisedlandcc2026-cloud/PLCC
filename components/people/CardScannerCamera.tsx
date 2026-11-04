/**
 * Local QR camera for staff card scanner / Kids Kiosk.
 * Uses @yudiel/react-qr-scanner (browser MediaDevices + local decode).
 * Camera mounts only after explicit Start Camera (required for reliable iPad decode).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import { useScreenWakeLock } from '../../lib/useScreenWakeLock';

type Props = {
  active: boolean;
  paused: boolean;
  onStart: () => void;
  onStop: () => void;
  onDecode: (rawValue: string) => void;
  disabled?: boolean;
  /** light = staff pages; kiosk = dark Kids Kiosk chrome */
  variant?: 'light' | 'kiosk';
  /** Overlay hint when camera is live */
  hint?: string;
};

const CAMERA_UNAVAILABLE_COPY =
  'Camera access is unavailable. You can enter the card code manually.';

export default function CardScannerCamera({
  active,
  paused,
  onStart,
  onStop,
  onDecode,
  disabled = false,
  variant = 'light',
  hint = 'Hold the PLCC digital card QR in the frame',
}: Props) {
  const [cameraError, setCameraError] = useState<string | null>(null);
  const isKiosk = variant === 'kiosk';

  useScreenWakeLock(active && !cameraError);

  useEffect(() => {
    if (!active) setCameraError(null);
  }, [active]);

  const handleScan = useCallback(
    (detected: { rawValue?: string }[]) => {
      if (paused || disabled) return;
      const value = detected?.[0]?.rawValue;
      if (typeof value !== 'string' || !value) return;
      onDecode(value);
    },
    [disabled, onDecode, paused]
  );

  return (
    <section
      className={
        isKiosk
          ? 'rounded-3xl border border-white/10 bg-black overflow-hidden shadow-2xl h-full min-h-[280px] flex flex-col'
          : 'rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm'
      }
      aria-label="QR camera"
    >
      <div
        className={
          isKiosk
            ? 'px-4 py-3 border-b border-white/10 flex flex-wrap items-center justify-between gap-3'
            : 'px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3'
        }
      >
        <div className="min-w-0">
          <p className={isKiosk ? 'text-sm font-bold text-white' : 'text-sm font-bold text-gray-900'}>
            Camera
          </p>
          <p
            className={
              isKiosk
                ? 'text-xs text-white/55 mt-0.5 leading-relaxed'
                : 'text-xs text-gray-500 mt-0.5 leading-relaxed'
            }
          >
            Tap Start Camera, then hold the QR in the frame. Scanning runs on this device.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {!active ? (
            <button
              type="button"
              onClick={() => {
                setCameraError(null);
                onStart();
              }}
              disabled={disabled}
              className={
                isKiosk
                  ? 'min-h-[48px] px-4 rounded-xl bg-gold text-[#0d1a14] font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50'
                  : 'min-h-[48px] px-4 rounded-xl bg-[#0d1a14] text-gold font-bold text-sm inline-flex items-center gap-2 disabled:opacity-50'
              }
            >
              <Camera size={18} aria-hidden />
              Start Camera
            </button>
          ) : (
            <button
              type="button"
              onClick={onStop}
              className={
                isKiosk
                  ? 'min-h-[48px] px-4 rounded-xl bg-white/10 text-white font-bold text-sm inline-flex items-center gap-2 border border-white/15'
                  : 'min-h-[48px] px-4 rounded-xl bg-gray-100 text-gray-800 font-bold text-sm inline-flex items-center gap-2 border border-gray-200'
              }
            >
              <CameraOff size={18} aria-hidden />
              Stop Camera
            </button>
          )}
        </div>
      </div>

      <div
        className={
          isKiosk
            ? 'relative bg-black flex-1 min-h-[240px] w-full'
            : 'relative bg-black aspect-[4/3] max-h-[420px] w-full'
        }
      >
        {active && !cameraError ? (
          <Scanner
            onScan={handleScan}
            onError={() => {
              setCameraError(CAMERA_UNAVAILABLE_COPY);
              onStop();
            }}
            paused={paused}
            sound={false}
            scanDelay={900}
            constraints={{ facingMode: { ideal: 'environment' } }}
            styles={{
              container: { width: '100%', height: '100%' },
              video: { objectFit: 'cover', width: '100%', height: '100%' },
            }}
            components={{ finder: true, torch: true }}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-[#1a0010]">
            <CameraOff size={36} className="text-white/35" aria-hidden />
            <p className="text-white/80 text-sm font-semibold max-w-sm leading-relaxed">
              {cameraError || 'Camera is off. Tap Start Camera when you are ready to scan.'}
            </p>
          </div>
        )}

        {active && !cameraError && !paused && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gold/20 text-gold flex items-center justify-center shrink-0">
                <ScanLine size={20} aria-hidden />
              </div>
              <p className="text-white text-sm font-bold">{hint}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
