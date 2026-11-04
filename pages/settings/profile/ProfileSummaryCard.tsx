import React, { useRef, useState } from 'react';
import { Camera, Loader2, User } from 'lucide-react';
import { prepareFeedImageFile } from '../../../lib/feedImagePrepare';
import { StatusPill, errorMessage } from './ui';

/** Profile photos are small circles; keep the stored data URL light. */
const AVATAR_MAX_EDGE = 400;

type Props = {
  fullName: string;
  jobTitle: string;
  avatarUrl: string;
  roleLabel: string;
  mfaOn: boolean;
  passkeyCount: number;
  onAvatarChange: (dataUrl: string) => void;
  onAvatarError: (message: string) => void;
  footer?: React.ReactNode;
};

const ProfileSummaryCard: React.FC<Props> = ({
  fullName,
  jobTitle,
  avatarUrl,
  roleLabel,
  mfaOn,
  passkeyCount,
  onAvatarChange,
  onAvatarError,
  footer,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setProcessing(true);
    try {
      const prepared = await prepareFeedImageFile(file, { maxEdge: AVATAR_MAX_EDGE });
      onAvatarChange(prepared.previewUrl);
    } catch (err) {
      onAvatarError(errorMessage(err, 'Could not use that photo.'));
    } finally {
      setProcessing(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
      <div className="relative inline-block mb-4">
        <div className="w-24 h-24 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center text-burgundy">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Your profile photo" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10" strokeWidth={1.5} />
          )}
        </div>
        <label
          className="absolute -bottom-1 -right-1 bg-burgundy text-gold p-2 rounded-xl border-2 border-white shadow cursor-pointer hover:brightness-110 focus-within:ring-2 focus-within:ring-gold"
          title="Change photo"
        >
          {processing ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          <span className="sr-only">Change profile photo</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={processing}
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
        </label>
      </div>

      <h2 className="text-lg font-black text-[#0d1a14] tracking-tight truncate">{fullName || 'Your name'}</h2>
      <p className="text-xs font-bold text-[#8A6A2E] uppercase tracking-widest mt-1 truncate">{jobTitle || 'Title'}</p>

      <dl className="mt-5 pt-5 border-t border-gray-100 space-y-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs font-bold text-gray-600 uppercase tracking-wide">Role</dt>
          <dd className="text-xs font-black text-burgundy bg-burgundy/5 px-2.5 py-1 rounded-lg border border-burgundy/10">
            {roleLabel}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs font-bold text-gray-600 uppercase tracking-wide">2-Step</dt>
          <dd>
            <StatusPill on={mfaOn}>{mfaOn ? 'On' : 'Off'}</StatusPill>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs font-bold text-gray-600 uppercase tracking-wide">Passkeys</dt>
          <dd>
            <StatusPill on={passkeyCount > 0}>{passkeyCount > 0 ? passkeyCount : 'None'}</StatusPill>
          </dd>
        </div>
      </dl>

      {footer}
    </div>
  );
};

export default ProfileSummaryCard;
