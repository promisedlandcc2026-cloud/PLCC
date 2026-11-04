import React from 'react';
import { ChevronRight, Fingerprint, Key, Lock, Smartphone, type LucideIcon } from 'lucide-react';
import { FieldLabel, IconInput, MIN_PASSWORD_LENGTH, SectionCard, StatusPill } from './ui';
import type { SecurityPanel } from './useAccountSecurity';

type Props = {
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  passwordError: string | null;
  mfaOn: boolean;
  passkeyCount: number;
  onOpen: (panel: SecurityPanel) => void;
  disabled?: boolean;
};

const SecurityTile: React.FC<{
  icon: LucideIcon;
  title: string;
  body: string;
  status: React.ReactNode;
  onClick: () => void;
}> = ({ icon: Icon, title, body, status, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="text-left rounded-xl border border-gray-100 bg-gray-50/80 hover:bg-white hover:border-burgundy/20 p-4 transition-all group"
  >
    <div className="flex items-start justify-between gap-2">
      <div className="w-10 h-10 rounded-lg bg-burgundy/5 text-burgundy flex items-center justify-center mb-3 group-hover:bg-burgundy group-hover:text-gold transition-colors">
        <Icon size={18} />
      </div>
      <ChevronRight size={18} className="text-gray-400 group-hover:text-burgundy shrink-0" />
    </div>
    <h4 className="text-sm font-black text-[#0d1a14]">{title}</h4>
    <p className="text-xs text-gray-600 font-medium mt-1 leading-snug">{body}</p>
    <div className="mt-3">{status}</div>
  </button>
);

const SecuritySection: React.FC<Props> = ({
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  passwordError,
  mfaOn,
  passkeyCount,
  onOpen,
  disabled,
}) => (
  <SectionCard id="profile-security" icon={Lock} iconTone="gold" title="Security" subtitle="Password, 2-step auth, and passkeys">
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <label className="block space-y-1.5">
        <FieldLabel hint="optional">New password</FieldLabel>
        <IconInput
          icon={Key}
          type="password"
          autoComplete="new-password"
          placeholder="Leave blank to keep current"
          value={password}
          disabled={disabled}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {password ? (
        <label className="block space-y-1.5">
          <FieldLabel>Confirm new password</FieldLabel>
          <IconInput
            icon={Key}
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            disabled={disabled}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </label>
      ) : null}
    </div>
    {password ? (
      <p className={`text-[11px] font-medium -mt-2 ${passwordError ? 'text-red-700' : 'text-gray-500'}`}>
        {passwordError || `At least ${MIN_PASSWORD_LENGTH} characters. Applied when you save changes.`}
      </p>
    ) : null}

    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <SecurityTile
        icon={Smartphone}
        title="2-Step Auth"
        body="Authenticator app codes for extra protection."
        status={
          <StatusPill on={mfaOn} size="xs">
            {mfaOn ? 'Connected' : 'Not set up'}
          </StatusPill>
        }
        onClick={() => onOpen('mfa')}
      />
      <SecurityTile
        icon={Fingerprint}
        title="Passkeys"
        body="Face ID, fingerprint, or device key sign-in."
        status={
          <StatusPill on={passkeyCount > 0} size="xs">
            {passkeyCount > 0 ? `${passkeyCount} configured` : 'Not configured'}
          </StatusPill>
        }
        onClick={() => onOpen('passkey')}
      />
    </div>
  </SectionCard>
);

export default SecuritySection;
