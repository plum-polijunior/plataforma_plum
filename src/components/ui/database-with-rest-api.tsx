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
  const [finalDotPos, setFinalDotPos] = useState({ x: 0, y: 0 });
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const calculatePaths = useCallback(() => {
    if (!containerRef.current || !pillRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const pillRect = pillRef.current.getBoundingClientRect();

    // Final dot position: centered above the pill
    const finalX = pillRect.left + pillRect.width / 2 - containerRect.left;
    const finalY = pillRect.top - containerRect.top - 12; // 12px above pill

    setFinalDotPos({ x: finalX, y: finalY });
    setSvgSize({ width: containerRect.width, height: pillRect.top - containerRect.top });

    // Junction point where all wires converge
    const junctionY = finalY - 30;

    const newPaths: PathData[] = [];

    boxRefs.current.forEach((boxEl) => {
      if (!boxEl) return;

      const boxRect = boxEl.getBoundingClientRect();
      // Start point: center bottom of each box
      const startX = boxRect.left + boxRect.width / 2 - containerRect.left;
      const startY = boxRect.bottom - containerRect.top + 6; // Below the node dot

      // Create curved path to junction then down to final dot
      const midY = startY + 40;
      
      // Path: go down, curve toward center, then down to final
      const d = `M ${startX} ${startY} 
                 L ${startX} ${midY} 
                 Q ${startX} ${junctionY} ${finalX} ${junctionY}
                 L ${finalX} ${finalY}`;

      newPaths.push({ d });
    });

    setPaths(newPaths);
  }, []);

  useLayoutEffect(() => {
    calculatePaths();
    window.addEventListener("resize", calculatePaths);
    return () => window.removeEventListener("resize", calculatePaths);
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
            <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={lightColor} stopOpacity="0.4" />
              <stop offset="100%" stopColor={lightColor} stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Wire paths */}
          <g strokeWidth="2" stroke="url(#purpleGradient)" fill="none">
            {paths.map((path, index) => (
              <path key={index} d={path.d} />
            ))}
          </g>

          {/* Final convergence dot */}
          <circle
            cx={finalDotPos.x}
            cy={finalDotPos.y}
            r="6"
            fill={lightColor}
            style={{ filter: `drop-shadow(0 0 6px ${lightColor})` }}
          />
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
