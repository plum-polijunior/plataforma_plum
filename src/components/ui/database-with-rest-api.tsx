"use client";

import React from "react";
import { motion } from "framer-motion";
import { Store, Megaphone, Landmark, Factory } from "lucide-react";
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
    second: "Agências",
    third: "Financeiro",
    fourth: "Indústrias",
  },
  title = "Para quem",
  lightColor = "#A855F7",
}: DatabaseWithRestApiProps) => {
  const icons = [Store, Megaphone, Landmark, Factory];

  return (
    <div
      className={cn(
        "relative flex h-[320px] w-full max-w-[400px] items-end justify-center",
        className
      )}
    >
      {/* SVG Paths */}
      <svg
        fill="none"
        viewBox="0 0 200 140"
        className="absolute left-1/2 top-0 -translate-x-1/2"
        width="400"
        height="280"
      >
        <defs>
          <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={lightColor} stopOpacity="0.2" />
            <stop offset="50%" stopColor={lightColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={lightColor} stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Static paths */}
        <g strokeWidth="0.5" stroke="url(#purpleGradient)">
          <path d="M 31 10 v 15 q 0 5 5 5 h 59 q 5 0 5 5 v 25" />
          <path d="M 77 10 v 10 q 0 5 5 5 h 13 q 5 0 5 5 v 25" />
          <path d="M 124 10 v 10 q 0 5 -5 5 h -14 q -5 0 -5 5 v 25" />
          <path d="M 170 10 v 15 q 0 5 -5 5 h -60 q -5 0 -5 5 v 25" />
        </g>

        {/* Animated Lights */}
        <g>
          <circle r="2" fill={lightColor} className="database db-light-1">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="2" fill={lightColor} className="database db-light-2">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              begin="0.5s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="2" fill={lightColor} className="database db-light-3">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              begin="1s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="2" fill={lightColor} className="database db-light-4">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              begin="1.5s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* Top badges */}
        <g>
          {[
            { x: 8, text: badgeTexts.first, Icon: icons[0] },
            { x: 54, text: badgeTexts.second, Icon: icons[1] },
            { x: 100, text: badgeTexts.third, Icon: icons[2] },
            { x: 146, text: badgeTexts.fourth, Icon: icons[3] },
          ].map((badge, index) => (
            <g key={index}>
              <rect
                x={badge.x}
                y="0"
                width="46"
                height="16"
                rx="4"
                fill="hsl(260 30% 12%)"
                stroke={lightColor}
                strokeWidth="0.3"
                strokeOpacity="0.5"
              />
              <text
                x={badge.x + 23}
                y="11"
                textAnchor="middle"
                fill="hsl(270 20% 90%)"
                fontSize="5"
                fontWeight="500"
              >
                {badge.text}
              </text>
            </g>
          ))}
        </g>

        {/* Connection dots */}
        <g fill={lightColor} fillOpacity="0.6">
          <circle cx="31" cy="10" r="2" />
          <circle cx="77" cy="10" r="2" />
          <circle cx="124" cy="10" r="2" />
          <circle cx="170" cy="10" r="2" />
          <circle cx="100" cy="60" r="3" fill={lightColor} />
        </g>
      </svg>

      {/* Main Box */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
        className="relative z-10 flex h-[100px] w-[160px] flex-col items-center justify-center rounded-xl border border-primary/30 bg-card/80 backdrop-blur-sm"
        style={{
          boxShadow: `0 0 30px ${lightColor}20, 0 0 60px ${lightColor}10`,
        }}
      >
        {/* Glow effect */}
        <div
          className="absolute -inset-1 rounded-xl opacity-30 blur-lg"
          style={{ background: `radial-gradient(circle, ${lightColor}40, transparent)` }}
        />

        {/* Title */}
        <div className="relative flex items-center gap-2 mb-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ background: lightColor }}
          />
          <span className="text-xs font-medium text-muted-foreground">
            {title}
          </span>
        </div>

        {/* Circle text */}
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-primary/40 bg-muted/50">
          <span className="text-[10px] font-semibold text-primary text-center leading-tight px-1">
            {circleText}
          </span>
        </div>

        {/* Bottom decoration */}
        <div className="absolute -bottom-2 flex gap-1">
          <div className="h-1 w-1 rounded-full bg-primary/60" />
          <div className="h-1 w-1 rounded-full bg-primary/40" />
          <div className="h-1 w-1 rounded-full bg-primary/60" />
          <div className="h-1 w-1 rounded-full bg-primary/40" />
        </div>
      </motion.div>
    </div>
  );
};

export default DatabaseWithRestApi;
