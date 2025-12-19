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

  const LANE_SPACING = 16; // Vertical spacing between horizontal lanes

  const calculatePaths = useCallback(() => {
    if (!containerRef.current || !pillRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const pillRect = pillRef.current.getBoundingClientRect();

    // Final dot position: exactly at the top border of the pill, centered
    const finalX = pillRect.left + pillRect.width / 2 - containerRect.left;
    const finalY = pillRect.top - containerRect.top;

    setFinalDotPos({ x: finalX, y: finalY });
    setSvgSize({ width: containerRect.width, height: pillRect.top - containerRect.top + 10 });

    // Junction point where all wires converge (center X)
    const junctionX = finalX;
    
    // Junction Y: some space above the pill for the trunk
    const junctionY = finalY - 50;

    const newPaths: PathData[] = [];
    const durations = [3.0, 3.3, 3.6, 3.9];

    // Lane offsets for horizontal wires (to prevent crossing)
    // Outer boxes get lanes closer to boxes, inner boxes get lanes closer to junction
    // Order: [Varejistas(left-outer), Agências(left-inner), Financeiro(right-inner), Indústrias(right-outer)]
    const laneOffsets = [3, 1, 2, 0]; // Different lane heights

    boxRefs.current.forEach((boxEl, index) => {
      if (!boxEl) return;

      const boxRect = boxEl.getBoundingClientRect();
      
      // Determine which side the box is on
      const boxCenterX = boxRect.left + boxRect.width / 2 - containerRect.left;
      const isLeftSide = boxCenterX < junctionX;
      
      // Start point: side edge of the box (right for left boxes, left for right boxes)
      const startX = isLeftSide 
        ? boxRect.right - containerRect.left  // Right edge of left-side boxes
        : boxRect.left - containerRect.left;  // Left edge of right-side boxes
      
      // Vertical center of the box
      const startY = boxRect.top + boxRect.height / 2 - containerRect.top;
      
      // Calculate lane Y based on offset (each wire gets its own horizontal lane)
      const laneY = junctionY - (laneOffsets[index] * LANE_SPACING);

      // Path: horizontal from box edge to junction X, then vertical to junction Y
      // Shape: horizontal line at box level → vertical to lane → horizontal to junction X → vertical to junction Y
      let d: string;
      
      if (Math.abs(startX - junctionX) < 10) {
        // If very close to center, just go straight down
        d = `M ${startX} ${startY} L ${startX} ${junctionY}`;
      } else {
        // L-shape with lanes to avoid crossing:
        // 1. Horizontal from box edge toward center
        // 2. Vertical down to lane
        // 3. Horizontal to junction X
        // 4. Vertical down to junction Y
        
        // Midpoint X for the first vertical segment (closer to the box)
        const midX = isLeftSide 
          ? startX + 20 + (index * 8)  // Stagger midpoints for left boxes
          : startX - 20 - ((3 - index) * 8);  // Stagger for right boxes
        
        d = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${laneY} L ${junctionX} ${laneY} L ${junctionX} ${junctionY}`;
      }

      newPaths.push({ d, duration: durations[index] });
    });

    setPaths(newPaths);

    // Trunk path from junction to final dot (touching the pill)
    setTrunkPath(`M ${junctionX} ${junctionY} L ${junctionX} ${finalY}`);
  }, []);

  useLayoutEffect(() => {
    const timer = setTimeout(calculatePaths, 150);
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
        "relative flex flex-col items-center w-full max-w-[950px] mx-auto",
        className
      )}
    >
      {/* Top badges - 4 cols desktop, 2x2 mobile - HIGH Z-INDEX */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-x-12 w-full mb-16 lg:mb-20 relative z-10">
        {badges.map((badge, index) => (
          <div
            key={index}
            ref={(el) => (boxRefs.current[index] = el)}
            className="relative flex items-center justify-center"
          >
            {/* Badge box with side connectors */}
            <div
              className="relative min-w-[120px] lg:min-w-[140px] px-4 lg:px-5 py-3 lg:py-4 rounded-xl text-center border border-primary/40 bg-card backdrop-blur-sm"
              style={{
                boxShadow: `0 0 20px ${lightColor}15`,
              }}
            >
              {/* Left connector dot (for left-side boxes) */}
              {index < 2 && (
                <div
                  className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: lightColor,
                    boxShadow: `0 0 8px ${lightColor}60`,
                  }}
                />
              )}
              {/* Right connector dot (for right-side boxes) */}
              {index >= 2 && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full"
                  style={{
                    backgroundColor: lightColor,
                    boxShadow: `0 0 8px ${lightColor}60`,
                  }}
                />
              )}
              <span className="text-xs lg:text-sm font-medium text-foreground leading-tight block">
                {badge.text}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* SVG Wires - LOW Z-INDEX, pointer-events-none */}
      {svgSize.width > 0 && svgSize.height > 0 && (
        <svg
          className="absolute top-0 left-0 z-0 pointer-events-none"
          width={svgSize.width}
          height={svgSize.height}
          style={{ overflow: "visible" }}
        >
          <defs>
            <linearGradient id="wireGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lightColor} stopOpacity="0.35" />
              <stop offset="100%" stopColor={lightColor} stopOpacity="0.55" />
            </linearGradient>
            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Wire paths - straight lines only */}
          <g strokeWidth="2" stroke="url(#wireGradient)" fill="none">
            {paths.map((path, index) => (
              <path key={index} d={path.d} />
            ))}
            {/* Trunk path */}
            {trunkPath && <path d={trunkPath} strokeWidth="2.5" />}
          </g>

          {/* Animated light circles moving along each path */}
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
                path={path.d + (trunkPath ? ` ${trunkPath.replace('M', 'L')}` : '')}
                keyPoints="0;1"
                keyTimes="0;1"
                calcMode="linear"
              />
              <animate
                attributeName="opacity"
                values="0.5;1;0.5"
                dur={`${path.duration}s`}
                repeatCount="indefinite"
              />
            </circle>
          ))}

          {/* Final convergence dot - exactly at pill top border */}
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
      <div className="h-[100px] lg:h-[120px]" />

      {/* Main Pill Box - "Uso de dados" - HIGH Z-INDEX */}
      <motion.div
        ref={pillRef}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="relative z-10 flex items-center justify-center rounded-full border border-primary/40 bg-card backdrop-blur-sm px-8 py-4"
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