import React from 'react';

interface ZorinLogoProps {
  className?: string;
  size?: number;
}

export const ZorinLogo: React.FC<ZorinLogoProps> = ({ className = 'w-5 h-5', size = 20 }) => {
  return (
    <div
      className={`relative flex items-center justify-center shrink-0 rounded-lg bg-gradient-to-tr from-[#18a0fb] to-[#00d2ff] shadow-md shadow-[#18a0fb]/30 text-white ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[68%] h-[68%]"
      >
        {/* Sleek geometric Zorin 'Z' monogram */}
        <path
          d="M5 6.5H19L8 17.5H19.5"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
