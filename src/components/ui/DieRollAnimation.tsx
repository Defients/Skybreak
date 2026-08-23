import { useState, useEffect, useRef } from "react";
import { getDiceImage } from "../../assets/assetRegistry";

interface InlineDieIconProps {
  finalValue: number;
}

const DICE_ICONS = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function randomFace(): number {
  return Math.floor(Math.random() * 6) + 1;
}

export function InlineDieIcon({ finalValue }: InlineDieIconProps) {
  const [currentFace, setCurrentFace] = useState(() => randomFace());
  const [settled, setSettled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setCurrentFace(randomFace());
    }, 70);

    timeoutRef.current = setTimeout(() => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setCurrentFace(finalValue);
      setSettled(true);
    }, 800);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [finalValue]);

  const displayValue = settled ? finalValue : currentFace;
  const dieUrl = getDiceImage(displayValue);
  const fallback = DICE_ICONS[displayValue - 1];

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 shrink-0 ${settled ? "animate-dice-settle-in" : ""}`}
    >
      {dieUrl ? (
        <img
          src={dieUrl}
          alt={`Die ${displayValue}`}
          className="w-6 h-6 object-contain"
        />
      ) : (
        <span className="text-base leading-none text-spire-gold">{fallback}</span>
      )}
    </span>
  );
}
