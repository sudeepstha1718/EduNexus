import React, { useEffect, useRef, useState } from 'react';
import { BackgroundStyle } from '../types';

export const CURATED_WALLPAPERS = [
  {
    id: 'sonoma-light',
    name: 'Sonoma Daylight Wave',
    category: 'Abstract 3D',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=2000&q=85',
    lightPreview: 'from-blue-400 via-indigo-300 to-amber-200',
  },
  {
    id: 'iridescent-fluid',
    name: 'Prismatic Silk Glass',
    category: 'Modern Glass',
    url: 'https://images.unsplash.com/photo-1634017839464-5c339ebe3cb4?auto=format&fit=crop&w=2000&q=85',
    lightPreview: 'from-purple-300 via-pink-300 to-sky-300',
  },
  {
    id: 'nordic-mist',
    name: 'Nordic Horizon Mist',
    category: 'Landscape',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2000&q=85',
    lightPreview: 'from-sky-200 via-slate-200 to-emerald-200',
  },
  {
    id: 'minimal-arch',
    name: 'Architectural Daylight',
    category: 'Minimalist',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=2000&q=85',
    lightPreview: 'from-slate-100 via-blue-100 to-indigo-100',
  },
  {
    id: 'cyber-dark',
    name: 'Cyber Horizon Neon',
    category: 'Dark Cyber',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=2000&q=85',
    lightPreview: 'from-indigo-950 via-slate-900 to-black',
  },
];

export interface BackgroundSettings {
  style: BackgroundStyle;
  wallpaperUrl: string;
  intensity: number; // 0.2 to 1.0
  particles: boolean;
}

export const getStoredBackgroundSettings = (): BackgroundSettings => {
  try {
    const savedStyle = localStorage.getItem('scholarboard_bg_style') as BackgroundStyle;
    const savedUrl = localStorage.getItem('scholarboard_bg_wallpaper_url');
    const savedIntensity = localStorage.getItem('scholarboard_bg_intensity');
    const savedParticles = localStorage.getItem('scholarboard_bg_particles');

    const validStyles: BackgroundStyle[] = [
      'aurora',
      'blueprint',
      'silk',
      'wallpaper',
      'matrix',
      'minimal',
    ];

    return {
      style: validStyles.includes(savedStyle) ? savedStyle : 'aurora',
      wallpaperUrl: savedUrl || CURATED_WALLPAPERS[0].url,
      intensity: savedIntensity ? parseFloat(savedIntensity) : 0.85,
      particles: savedParticles !== null ? savedParticles === 'true' : false,
    };
  } catch {
    return {
      style: 'aurora',
      wallpaperUrl: CURATED_WALLPAPERS[0].url,
      intensity: 0.85,
      particles: false,
    };
  }
};

export const setStoredBackgroundSettings = (settings: Partial<BackgroundSettings>) => {
  try {
    const current = getStoredBackgroundSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem('scholarboard_bg_style', updated.style);
    localStorage.setItem('scholarboard_bg_wallpaper_url', updated.wallpaperUrl);
    localStorage.setItem('scholarboard_bg_intensity', updated.intensity.toString());
    localStorage.setItem('scholarboard_bg_particles', updated.particles.toString());

    window.dispatchEvent(
      new CustomEvent('scholarboard:bg-settings-change', { detail: updated })
    );
  } catch {
    // fallback
  }
};

// Backwards compatibility helpers
export const getStoredBackgroundStyle = (): BackgroundStyle => getStoredBackgroundSettings().style;
export const setStoredBackgroundStyle = (style: BackgroundStyle) =>
  setStoredBackgroundSettings({ style });

interface AnimatedDotMatrixProps {
  className?: string;
  transparentBg?: boolean;
  styleOverride?: BackgroundStyle;
}

interface ConstellationNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  glowColor: string;
  pulseSpeed: number;
  pulsePhase: number;
}

interface DataPacket {
  fromNode: number;
  toNode: number;
  progress: number;
  speed: number;
  color: string;
}

