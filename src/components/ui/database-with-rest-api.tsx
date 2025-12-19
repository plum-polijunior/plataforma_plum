"use client";

import React from "react";
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
  title?: string;
  lightColor?: string;
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
  return (
    <div
      className={cn(
        "relative flex flex-col items-center w-full max-w-[900px] mx-auto",
        className
      )}
    >
      {/* Top badges - responsive grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 w-full mb-8">
        {[
          { text: badgeTexts.first },
          { text: badgeTexts.second },
          { text: badgeTexts.third },
          { text: badgeTexts.fourth },
        ].map((badge, index) => (
          <div key={index} className="relative flex flex-col items-center">
            {/* Badge box */}
            <div
              className="relative min-w-[140px] lg:min-w-[180px] px-4 lg:px-6 py-3 lg:py-4 rounded-xl text-center border border-primary/40 bg-card/80 backdrop-blur-sm"
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
              className="w-3 h-3 rounded-full mt-2"
              style={{
                backgroundColor: lightColor,
                boxShadow: `0 0 10px ${lightColor}60`,
              }}
            />
          </div>
        ))}
      </div>

      {/* SVG Wires connecting badges to center */}
      <div className="relative w-full h-[180px] lg:h-[220px]">
        <svg
          viewBox="0 0 400 120"
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={lightColor} stopOpacity="0.3" />
              <stop offset="50%" stopColor={lightColor} stopOpacity="0.6" />
              <stop offset="100%" stopColor={lightColor} stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {/* Wire paths - from each badge node to center convergence point */}
          <g strokeWidth="1.5" stroke="url(#purpleGradient)" fill="none">
            {/* Path 1: Left-most (Varejistas) */}
            <path d="M 50 0 L 50 40 Q 50 50 60 50 L 190 50 Q 200 50 200 60 L 200 105" />
            {/* Path 2: Center-left (Agências) */}
            <path d="M 150 0 L 150 30 Q 150 40 160 40 L 190 40 Q 200 40 200 50 L 200 105" />
            {/* Path 3: Center-right (Financeiro) */}
            <path d="M 250 0 L 250 30 Q 250 40 240 40 L 210 40 Q 200 40 200 50 L 200 105" />
            {/* Path 4: Right-most (Indústrias) */}
            <path d="M 350 0 L 350 40 Q 350 50 340 50 L 210 50 Q 200 50 200 60 L 200 105" />
          </g>

          {/* Animated light circles */}
          <g>
            <circle r="4" fill={lightColor} className="database db-light-1">
              <animate
                attributeName="opacity"
                values="0;1;0"
                dur="4s"
                repeatCount="indefinite"
              />
            </circle>
            <circle r="4" fill={lightColor} className="database db-light-2">
              <animate
                attributeName="opacity"
                values="0;1;0"
                dur="4s"
                begin="0.5s"
                repeatCount="indefinite"
              />
            </circle>
            <circle r="4" fill={lightColor} className="database db-light-3">
              <animate
                attributeName="opacity"
                values="0;1;0"
                dur="4s"
                begin="1s"
                repeatCount="indefinite"
              />
            </circle>
            <circle r="4" fill={lightColor} className="database db-light-4">
              <animate
                attributeName="opacity"
                values="0;1;0"
                dur="4s"
                begin="1.5s"
                repeatCount="indefinite"
              />
            </circle>
          </g>

          {/* Convergence point - final dot above pill */}
          <circle cx="200" cy="105" r="6" fill={lightColor}>
            <animate
              attributeName="opacity"
              values="0.7;1;0.7"
              dur="2s"
              repeatCount="indefinite"
            />
          </circle>
        </svg>
      </div>

      {/* Main Pill Box - "Uso de dados" */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="relative z-10 flex items-center justify-center rounded-full border border-primary/40 bg-card/80 backdrop-blur-sm px-8 py-4 -mt-4"
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
