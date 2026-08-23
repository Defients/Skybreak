import { useEffect, useState } from "react";

export type CombatTransitionType = "enter" | "exit" | null;

interface CombatTransitionProps {
  type: CombatTransitionType;
  onDone: () => void;
}

export function CombatTransition({ type, onDone }: CombatTransitionProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!type) return;
    const duration = type === "enter" ? 600 : 700;
    const timer = setTimeout(() => {
      setVisible(false);
      onDone();
    }, duration);
    return () => clearTimeout(timer);
  }, [type, onDone]);

  if (!type || !visible) return null;

  if (type === "enter") {
    return (
      <div className="combat-transition-overlay">
        <div className="combat-enter-vignette" />
        <div className="combat-enter-sweep" />
        <div className="combat-enter-glow" />
      </div>
    );
  }

  return (
    <div className="combat-transition-overlay">
      <div className="combat-exit-fade" />
      <div className="combat-exit-wave" />
      <div className="combat-exit-wave-2" />
      <div className="combat-exit-glow" />
    </div>
  );
}