export const AnimatedDotMatrix: React.FC<AnimatedDotMatrixProps> = ({
  className = '',
  transparentBg = false,
  styleOverride,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [settings, setSettings] = useState<BackgroundSettings>(getStoredBackgroundSettings());

  useEffect(() => {
    if (styleOverride) {
      setSettings((prev) => ({ ...prev, style: styleOverride }));
    }

    const handleSettingsChange = (e: Event) => {
      const customEvent = e as CustomEvent<BackgroundSettings>;
      if (customEvent.detail) {
        setSettings(customEvent.detail);
      }
    };

    window.addEventListener('scholarboard:bg-settings-change', handleSettingsChange);
    return () => {
      window.removeEventListener('scholarboard:bg-settings-change', handleSettingsChange);
    };
  }, [styleOverride]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Mouse coordinates with smooth lerping
    const mouse = {
      x: -2000,
      y: -2000,
      targetX: -2000,
      targetY: -2000,
      radius: 240,
      active: false,
    };

    let nodes: ConstellationNode[] = [];
    const dataPackets: DataPacket[] = [];

    const getIsLight = () => {
      return (
        document.documentElement.getAttribute('data-theme') === 'light' ||
        document.documentElement.classList.contains('light')
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouse.targetX = e.clientX;
      mouse.targetY = e.clientY;
      mouse.active = true;
    };

    const handleMouseLeave = () => {
      mouse.targetX = -2000;
      mouse.targetY = -2000;
      mouse.active = false;
    };

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initNodes();
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    window.addEventListener('resize', handleResize);

    const initNodes = () => {
      const isLight = getIsLight();
      const nodeCount = Math.min(24, Math.max(14, Math.floor(width / 75)));
      nodes = [];

      const colors = isLight
        ? ['#2563eb', '#0284c7', '#4f46e5', '#06b6d4']
        : ['#38bdf8', '#818cf8', '#22d3ee', '#c084fc'];

      for (let i = 0; i < nodeCount; i++) {
        const c = colors[i % colors.length];
        const r = Math.random() * 2.2 + 2.0;
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          radius: r,
          baseRadius: r,
          color: c,
          glowColor: c,
          pulseSpeed: Math.random() * 1.5 + 1.0,
          pulsePhase: Math.random() * Math.PI * 2,
        });
      }
    };

    initNodes();

    let time = 0;
    let lastPacketTime = 0;

    const render = () => {
      time += 0.012;
      const isLight = getIsLight();
      const currentStyle = styleOverride || settings.style;
      const intensity = settings.intensity;

      // Mouse lerping
      mouse.x += (mouse.targetX - mouse.x) * 0.12;
      mouse.y += (mouse.targetY - mouse.y) * 0.12;

      ctx.clearRect(0, 0, width, height);

      // =========================================================
      // 1. BASE BACKGROUND FILL (If not wallpaper)
      // =========================================================
      if (!transparentBg && currentStyle !== 'wallpaper') {
        ctx.fillStyle = isLight ? '#f8fafc' : '#07070b';
        ctx.fillRect(0, 0, width, height);
      }

      // =========================================================
      // 2. STYLE: 'aurora' (Lush Apple Sonoma Ambient Light Mesh)
      // This is the premier light mode experience: rich, vibrant, warm/cool daylight pools
      // =========================================================
      if (currentStyle === 'aurora') {
        // Orb 1: Royal Azure / Cobalt (Top-Left quadrant drift)
        const o1x = width * 0.28 + Math.sin(time * 0.4) * (width * 0.16);
        const o1y = height * 0.30 + Math.cos(time * 0.35) * (height * 0.14);
        const o1r = Math.max(width * 0.55, 650);
        const g1 = ctx.createRadialGradient(o1x, o1y, 0, o1x, o1y, o1r);

        if (isLight) {
          g1.addColorStop(0, `rgba(37, 99, 235, ${0.18 * intensity})`);
          g1.addColorStop(0.45, `rgba(59, 130, 246, ${0.08 * intensity})`);
          g1.addColorStop(1, 'rgba(248, 250, 252, 0)');
        } else {
          g1.addColorStop(0, `rgba(37, 99, 235, ${0.25 * intensity})`);
          g1.addColorStop(0.5, `rgba(124, 58, 237, ${0.10 * intensity})`);
          g1.addColorStop(1, 'rgba(7, 7, 11, 0)');
        }
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, width, height);

        // Orb 2: Electric Cyan / Turquoise (Center-Right quadrant)
        const o2x = width * 0.76 + Math.cos(time * 0.42) * (width * 0.14);
        const o2y = height * 0.44 + Math.sin(time * 0.5) * (height * 0.16);
        const o2r = Math.max(width * 0.50, 600);
        const g2 = ctx.createRadialGradient(o2x, o2y, 0, o2x, o2y, o2r);

        if (isLight) {
          g2.addColorStop(0, `rgba(6, 182, 212, ${0.16 * intensity})`);
          g2.addColorStop(0.5, `rgba(14, 165, 233, ${0.07 * intensity})`);
          g2.addColorStop(1, 'rgba(248, 250, 252, 0)');
        } else {
          g2.addColorStop(0, `rgba(6, 182, 212, ${0.20 * intensity})`);
          g2.addColorStop(0.5, `rgba(56, 189, 248, ${0.08 * intensity})`);
          g2.addColorStop(1, 'rgba(7, 7, 11, 0)');
        }
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, width, height);

        // Orb 3: Warm Sunset Peach / Soft Lavender (Bottom-Center quadrant)
        const o3x = width * 0.52 + Math.sin(time * 0.52) * (width * 0.18);
        const o3y = height * 0.84 + Math.cos(time * 0.45) * (height * 0.15);
        const o3r = Math.max(width * 0.48, 550);
        const g3 = ctx.createRadialGradient(o3x, o3y, 0, o3x, o3y, o3r);

        if (isLight) {
          g3.addColorStop(0, `rgba(168, 85, 247, ${0.14 * intensity})`);
          g3.addColorStop(0.48, `rgba(251, 146, 60, ${0.08 * intensity})`);
          g3.addColorStop(1, 'rgba(248, 250, 252, 0)');
        } else {
          g3.addColorStop(0, `rgba(168, 85, 247, ${0.18 * intensity})`);
          g3.addColorStop(0.5, `rgba(236, 72, 153, ${0.08 * intensity})`);
          g3.addColorStop(1, 'rgba(7, 7, 11, 0)');
        }
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, width, height);

        // Orb 4: Top Center Sunrise Amber highlight
        if (isLight) {
          const o4x = width * 0.5 + Math.cos(time * 0.3) * 100;
          const o4y = height * 0.05 + Math.sin(time * 0.3) * 40;
          const g4 = ctx.createRadialGradient(o4x, o4y, 0, o4x, o4y, width * 0.4);
          g4.addColorStop(0, `rgba(244, 114, 182, ${0.09 * intensity})`);
          g4.addColorStop(0.6, 'rgba(248, 250, 252, 0)');
          ctx.fillStyle = g4;
          ctx.fillRect(0, 0, width, height);
        }

        // Ambient Cursor Spotlight
        if (mouse.active) {
          const mouseG = ctx.createRadialGradient(
            mouse.x,
            mouse.y,
            0,
            mouse.x,
            mouse.y,
            mouse.radius
          );
          if (isLight) {
            mouseG.addColorStop(0, `rgba(37, 99, 235, ${0.12 * intensity})`);
            mouseG.addColorStop(0.5, `rgba(6, 182, 212, ${0.05 * intensity})`);
            mouseG.addColorStop(1, 'rgba(37, 99, 235, 0)');
          } else {
            mouseG.addColorStop(0, `rgba(56, 189, 248, ${0.16 * intensity})`);
            mouseG.addColorStop(0.5, `rgba(124, 58, 237, ${0.06 * intensity})`);
            mouseG.addColorStop(1, 'rgba(59, 130, 246, 0)');
          }
          ctx.fillStyle = mouseG;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, mouse.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // =========================================================
      // 3. STYLE: 'blueprint' (Architectural Studio Grid)
      // Crisp 28px graph drafting paper with subtle coordinate crosshairs
      // =========================================================
      if (currentStyle === 'blueprint') {
        const step = 28;
        const cols = Math.ceil(width / step) + 1;
        const rows = Math.ceil(height / step) + 1;

        ctx.strokeStyle = isLight
          ? `rgba(37, 99, 235, ${0.065 * intensity})`
          : `rgba(56, 189, 248, ${0.08 * intensity})`;
        ctx.lineWidth = 1;

        // Vertical lines
        ctx.beginPath();
        for (let c = 0; c < cols; c++) {
          const x = c * step;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        // Horizontal lines
        for (let r = 0; r < rows; r++) {
          const y = r * step;
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Major accent grid lines every 4th step
        ctx.strokeStyle = isLight
          ? `rgba(37, 99, 235, ${0.13 * intensity})`
          : `rgba(56, 189, 248, ${0.15 * intensity})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let c = 0; c < cols; c += 4) {
          const x = c * step;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
        }
        for (let r = 0; r < rows; r += 4) {
          const y = r * step;
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();

        // Architectural crosshairs at 4x4 intersections
        for (let c = 0; c < cols; c += 4) {
          for (let r = 0; r < rows; r += 4) {
            const px = c * step;
            const py = r * step;
            ctx.strokeStyle = isLight
              ? `rgba(37, 99, 235, ${0.35 * intensity})`
              : `rgba(56, 189, 248, ${0.45 * intensity})`;
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(px - 5, py);
            ctx.lineTo(px + 5, py);
            ctx.moveTo(px, py - 5);
            ctx.lineTo(px, py + 5);
            ctx.stroke();
          }
        }

        // Soft radial vignette falloff
        const vignette = ctx.createRadialGradient(
          width / 2,
          height / 2,
          Math.min(width, height) * 0.3,
          width / 2,
          height / 2,
          Math.max(width, height) * 0.75
        );
        if (isLight) {
          vignette.addColorStop(0, 'rgba(248, 250, 252, 0)');
          vignette.addColorStop(1, 'rgba(248, 250, 252, 0.4)');
        } else {
          vignette.addColorStop(0, 'rgba(7, 7, 11, 0)');
          vignette.addColorStop(1, 'rgba(7, 7, 11, 0.5)');
        }
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
      }

      // =========================================================
      // 4. STYLE: 'silk' (Flowing 3D Harmonic Satin Wave)
      // Pure smooth gradient curves without any particle dots
      // =========================================================
      if (currentStyle === 'silk') {
        const waveCount = 5;
        const baseHeights = [
          height * 0.28,
          height * 0.44,
          height * 0.58,
          height * 0.72,
          height * 0.86,
        ];

        for (let w = 0; w < waveCount; w++) {
          const baseY = baseHeights[w];
          const speed = 0.6 + w * 0.18;
          const amp = 32 + w * 12;
          const freq = 0.0022 + w * 0.0005;

          ctx.beginPath();
          const segments = Math.ceil(width / 25);

          for (let s = 0; s <= segments; s++) {
            const px = (s / segments) * width;
            const w1 = Math.sin(px * freq + time * speed + w * 1.2);
            const w2 = Math.cos(px * (freq * 1.5) - time * (speed * 0.8) + w * 0.6);
            let py = baseY + (w1 + w2) * amp;

            // Interactive mouse deflection
            if (mouse.active) {
              const dx = px - mouse.x;
              const dy = py - mouse.y;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist < 200 && dist > 0) {
                const push = (1 - dist / 200) * 40;
                py += (dy / dist) * push;
              }
            }

            if (s === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }

          const grad = ctx.createLinearGradient(0, baseY - 50, width, baseY + 50);
          if (isLight) {
            grad.addColorStop(0, `rgba(37, 99, 235, ${(0.32 - w * 0.035) * intensity})`);
            grad.addColorStop(0.35, `rgba(6, 182, 212, ${(0.36 - w * 0.035) * intensity})`);
            grad.addColorStop(0.7, `rgba(168, 85, 247, ${(0.30 - w * 0.035) * intensity})`);
            grad.addColorStop(1, `rgba(251, 146, 60, ${(0.26 - w * 0.035) * intensity})`);
          } else {
            grad.addColorStop(0, `rgba(56, 189, 248, ${(0.40 - w * 0.04) * intensity})`);
            grad.addColorStop(0.4, `rgba(168, 85, 247, ${(0.42 - w * 0.04) * intensity})`);
            grad.addColorStop(0.75, `rgba(34, 211, 238, ${(0.38 - w * 0.04) * intensity})`);
            grad.addColorStop(1, `rgba(96, 165, 250, ${(0.35 - w * 0.04) * intensity})`);
          }

          ctx.strokeStyle = grad;
          ctx.lineWidth = 2.4 - w * 0.25;
          ctx.stroke();
        }
      }

      // =========================================================
      // 5. STYLE: 'matrix' (Cyber Constellation & Network)
      // =========================================================
      if (currentStyle === 'matrix') {
        const maxConnectDist = 180;
        const activeEdges: { i: number; j: number }[] = [];

        // Moving Nodes
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          node.x += node.vx;
          node.y += node.vy;

          if (node.x <= 15) {
            node.x = 15;
            node.vx = Math.abs(node.vx);
          } else if (node.x >= width - 15) {
            node.x = width - 15;
            node.vx = -Math.abs(node.vx);
          }

          if (node.y <= 15) {
            node.y = 15;
            node.vy = Math.abs(node.vy);
          } else if (node.y >= height - 15) {
            node.y = height - 15;
            node.vy = -Math.abs(node.vy);
          }

          const pulse = Math.sin(time * node.pulseSpeed + node.pulsePhase);
          const r = node.baseRadius + pulse * 0.8;

          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 2.5, 0, Math.PI * 2);
          ctx.strokeStyle = isLight
            ? `rgba(37, 99, 235, ${0.45 * intensity})`
            : `rgba(56, 189, 248, ${0.55 * intensity})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isLight ? '#2563eb' : node.color;
          ctx.fill();
        }

        // Lines
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[i].x - nodes[j].x;
            const dy = nodes[i].y - nodes[j].y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxConnectDist) {
              activeEdges.push({ i, j });
              const alpha = (1 - dist / maxConnectDist) * (isLight ? 0.35 : 0.45) * intensity;
              ctx.beginPath();
              ctx.moveTo(nodes[i].x, nodes[i].y);
              ctx.lineTo(nodes[j].x, nodes[j].y);
              ctx.strokeStyle = isLight
                ? `rgba(37, 99, 235, ${alpha})`
                : `rgba(56, 189, 248, ${alpha})`;
              ctx.lineWidth = 1.2;
              ctx.stroke();
            }
          }
        }

        // Data Packets
        if (activeEdges.length > 0 && time - lastPacketTime > 0.4 && dataPackets.length < 12) {
          lastPacketTime = time;
          const randomEdge = activeEdges[Math.floor(Math.random() * activeEdges.length)];
          dataPackets.push({
            fromNode: randomEdge.i,
            toNode: randomEdge.j,
            progress: 0,
            speed: Math.random() * 0.02 + 0.015,
            color: isLight ? '#2563eb' : '#38bdf8',
          });
        }

        for (let p = dataPackets.length - 1; p >= 0; p--) {
          const packet = dataPackets[p];
          packet.progress += packet.speed;

          if (packet.progress >= 1) {
            dataPackets.splice(p, 1);
            continue;
          }

          const nA = nodes[packet.fromNode];
          const nB = nodes[packet.toNode];
          if (!nA || !nB) {
            dataPackets.splice(p, 1);
            continue;
          }

          const px = nA.x + (nB.x - nA.x) * packet.progress;
          const py = nA.y + (nB.y - nA.y) * packet.progress;

          ctx.beginPath();
          ctx.arc(px, py, isLight ? 2.6 : 3.0, 0, Math.PI * 2);
          ctx.fillStyle = packet.color;
          ctx.fill();
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseleave', handleMouseLeave);
      window.removeEventListener('resize', handleResize);
    };
  }, [transparentBg, styleOverride, settings]);

  const currentStyle = styleOverride || settings.style;

  return (
    <>
      {/* 1. Wallpaper Image Layer (if style is 'wallpaper') */}
      {currentStyle === 'wallpaper' && (
        <div
          className="fixed inset-0 pointer-events-none z-0 transition-all duration-700 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url(${settings.wallpaperUrl})`,
            opacity: settings.intensity,
          }}
        >
          {/* Frosted readability overlay for light / dark mode */}
          <div className="absolute inset-0 bg-white/40 dark:bg-black/60 backdrop-blur-[2px]" />
        </div>
      )}

      {/* 2. Interactive Canvas Layer */}
      <canvas
        ref={canvasRef}
        className={`fixed inset-0 pointer-events-none z-0 transition-opacity duration-500 ${className}`}
      />
    </>
  );
};
