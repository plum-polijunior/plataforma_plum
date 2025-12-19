"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MovingBorderButton } from "./moving-border";

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
  const items = [
    badgeTexts.first,
    badgeTexts.second,
    badgeTexts.third,
    badgeTexts.fourth,
  ];

  return (
    <div
      className={cn(
        "relative flex flex-col items-center w-full max-w-[900px] mx-auto",
        className
      )}
    >
      {/* Grid of categories */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 w-full mb-12">
        {items.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.1 }}
            viewport={{ once: true }}
            className="group relative"
          >
            <div
              className="relative flex items-center justify-center px-6 py-5 rounded-xl border border-primary/30 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/60 hover:bg-card/80"
              style={{
                boxShadow: `0 0 20px ${lightColor}08`,
              }}
            >
              {/* Subtle glow on hover */}
              <div
                className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{
                  background: `radial-gradient(ellipse at center, ${lightColor}08, transparent 70%)`,
                }}
              />
              
              {/* Small accent dot */}
              <div
                className="absolute top-3 left-3 w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: lightColor,
                  boxShadow: `0 0 6px ${lightColor}60`,
                }}
              />
              
              <span className="relative text-sm lg:text-base font-medium text-foreground text-center">
                {item}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Vertical line connector */}
      <div className="relative flex flex-col items-center">
        {/* Animated line */}
        <motion.div
          initial={{ height: 0 }}
          whileInView={{ height: 48 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          viewport={{ once: true }}
          className="w-px"
          style={{
            background: `linear-gradient(to bottom, ${lightColor}50, ${lightColor}80)`,
          }}
        />
        
        {/* Junction dot */}
        <motion.div
          initial={{ scale: 0 }}
          whileInView={{ scale: 1 }}
          transition={{ duration: 0.3, delay: 0.8 }}
          viewport={{ once: true }}
          className="w-2.5 h-2.5 rounded-full my-2"
          style={{
            backgroundColor: lightColor,
            boxShadow: `0 0 12px ${lightColor}60`,
          }}
        />
        
        {/* Line to pill */}
        <motion.div
          initial={{ height: 0 }}
          whileInView={{ height: 32 }}
          transition={{ duration: 0.4, delay: 1 }}
          viewport={{ once: true }}
          className="w-px"
          style={{
            background: `linear-gradient(to bottom, ${lightColor}80, ${lightColor}50)`,
          }}
        />
      </div>

      {/* Main Pill Box - "Uso de dados" with Moving Border */}
      <MovingBorderButton
        as="div"
        borderRadius="9999px"
        duration={3000}
        containerClassName="mt-2"
        className="px-8 py-4"
      >
        <span className="text-sm lg:text-base font-semibold text-primary">
          {circleText}
        </span>
      </MovingBorderButton>
    </div>
  );
};

export default DatabaseWithRestApi;
