import React, { useEffect, useRef } from 'react';
import type { SeasonEffect } from '../../lib/seasons';

const COLORS: Record<Exclude<SeasonEffect, 'none'>, string[]> = {
  // Bright autumn tones so leaves read on the dark burgundy hero (darker reds disappeared).
  leaves: ['#F59E0B', '#FBBF24', '#F97316', '#EA580C', '#E4C36A', '#FCD34D'],
  snow: ['#FFFFFF', '#F8FAFC', '#E2E8F0'],
  petals: ['#F9A8D4', '#FBCFE8', '#FFFFFF'],
  sparkles: ['#C9A35A', '#FFFFFF', '#FDE68A'],
};

type Particle = {
  x: number;
  y: number;
  r: number;
  vy: number;
  vx: number;
  spin: number;
  angle: number;
  color: string;
};

function spawn(width: number, height: number, colors: string[], effect: SeasonEffect, y?: number): Particle {
  const leaf = effect === 'leaves';
  return {
    x: Math.random() * width,
    y: y ?? Math.random() * height,
    // Leaves are drawn bigger so they read as leaves, not snow.
    r: leaf ? 9 + Math.random() * 6 : 2 + Math.random() * 3.5,
    vy: leaf ? 0.45 + Math.random() * 0.6 : 0.35 + Math.random() * 0.7,
    vx: -0.25 + Math.random() * 0.5,
    spin: leaf ? -0.035 + Math.random() * 0.07 : -0.02 + Math.random() * 0.04,
    angle: Math.random() * Math.PI * 2,
    color: colors[Math.floor(Math.random() * colors.length)] || '#FFFFFF',
  };
}

/**
 * A pointed leaf with a stem and center vein. `flip` (-1..1) squashes it
 * sideways so it looks like it is tumbling as it falls.
 */
function drawLeaf(ctx: CanvasRenderingContext2D, size: number, color: string, flip: number) {
  const len = size * 1.6;
  const wide = size * 0.75 * Math.max(0.25, Math.abs(flip));
  ctx.beginPath();
  ctx.moveTo(0, -len / 2);
  ctx.quadraticCurveTo(wide, -len / 6, 0, len / 2);
  ctx.quadraticCurveTo(-wide, -len / 6, 0, -len / 2);
  ctx.fill();
  // Thin light edge so each leaf stands out from the dark photo wash.
  ctx.strokeStyle = 'rgba(255, 244, 214, 0.55)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(13, 26, 20, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(0, -len / 2 + 1);
  ctx.lineTo(0, len / 2 + size * 0.35);
  ctx.stroke();
  void color;
}

const SeasonParticles: React.FC<{ effect: SeasonEffect }> = ({ effect }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (effect === 'none' || effect === 'leaves') return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const colors = COLORS[effect];
    // macOS Safari follows Reduce Motion and was skipping the canvas entirely.
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    const particles: Particle[] = [];
    let ready = false;

    const box = () => {
      const rect = canvas.getBoundingClientRect();
      const parent = canvas.parentElement?.getBoundingClientRect();
      return {
        width: rect.width || parent?.width || 0,
        height: rect.height || parent?.height || 0,
      };
    };

    const resize = () => {
      const { width, height } = box();
      // Safari can report 0×0 on the first layout pass for an absolute canvas.
      if (width < 8 || height < 8) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ready) {
        const count = effect === 'leaves' ? 22 : 20;
        for (let i = 0; i < count; i += 1) particles.push(spawn(width, height, colors, effect));
        ready = true;
      }
    };

    const paint = (animate: boolean) => {
      const { width, height } = box();
      if (!ready || width < 8 || height < 8) return;
      ctx.clearRect(0, 0, width, height);
      for (const particle of particles) {
        if (animate) {
          particle.y += particle.vy;
          particle.x += particle.vx + Math.sin(particle.angle) * 0.15;
          particle.angle += particle.spin;
          if (particle.y > height + 14) {
            Object.assign(particle, spawn(width, height, colors, effect, -14));
          }
        }
        ctx.save();
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.angle);
        ctx.fillStyle = particle.color;
        ctx.globalAlpha =
          effect === 'sparkles'
            ? 0.45 + Math.abs(Math.sin(frame / 12 + particle.angle)) * 0.55
            : effect === 'leaves'
              ? 0.95
              : 0.85;
        if (effect === 'snow' || effect === 'sparkles') {
          ctx.beginPath();
          ctx.arc(0, 0, particle.r * (effect === 'sparkles' ? 0.7 : 1), 0, Math.PI * 2);
          ctx.fill();
        } else if (effect === 'leaves') {
          drawLeaf(ctx, particle.r, particle.color, Math.cos(frame / 40 + particle.angle * 3));
        } else {
          ctx.beginPath();
          ctx.ellipse(0, 0, particle.r, particle.r * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      frame += 1;
    };

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion && ready) paint(false);
    });
    observer.observe(canvas);
    if (canvas.parentElement) observer.observe(canvas.parentElement);

    let raf = 0;
    const loop = () => {
      if (!ready) resize();
      if (ready) paint(true);
      raf = window.requestAnimationFrame(loop);
    };
    if (reduceMotion) {
      if (ready) paint(false);
    } else {
      raf = window.requestAnimationFrame(loop);
    }
    return () => {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [effect]);

  if (effect === 'none') return null;
  if (effect === 'leaves') {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[30] overflow-hidden"
        data-season-leaves="true"
      >
        {Array.from({ length: 16 }, (_, i) => (
          <span
            key={i}
            className="awc-falling-leaf"
            style={{
              left: `${(i * 6.4) % 96}%`,
              fontSize: `${20 + (i % 4) * 8}px`,
              animationDelay: `${-(i * 0.7)}s`,
              animationDuration: `${9 + (i % 5) * 1.6}s`,
              ...(reduceMotion ? { top: `${6 + ((i * 17) % 72)}%`, animation: 'none' } : null),
            }}
          >
            {i % 3 === 0 ? '🍁' : '🍂'}
          </span>
        ))}
      </div>
    );
  }
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[30] h-full w-full"
    />
  );
};

export default SeasonParticles;
