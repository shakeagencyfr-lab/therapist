// Shared Framer Motion presets so every animation on the page reads as one motion language.
import type { Transition, Variants } from "framer-motion";

export const SPRING_SNAP: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 35,
  mass: 0.8,
};

export const SPRING_SMOOTH: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 28,
  mass: 1,
};

export const SPRING_SLOW: Transition = {
  type: "spring",
  stiffness: 180,
  damping: 24,
  mass: 1.2,
};

export const TWEEN_SOFT: Transition = {
  type: "tween",
  duration: 0.5,
  ease: [0.22, 1, 0.36, 1],
};

// Reusable entrance variants
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: SPRING_SMOOTH },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6, ease: "easeOut" } },
};

export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: SPRING_SMOOTH },
};

// Parent containers that stagger their direct children with `variants={staggerContainer()}`
export const staggerContainer = (
  stagger = 0.07,
  delayChildren = 0,
): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

// Shared viewport options for whileInView triggers
export const VIEWPORT_ONCE = { once: true, amount: 0.2 } as const;
