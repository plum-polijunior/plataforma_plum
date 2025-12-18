"use client";

import type React from "react";
import { useId, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";

interface LocationMapProps {
  location?: string;
  coordinates?: string;
  className?: string;
}

export function LocationMap({
  location = "Av. Professor Mello Moraes, 2231 - Butantã, São Paulo - SP",
  coordinates = "05508-030",
  className,
}: LocationMapProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const uid = useId();
  const gridPatternId = `grid-${uid}`;

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const rotateX = useTransform(mouseY, [-50, 50], [8, -8]);
  const rotateY = useTransform(mouseX, [-50, 50], [-8, 8]);

  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    mouseX.set(e.clientX - centerX);
    mouseY.set(e.clientY - centerY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
    setIsHovered(false);
  };

  const handleClick = () => setIsExpanded((v) => !v);

  return (
    <motion.div
      ref={containerRef}
      className={`relative w-full max-w-md mx-auto cursor-pointer ${className}`}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      <motion.div
        className="relative overflow-hidden rounded-2xl border border-border/30 bg-card/60 backdrop-blur-xl"
        style={{
          rotateX: springRotateX,
          rotateY: springRotateY,
          transformPerspective: 1000,
        }}
        animate={{
          height: isExpanded ? 340 : 200,
        }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      >
        {/* overlay sutil */}
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 opacity-50"
          animate={{ opacity: isHovered ? 0.8 : 0.5 }}
        />

        <motion.div className="absolute inset-0">
          {isExpanded && (
            <motion.svg
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="xMidYMid slice"
            >
              <motion.rect
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                fill="hsl(var(--muted)/0.3)"
                width="100"
                height="100"
              />

              <g stroke="hsl(var(--border))" strokeWidth="0.5" fill="none">
                {/* vias principais */}
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: 0.3 }}
                  d="M0 35 L100 35"
                  strokeWidth="2"
                  stroke="hsl(var(--primary)/0.4)"
                />
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 1, delay: 0.4 }}
                  d="M0 65 L100 65"
                  strokeWidth="1.5"
                  stroke="hsl(var(--primary)/0.3)"
                />

                {/* vias verticais */}
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.5 }}
                  d="M30 0 L30 100"
                  strokeWidth="1.5"
                  stroke="hsl(var(--primary)/0.3)"
                />
                <motion.path
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, delay: 0.6 }}
                  d="M70 0 L70 100"
                  strokeWidth="1.5"
                  stroke="hsl(var(--primary)/0.3)"
                />

                {/* ruas secundárias */}
                {[20, 50, 80].map((y, i) => (
                  <motion.path
                    key={`h-${i}`}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.7 + i * 0.1 }}
                    d={`M0 ${y} L100 ${y}`}
                    strokeOpacity="0.3"
                  />
                ))}
                {[15, 45, 55, 85].map((x, i) => (
                  <motion.path
                    key={`v-${i}`}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.6, delay: 0.7 + i * 0.1 }}
                    d={`M${x} 0 L${x} 100`}
                    strokeOpacity="0.3"
                  />
                ))}
              </g>

              {/* prédios */}
              <motion.rect
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 1 }}
                x="32" y="38" width="8" height="12" fill="hsl(var(--muted))" rx="1"
              />
              <motion.rect
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 1.1 }}
                x="60" y="40" width="6" height="10" fill="hsl(var(--muted))" rx="1"
              />
              <motion.rect
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.3, delay: 1.2 }}
                x="72" y="20" width="10" height="8" fill="hsl(var(--muted))" rx="1"
              />

              {/* pin roxo */}
              <motion.g
                initial={{ scale: 0, y: -10 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15, delay: 1.3 }}
              >
                <motion.circle
                  cx="50" cy="50" r="6" fill="hsl(var(--primary))"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.circle
                  cx="50" cy="50" r="10" fill="none"
                  stroke="hsl(var(--primary))" strokeWidth="2" strokeOpacity="0.5"
                  animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              </motion.g>

              <motion.text
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                x="50" y="70" textAnchor="middle" fontSize="4"
                fill="hsl(var(--foreground))" fontWeight="500"
              >
                PLUM
              </motion.text>
            </motion.svg>
          )}
        </motion.div>

        {/* grid quando colapsado */}
        <motion.svg
          className="absolute inset-0 w-full h-full"
          animate={{ opacity: isExpanded ? 0 : 0.5 }}
          transition={{ duration: 0.3 }}
        >
          <defs>
            <pattern id={gridPatternId} width="20" height="20" patternUnits="userSpaceOnUse">
              <path
                d="M 20 0 L 0 0 0 20"
                fill="none"
                stroke="hsl(var(--primary)/0.3)"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${gridPatternId})`} />
        </motion.svg>

        {/* conteúdo */}
        <motion.div
          className="absolute inset-0 flex flex-col justify-end p-6"
          animate={{ y: isExpanded ? 0 : 0 }}
        >
          <motion.div
            className="flex items-center gap-3 mb-3"
            animate={{ opacity: isHovered || isExpanded ? 1 : 0.8 }}
          >
            <motion.div
              className="flex items-center gap-1"
              animate={{ scale: isHovered ? 1.05 : 1 }}
            >
              <motion.div
                className="w-2 h-2 rounded-full bg-primary"
                animate={{ scale: [1, 1.3, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="w-2 h-2 rounded-full bg-primary/60"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="w-2 h-2 rounded-full bg-primary/30"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.4 }}
              />
            </motion.div>

            <motion.span
              className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/20 text-primary"
              animate={{ opacity: isExpanded ? 1 : 0.7 }}
            >
              Live
            </motion.span>
          </motion.div>

          <motion.div
            className="space-y-1"
            animate={{ y: isExpanded ? 0 : 0 }}
          >
            <motion.h3
              className="text-lg font-semibold text-foreground"
              animate={{ opacity: 1 }}
            >
              {location}
            </motion.h3>

            <AnimatePresence>
              {isExpanded && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm text-muted-foreground"
                >
                  {coordinates}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.div className="w-12 h-0.5 bg-gradient-to-r from-primary to-accent rounded-full" />
          </motion.div>
        </motion.div>
      </motion.div>

      <motion.p
        className="text-xs text-muted-foreground text-center mt-3"
        animate={{ opacity: isExpanded ? 0 : 0.6 }}
      >
        Clique para expandir
      </motion.p>
    </motion.div>
  );
}
