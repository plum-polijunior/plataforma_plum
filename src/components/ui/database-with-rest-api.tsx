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
    second: "Agências de Marketing",
    third: "Financeiro",
    fourth: "Indústrias",
  },
  title = "Para quem",
  lightColor = "#A855F7",
}: DatabaseWithRestApiProps) => {
  return (
    <div
      className={cn(
        "relative flex h-[460px] w-full max-w-[760px] items-end justify-center",
        className
      )}
    >
      {/* SVG Paths */}
      <svg
        fill="none"
        viewBox="0 0 200 100"
        className="absolute left-1/2 top-0 -translate-x-1/2"
        width="760"
        height="380"
      >
        <defs>
          <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={lightColor} stopOpacity="0.2" />
            <stop offset="50%" stopColor={lightColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor={lightColor} stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Static paths - starting from bottom of badges (y=18) and converging to top of pill (y=78) */}
        <g strokeWidth="0.5" stroke="url(#purpleGradient)">
          <path d="M 25 18 v 15 q 0 5 5 5 h 65 q 5 0 5 5 v 35" />
          <path d="M 68 18 v 12 q 0 5 5 5 h 22 q 5 0 5 5 v 38" />
          <path d="M 132 18 v 12 q 0 5 -5 5 h -22 q -5 0 -5 5 v 38" />
          <path d="M 175 18 v 15 q 0 5 -5 5 h -65 q -5 0 -5 5 v 35" />
        </g>

        {/* Animated Lights */}
        <g>
          <circle r="3" fill={lightColor} className="database db-light-1">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="3" fill={lightColor} className="database db-light-2">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              begin="0.5s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="3" fill={lightColor} className="database db-light-3">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              begin="1s"
              repeatCount="indefinite"
            />
          </circle>
          <circle r="3" fill={lightColor} className="database db-light-4">
            <animate
              attributeName="opacity"
              values="0;1;0"
              dur="4s"
              begin="1.5s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* Top badges - larger boxes */}
        <g>
          {[
            { x: 2, cx: 25, text: badgeTexts.first },
            { x: 42, cx: 68, text: badgeTexts.second },
            { x: 108, cx: 132, text: badgeTexts.third },
            { x: 152, cx: 175, text: badgeTexts.fourth },
          ].map((badge, index) => (
            <g key={index}>
              <rect
                x={badge.x}
                y="4"
                width="46"
                height="14"
                rx="4"
                fill="hsl(260 30% 12%)"
                stroke={lightColor}
                strokeWidth="0.4"
                strokeOpacity="0.6"
              />
              <text
                x={badge.x + 23}
                y="13"
                textAnchor="middle"
                fill="hsl(270 20% 90%)"
                fontSize="4.5"
                fontWeight="500"
              >
                {badge.text}
              </text>
              {/* Connection dot at bottom of badge */}
              <circle cx={badge.cx} cy="18" r="1.5" fill={lightColor} fillOpacity="0.7" />
            </g>
          ))}
        </g>

        {/* Convergence point dot */}
        <circle cx="100" cy="78" r="2.5" fill={lightColor} />
      </svg>

      {/* Main Pill Box - "Uso de dados" */}
      <motion.div
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
        <span className="relative text-base font-semibold text-primary">
          {circleText}
        </span>
      </motion.div>
    </div>
  );
};

export default DatabaseWithRestApi;
