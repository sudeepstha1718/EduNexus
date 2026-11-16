import React from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
  showText?: boolean;
  textClassName?: string;
  subtitle?: string;
}

/**
 * AppLogo Component
 * Accurately reproduces the custom Academic Graduate emblem:
 * - Golden amber outer orbital arc embracing the scholar
 * - Navy blue graduation mortarboard cap with hanging tassel & white brim band
 * - Graduate head silhouette & open book swooshes
 * - Golden vertical academic pencil on the right
 */
export const AppLogo: React.FC<AppLogoProps> = ({
  size = 32,
  className = '',
  showText = false,
  textClassName = '',
  subtitle,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      {/* Emblem SVG Vector */}
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 500 500"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-sm transition-transform duration-200 hover:scale-105"
        >
          <defs>
            {/* Golden Amber Orbit Gradient */}
            <linearGradient id="orbitGrad" x1="50" y1="450" x2="450" y2="150" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#D97706" />
              <stop offset="50%" stopColor="#F59E0B" />
              <stop offset="100%" stopColor="#FBBF24" />
            </linearGradient>

            {/* Navy Graduate Shadow & Fill */}
            <linearGradient id="navyGrad" x1="150" y1="100" x2="350" y2="400" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="60%" stopColor="#0F2942" />
              <stop offset="100%" stopColor="#0B192C" />
            </linearGradient>

            {/* Subtle backlight glow for dark mode */}
            <filter id="subtleGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* 1. OUTER GOLDEN ORANGE CIRCULAR ORBITAL ARC */}
          {/* Sweeps from left (approx 200 deg) through bottom to top-right (approx 40 deg) */}
          <path
            d="M 160 170 
               C 105 220, 110 325, 165 390 
               C 220 455, 335 450, 390 380 
               C 425 335, 435 270, 420 220 
               C 420 220, 428 280, 385 345 
               C 340 410, 240 435, 175 380 
               C 120 330, 120 240, 160 170 Z"
            fill="url(#orbitGrad)"
          />

          {/* Additional lower smooth thickness accent for the golden crescent */}
          <path
            d="M 125 350
               C 170 435, 305 455, 375 385
               C 340 430, 205 435, 140 365
               Z"
            fill="#EA580C"
            opacity="0.6"
          />

          {/* 2. GRADUATION MORTARBOARD CAP (NAVY) */}
          {/* Top Diamond rhombus */}
          <path
            d="M 255 120 
               L 405 165 
               L 255 210 
               L 145 160 Z"
            fill="url(#navyGrad)"
          />

          {/* Cap Skull Base & Visor Underlay */}
          <path
            d="M 195 185
               C 215 175, 295 175, 315 185
               C 315 200, 312 215, 305 225
               C 275 220, 235 220, 205 225
               Z"
            fill="url(#navyGrad)"
          />

          {/* White Brim Band Arc underneath the cap */}
          <path
            d="M 185 222
               C 225 185, 295 185, 325 222
               C 300 205, 215 205, 185 222 Z"
            fill="#FFFFFF"
            stroke="#E2E8F0"
            strokeWidth="2"
          />

          {/* Mortarboard Hanging Tassel (Left side) */}
          {/* Tassel cord */}
          <path
            d="M 255 165
               C 210 180, 185 210, 180 240"
            stroke="url(#navyGrad)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          {/* Hanging Tassel Bob / Ring */}
          <circle
            cx="180"
            cy="245"
            r="16"
            fill="url(#navyGrad)"
          />

          {/* 3. GRADUATE HEAD & FACE SILHOUETTE */}
          <path
            d="M 195 225
               C 190 260, 200 295, 215 315
               C 230 325, 280 325, 295 315
               C 315 295, 325 260, 320 225
               C 290 215, 220 215, 195 225 Z"
            fill="url(#navyGrad)"
          />

          {/* 4. OPEN BOOK PAGES & SCHOLAR SHOULDERS (CURVED SWOOSHES) */}
          {/* Top page swoosh */}
          <path
            d="M 195 330
               C 240 280, 315 280, 355 300
               C 315 305, 240 305, 195 330 Z"
            fill="url(#navyGrad)"
          />

          {/* Middle book page sweep */}
          <path
            d="M 198 355
               C 245 310, 325 315, 360 330
               C 320 338, 245 335, 198 355 Z"
            fill="url(#navyGrad)"
          />

          {/* Bottom chest/collar base sweep */}
          <path
            d="M 205 380
               C 255 345, 315 350, 342 365
               C 310 380, 260 380, 205 380 Z"
            fill="url(#navyGrad)"
          />

          {/* 5. GOLDEN ACADEMIC PENCIL (RIGHT SIDE) */}
          <g transform="translate(385, 205)">
            {/* Pencil Body */}
            <rect
              x="-6"
              y="0"
              width="12"
              height="38"
              rx="3"
              fill="url(#orbitGrad)"
            />
            {/* Pencil Eraser / Top band */}
            <rect
              x="-7"
              y="-10"
              width="14"
              height="8"
              rx="2"
              fill="#D97706"
            />
            {/* Top metallic clip line */}
            <line
              x1="-4"
              y1="-6"
              x2="4"
              y2="-6"
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
            {/* Vertical graphite groove in pencil */}
            <line
              x1="0"
              y1="4"
              x2="0"
              y2="34"
              stroke="#FFFFFF"
              strokeWidth="2"
              opacity="0.8"
            />
            {/* Pencil Tip (triangle pointing down) */}
            <polygon
              points="-6,38 6,38 0,50"
              fill="url(#orbitGrad)"
            />
            {/* Graphite lead point */}
            <polygon
              points="-2.5,45 2.5,45 0,50"
              fill="#0F2942"
            />
          </g>
        </svg>
      </div>

      {/* Brand Typography (Optional) */}
      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className="flex items-center tracking-tight">
            <span
              className={`font-black text-lg sm:text-xl tracking-tight text-[var(--ink)] ${textClassName}`}
            >
              Edu<span className="text-amber-500 font-extrabold">Nexus</span>
            </span>
          </div>
          {subtitle && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)] mt-0.5">
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
