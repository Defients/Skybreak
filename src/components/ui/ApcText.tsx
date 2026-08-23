import { useState, useRef, useEffect, type ReactNode } from "react";

interface ApcTextProps {
  className?: string;
  children?: ReactNode;
}

export function ApcText({ className = "", children }: ApcTextProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const containerRef = useRef<HTMLSpanElement>(null);

  const handleEnter = () => {
    timeoutRef.current = window.setTimeout(() => setShowTooltip(true), 120);
  };

  const handleLeave = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setShowTooltip(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip((prev) => !prev);
  };

  useEffect(() => {
    if (!showTooltip) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("click", handler);
    document.addEventListener("touchstart", handler);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [showTooltip]);

  return (
    <span
      ref={containerRef}
      className={`relative inline-flex cursor-help ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <span
        className="font-semibold"
        style={{
          color: "#22d3ee",
          textShadow: "0 0 8px rgba(34, 211, 238, 0.25)",
        }}
      >
        {children || "APC"}
      </span>
      {showTooltip && (
        <span
          className="absolute z-[200] bottom-full left-1/2 -translate-x-1/2 mb-2 pointer-events-none animate-fade-in"
          style={{
            background: "linear-gradient(135deg, rgba(10, 10, 28, 0.97) 0%, rgba(5, 5, 16, 0.97) 100%)",
            border: "1px solid rgba(34, 211, 238, 0.25)",
            borderRadius: "0.625rem",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 16px rgba(34, 211, 238, 0.1)",
            backdropFilter: "blur(12px)",
            padding: "0.75rem 1rem",
            minWidth: "200px",
            maxWidth: "300px",
          }}
        >
          <div className="text-sm font-bold text-spire-white whitespace-nowrap">
            <span style={{ color: "#22d3ee" }}>A</span>ttached{" "}
            <span style={{ color: "#22d3ee" }}>P</span>eon{" "}
            <span style={{ color: "#22d3ee" }}>C</span>ard
          </div>
          <div className="text-[11px] text-spire-white/70 leading-relaxed">
            A Peon card (ranked 2–10) assigned to a Hero or Monster. When a flipped card's rank matches an APC's rank, it triggers a match and activates abilities.
          </div>
        </span>
      )}
    </span>
  );
}
