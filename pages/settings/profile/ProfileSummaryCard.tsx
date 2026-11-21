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
    <div className="bg-white rounded-2xl border border-[#e3e9e4] shadow-sm p-5 sm:p-6">
      <div className="flex items-center gap-4 lg:flex-col lg:text-center lg:gap-3">
      <div className="relative shrink-0">
        <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full bg-[#edf3ed] border-2 border-white shadow-sm overflow-hidden flex items-center justify-center text-[#1d4934]">
          {avatarUrl ? (
            <img src={avatarUrl} alt="Your profile photo" className="w-full h-full object-cover" />
          ) : (
            <User className="w-10 h-10" strokeWidth={1.5} />
          )}
        </div>
        <label
          className="absolute -bottom-1 -right-1 bg-[#173b2a] text-[#f3d68a] p-2 rounded-full border-2 border-white shadow cursor-pointer hover:brightness-110 focus-within:ring-2 focus-within:ring-gold"
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
      <div className="min-w-0 flex-1 lg:w-full">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8a6a2e] mb-1">Profile</p>
        <h2 className="text-lg font-bold text-[#102d20] tracking-tight break-words">{fullName || 'Your name'}</h2>
        {jobTitle ? <p className="text-sm text-slate-600 mt-1 break-words">{jobTitle}</p> : null}
      </div>
      </div>

      <dl className="mt-5 pt-4 border-t border-[#e8ede8] space-y-3 text-left">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs font-bold text-gray-600 uppercase tracking-wide">Role</dt>
          <dd className="text-xs font-black text-burgundy bg-burgundy/5 px-2.5 py-1 rounded-lg border border-burgundy/10">
            {roleLabel}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-xs font-bold text-gray-600 uppercase tracking-wide">2-step sign-in</dt>
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
