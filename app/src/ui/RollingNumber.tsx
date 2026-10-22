// From cult-ui `rolling-number` (spring-animated counter), trimmed to the props we use.
import { useEffect } from "react";
import { motion, useSpring, useTransform } from "motion/react";

export function RollingNumber({ value, format = (n: number) => n.toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const spring = useSpring(value, { mass: 0.8, stiffness: 75, damping: 15 });
  const display = useTransform(spring, (v) => format(Math.round(v)));
  useEffect(() => { spring.set(value); }, [spring, value]);
  return <motion.span className="font-mono tabular-nums">{display}</motion.span>;
}
