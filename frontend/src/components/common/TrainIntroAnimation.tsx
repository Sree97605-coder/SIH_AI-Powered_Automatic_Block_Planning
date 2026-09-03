import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TrainIntroAnimationProps {
  onComplete?: () => void;
}

export const TrainIntroAnimation: React.FC<TrainIntroAnimationProps> = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Triggers EVERY TIME on refresh
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setIsVisible(false);
      onComplete?.();
      return;
    }

    // Auto complete after sweeping across the web into the logo
    const timer = setTimeout(() => {
      setIsVisible(false);
      onComplete?.();
    }, 4200);

    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!isVisible) return null;

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 pointer-events-none z-50 overflow-hidden"
        aria-hidden="true"
      >
        {/* Full-screen SVG track and sweeping train loop path across the entire web */}
        <svg className="w-full h-full absolute inset-0">
          <defs>
            {/* Luminous Track gradient */}
            <linearGradient id="trainTrackGlow" x1="100%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="#E8A33D" stopOpacity="0.9" />
              <stop offset="35%" stopColor="#3E6C8A" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#2E8B57" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#F4C766" stopOpacity="1" />
            </linearGradient>

            {/* Glowing Train Head Gradient */}
            <radialGradient id="trainHeadGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFF5E0" stopOpacity="1" />
              <stop offset="40%" stopColor="#E8A33D" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#E8A33D" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Sweeping Luminous Orbit Track that loops across the web and docks at logo (38px, 32px) */}
          <motion.path
            d="M 1100 850 C 950 650, 750 780, 500 600 C 200 400, 350 150, 700 180 C 1000 220, 850 60, 450 70 C 200 80, 80 45, 38 32"
            fill="none"
            stroke="url(#trainTrackGlow)"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray="8 4"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.95, 0.8, 0] }}
            transition={{ duration: 3.8, ease: "easeInOut" }}
          />
        </svg>

        {/* 3D Bullet Train Silhouette with Motion Trail Racing Full Orbit & Settling into Logo */}
        <motion.div
          className="absolute w-24 h-12 -ml-12 -mt-6 flex items-center justify-center pointer-events-none"
          initial={{
            x: '105vw',
            y: '85vh',
            scale: 2.0,
            rotate: -25,
            opacity: 0,
          }}
          animate={{
            x: ['105vw', '55vw', '25vw', '75vw', '40vw', '10vw', '38px'],
            y: ['85vh', '68vh', '42vh', '18vh', '8vh', '5vh', '32px'],
            scale: [2.0, 1.6, 1.3, 1.0, 0.7, 0.5, 0.3],
            rotate: [-25, 10, -35, 15, -10, -5, 0],
            opacity: [0, 1, 1, 1, 1, 1, 0],
          }}
          transition={{
            duration: 4.0,
            ease: [0.25, 1, 0.35, 1],
            times: [0, 0.22, 0.45, 0.65, 0.82, 0.94, 1],
          }}
        >
          {/* Luminous Speed Aura */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#E8A33D]/70 to-[#FFF5E0] rounded-full blur-md animate-pulse" />
          
          {/* Aerodynamic Bullet Train Locomotive */}
          <div className="relative z-10 w-full h-full flex items-center">
            {/* Speed Streamlines */}
            <div className="w-10 h-1.5 bg-gradient-to-r from-transparent via-[#3E6C8A] to-[#E8A33D] rounded-full mr-1.5 opacity-90 shadow-sm" />
            
            <div className="w-14 h-5 bg-gradient-to-r from-[#0B1420] via-[#1A2D42] to-[#E8A33D] rounded-l-md rounded-r-full border-2 border-[#E8A33D] shadow-[0_0_25px_#E8A33D] flex items-center justify-end px-2">
              {/* Cockpit visor */}
              <div className="w-3 h-2 bg-[#05070C] rounded-r-full border-r border-[#FFF5E0]" />
              {/* Twin high-intensity Headlight beam */}
              <div className="w-2.5 h-2.5 rounded-full bg-[#FFF5E0] shadow-[0_0_15px_#FFF5E0]" />
            </div>
          </div>
        </motion.div>

        {/* Arrival Logo Pulse Flare when Train Docks inside the Logo */}
        <motion.div
          className="absolute left-6 top-5 w-16 h-16 rounded-full bg-gradient-to-r from-[#E8A33D] to-[#2E8B57] blur-xl pointer-events-none"
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 0, 0, 1, 0], scale: [0.3, 0.3, 0.3, 2.5, 3.5] }}
          transition={{ duration: 4.2, times: [0, 0.7, 0.88, 0.95, 1] }}
        />
      </div>
    </AnimatePresence>
  );
};
