"use client";

import React, { useRef, useState, useLayoutEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface DatabaseWithRestApiProps {
  className?: string;
  circleText?: string;
  badgeTexts?: {
    first: string;
    second: string;
    third: string;
    fourth: string;
  };
  lightColor?: string;
}

interface PathData {
  d: string;
  duration: number;
}

const DatabaseWithRestApi = ({
  className,
  circleText = "Uso de dados",
  badgeTexts = {
    first: "Varejistas",
    second: "Agências de Marketing",
    third: "Financeiro",
    fourth: "Indústrias",
  },
  lightColor = "#A855F7",
}: DatabaseWithRestApiProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pillRef = useRef<HTMLDivElement>(null);
  const [paths, setPaths] = useState<PathData[]>([]);
  const [trunkPath, setTrunkPath] = useState<string>("");
  const [finalDotPos, setFinalDotPos] = useState({ x: 0, y: 0 });
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const calculatePaths = useCallback(() => {
    if (!containerRef.current || !pillRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const pillRect = pillRef.current.getBoundingClientRect();

    // Final dot position: centered above the pill
    const finalX = pillRect.left + pillRect.width / 2 - containerRect.left;
    const finalY = pillRect.top - containerRect.top - 14;

    setFinalDotPos({ x: finalX, y: finalY });
    setSvgSize({ width: containerRect.width, height: pillRect.top - containerRect.top });

    // Junction point where all wires converge
    const junctionX = finalX;
    const junctionY = finalY - 35;
    const cornerRadius = 10;

    const newPaths: PathData[] = [];
    const durations = [3.2, 3.5, 3.8, 3.4];

    boxRefs.current.forEach((boxEl, index) => {
      if (!boxEl) return;

      const boxRect = boxEl.getBoundingClientRect();
      const startX = boxRect.left + boxRect.width / 2 - containerRect.left;
      const startY = boxRect.bottom - containerRect.top + 8;

      // Mid Y point for horizontal segment
      const midY = startY + 35;

      // Build path with straight lines and small rounded corners
      let d: string;

      if (Math.abs(startX - junctionX) < 5) {
        // If already aligned, just go straight down
        d = `M ${startX} ${startY} L ${startX} ${junctionY}`;
      } else {
        // Create L-shaped path with rounded corners
        const goingRight = startX < junctionX;
        
        // Path: down, then horizontal, then down to junction
        d = `M ${startX} ${startY} 
             L ${startX} ${midY - cornerRadius}
             Q ${startX} ${midY} ${startX + (goingRight ? cornerRadius : -cornerRadius)} ${midY}
             L ${junctionX + (goingRight ? -cornerRadius : cornerRadius)} ${midY}
             Q ${junctionX} ${midY} ${junctionX} ${midY + cornerRadius}
             L ${junctionX} ${junctionY}`;
      }

      newPaths.push({ d, duration: durations[index] });
    });

    setPaths(newPaths);

    // Trunk path from junction to final dot
    setTrunkPath(`M ${junctionX} ${junctionY} L ${junctionX} ${finalY}`);
  }, []);

  useLayoutEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(calculatePaths, 100);
    window.addEventListener("resize", calculatePaths);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", calculatePaths);
    };
  }, [calculatePaths]);

  const badges = [
    { text: badgeTexts.first },
    { text: badgeTexts.second },
    { text: badgeTexts.third },
    { text: badgeTexts.fourth },
  ];

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex flex-col items-center w-full max-w-[900px] mx-auto",
        className
      )}
    >
      {/* Top badges - responsive grid: 4 cols desktop, 2x2 mobile */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 w-full">
        {badges.map((badge, index) => (
          <div
            key={index}
            ref={(el) => (boxRefs.current[index] = el)}
            className="relative flex flex-col items-center"
          >
            {/* Badge box */}
            <div
              className="relative min-w-[140px] lg:min-w-[160px] px-4 lg:px-5 py-3 lg:py-4 rounded-xl text-center border border-primary/40 bg-card/80 backdrop-blur-sm"
              style={{
                boxShadow: `0 0 20px ${lightColor}15`,
              }}
            >
              <span className="text-xs lg:text-sm font-medium text-foreground leading-tight block">
                {badge.text}
              </span>
            </div>
            {/* Connection node at bottom of box */}
            <div
              className="w-2.5 h-2.5 rounded-full mt-1.5"
              style={{
                backgroundColor: lightColor,
                boxShadow: `0 0 8px ${lightColor}60`,
              }}
            />
          </div>
        ))}
      </div>

      {/* SVG Wires - dynamically positioned */}
      {svgSize.width > 0 && svgSize.height > 0 && (
        <svg
          className="absolute top-0 left-0 pointer-events-none"
          width={svgSize.width}
          height={svgSize.height}
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id="wireGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lightColor} stopOpacity="0.3" />
              <stop offset="100%" stopColor={lightColor} stopOpacity="0.5" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Wire paths */}
          <g strokeWidth="2" stroke="url(#wireGradient)" fill="none">
            {paths.map((path, index) => (
              <path key={index} d={path.d} />
            ))}
            {/* Trunk path */}
            {trunkPath && <path d={trunkPath} />}
          </g>

          {/* Animated light circles moving along paths */}
          {paths.map((path, index) => (
            <circle
              key={`light-${index}`}
              r="4"
              fill={lightColor}
              filter="url(#glow)"
            >
              <animateMotion
                dur={`${path.duration}s`}
                repeatCount="indefinite"
                path={path.d}
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="spline"
                keySplines="0.4 0 0.2 1"
              />
              <animate
                attributeName="opacity"
                values="0.6;1;0.6"
                dur={`${path.duration}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}

          {/* Final convergence dot */}
          <circle
            cx={finalDotPos.x}
            cy={finalDotPos.y}
            r="6"
            fill={lightColor}
            filter="url(#glow)"
          >
            <animate
              attributeName="opacity"
              values="0.7;1;0.7"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      )}

      {/* Spacer for SVG area */}
      <div className="h-[120px] lg:h-[140px]" />

      {/* Main Pill Box - "Uso de dados" */}
      <motion.div
        ref={pillRef}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="relative z-10 flex items-center justify-center rounded-full border border-primary/40 bg-card/80 backdrop-blur-sm px-8 py-4"
        style={{
          boxShadow: `0 0 40px ${lightColor}25, 0 0 80px ${lightColor}15`,
        }}
      >
        {/* Glow effect */}
        <div
          className="absolute -inset-2 rounded-full opacity-25 blur-xl"
          style={{ background: `radial-gradient(circle, ${lightColor}50, transparent)` }}
        />

        {/* Pill text */}
        <span className="relative text-sm lg:text-base font-semibold text-primary">
          {circleText}
        </span>
      </motion.div>
    </div>
  );
};

export default DatabaseWithRestApi;
