import React from 'react';
import {
  Baby,
  ClipboardList,
  Clapperboard,
  DoorOpen,
  HandHeart,
  Heart,
  Landmark,
  Megaphone,
  Music,
  Shield,
  Sparkles,
  Users,
  type LucideProps,
} from 'lucide-react';

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  Baby, ClipboardList, Clapperboard, DoorOpen, HandHeart, Heart, Landmark, Megaphone, Music, Shield, Sparkles, Users,
};

export function DeptIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = ICONS[name] || Users;
  return <Icon aria-hidden {...props} />;
}
