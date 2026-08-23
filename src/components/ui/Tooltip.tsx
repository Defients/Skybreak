import { useState, useRef, useId, type ReactNode } from "react";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  wrapperClassName?: string;
  wrapperStyle?: React.CSSProperties;
  popupStyle?: React.CSSProperties;
}

export function Tooltip({ content, children, side = "top", wrapperClassName = "", wrapperStyle, popupStyle }: TooltipProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);
  const tooltipId = useId();

  const handleEnter = () => {
    timeoutRef.current = window.setTimeout(() => setShow(true), 150);
  };

  const handleLeave = () => {
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    setShow(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShow(prev => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
      e.preventDefault();
      setShow(e.key === "Escape" ? false : !show);
    }
  };

  const sideClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span
      className={`inline-flex ${wrapperClassName || "relative"}`}
      style={wrapperStyle}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-describedby={show ? tooltipId : undefined}
      aria-expanded={show}
    >
      {children}
      {show && (
        <span
          id={tooltipId}
          role="tooltip"
          className={`absolute z-[200] ${sideClasses[side]} pointer-events-auto animate-fade-in`}
          style={{
            background: "linear-gradient(135deg, rgba(10, 10, 28, 0.97) 0%, rgba(5, 5, 16, 0.97) 100%)",
            border: "1px solid rgba(34, 211, 238, 0.25)",
            borderRadius: "0.5rem",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5), 0 0 12px rgba(34, 211, 238, 0.08)",
            backdropFilter: "blur(12px)",
            padding: "0.625rem 0.875rem",
            minWidth: "180px",
            maxWidth: "280px",
            ...popupStyle,
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
