import React from 'react';

interface AvatarDisplayProps {
  name: string;
  avatarUrl?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  className?: string;
  showOnlineStatus?: boolean;
  isOnline?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
  '2xl': 'w-28 h-28 text-2xl',
  '3xl': 'w-36 h-36 text-3xl md:w-40 md:h-40 md:text-4xl',
};

const badgePositions = {
  xs: '-bottom-0.5 -right-0.5 w-2 h-2',
  sm: '-bottom-0.5 -right-0.5 w-2.5 h-2.5',
  md: 'bottom-0 right-0 w-3 h-3',
  lg: 'bottom-0.5 right-0.5 w-3.5 h-3.5',
  xl: 'bottom-1 right-1 w-4 h-4',
  '2xl': 'bottom-1.5 right-1.5 w-5 h-5',
  '3xl': 'bottom-2 right-2 w-6 h-6 md:bottom-2.5 md:right-2.5 md:w-7 md:h-7',
};

export const AvatarDisplay: React.FC<AvatarDisplayProps> = ({
  name,
  avatarUrl,
  size = 'md',
  className = '',
  showOnlineStatus = false,
  isOnline = false,
}) => {
  const getInitials = (n: string) => {
    const label = String(n || '').trim();
    if (!label) return 'PLCC';
    const parts = label.replace(/^(Pastor|Sister|Brother|Deacon|Deaconess|Elder|Lady)\s+/i, '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'PLCC';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const initials = getInitials(name);
  const badgeStyle = badgePositions[size];

  return (
    <div className={`relative inline-block shrink-0 ${className}`}>
      <div
        className={`${sizeClasses[size]} rounded-full overflow-hidden flex items-center justify-center font-semibold border-2 border-stone-200/80 shadow-sm bg-gradient-to-br from-[#12231c] to-[#0d1a14] text-[#E8D8B2] select-none`}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            onError={(e) => {
              // Graceful fallback to initials if image URL fails
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <span className="tracking-wide">{initials}</span>
        )}
      </div>

      {showOnlineStatus && (
        <span
          className={`absolute ${badgeStyle} flex items-center justify-center`}
          title={isOnline ? `${name} is online & active in fellowship` : `${name} is currently offline`}
        >
          {isOnline ? (
            <>
              {/* Subtle green pulse radar ping effect */}
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              {/* Solid vibrant green core with crisp white ring */}
              <span className="relative inline-flex w-full h-full rounded-full bg-emerald-500 border-2 border-white shadow-xs" />
            </>
          ) : (
            /* Subtle offline stone dot */
            <span className="inline-flex w-full h-full rounded-full bg-stone-300 border-2 border-white shadow-2xs" />
          )}
        </span>
      )}
    </div>
  );
};
