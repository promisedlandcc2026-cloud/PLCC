import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { readMemberEffectsOff, writeMemberEffectsOff } from '../../../lib/seasons';
import { SectionCard } from './ui';

/** Per-device display preferences. These apply instantly — no Save needed. */
const DisplaySection: React.FC<{ userId: string }> = ({ userId }) => {
  const [motionOn, setMotionOn] = useState(() => !readMemberEffectsOff(userId));

  useEffect(() => {
    setMotionOn(!readMemberEffectsOff(userId));
  }, [userId]);

  return (
    <SectionCard id="profile-display" icon={Sparkles} title="Display" subtitle="Applies right away on this device">
      <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 cursor-pointer">
        <span>
          <span className="block text-sm font-black text-[#0d1a14]">Seasonal motion</span>
          <span className="block text-xs text-gray-500 font-medium">
            Leaves, snow, petals, and sparkles on Home. Turn off to keep the header still.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-checked={motionOn}
          className="h-5 w-5 shrink-0 accent-[#1d372c]"
          checked={motionOn}
          onChange={(e) => {
            const on = e.target.checked;
            setMotionOn(on);
            writeMemberEffectsOff(userId, !on);
          }}
        />
      </label>
    </SectionCard>
  );
};

export default DisplaySection;
