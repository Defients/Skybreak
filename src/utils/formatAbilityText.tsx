import React from "react";

export function formatAbilityText(text: string): React.ReactNode {
  const parts = text.split(/(damage|heals?|healed|HP|APC|\d+|[–-])/gi);
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (lower === "damage") {
      return <span key={i} className="text-orange-400 font-medium">dmg</span>;
    }
    if (lower === "heal" || lower === "heals" || lower === "healed") {
      return <span key={i} className="text-green-400 font-medium">{part}</span>;
    }
    if (lower === "hp") {
      return <span key={i} className="text-spire-white/80 font-medium">HP</span>;
    }
    if (lower === "apc") {
      return <span key={i} className="font-bold text-spire-accent">APC</span>;
    }
    if (/^\d+$/.test(part)) {
      const num = parseInt(part);
      const prevPart = (parts[i - 1] ?? "").toLowerCase();
      const nextPart = (parts[i + 1] ?? "").toLowerCase();
      const prevPrev = (parts[i - 2] ?? "").toLowerCase();
      const nextNext = (parts[i + 2] ?? "").toLowerCase();

      const isRoll =
        /roll|result|on/i.test(prevPart) ||
        /roll|result/i.test(prevPrev) ||
        /to|on/i.test(nextPart) ||
        (num >= 1 && num <= 6 && /–|-/.test(nextPart)) ||
        (num >= 1 && num <= 6 && /–|-/.test(prevPart));

      const isDamageAmount =
        /dmg|damage/i.test(prevPart) || /dmg|damage/i.test(nextPart) ||
        /dmg|damage/i.test(prevPrev) || /dmg|damage/i.test(nextNext);

      const isHealAmount =
        /heal/i.test(prevPart) || /heal/i.test(nextPart) ||
        /heal/i.test(prevPrev) || /heal/i.test(nextNext);

      if (isRoll && !isDamageAmount && !isHealAmount) {
        const colorClass =
          num >= 6 ? "text-amber-300" :
          num >= 5 ? "text-yellow-200" :
          num >= 4 ? "text-spire-white" :
          num >= 3 ? "text-spire-muted" :
          "text-spire-muted/70";
        const weight = num >= 6 ? "font-extrabold" : "font-bold";
        return <span key={i} className={`${weight} ${colorClass}`}>{part}</span>;
      }

      if (isDamageAmount) {
        const colorClass =
          num >= 5 ? "text-red-400" :
          num >= 3 ? "text-orange-400" :
          "text-orange-400/70";
        return <span key={i} className={`font-bold ${colorClass}`}>{part}</span>;
      }

      if (isHealAmount) {
        const colorClass =
          num >= 4 ? "text-green-300" :
          num >= 2 ? "text-green-400" :
          "text-green-500";
        return <span key={i} className={`font-bold ${colorClass}`}>{part}</span>;
      }

      // Default: generic number
      return <span key={i} className="font-bold text-spire-white">{part}</span>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
