import { useEffect } from "react";
import { useGameStore } from "../../app/gameStore";
import { getLivingHeroes, getDeadHeroes } from "../../engine/rulesEngine";
import { suggestRestChoice } from "../../engine/aiAdvisor";
import { useAudio } from "../../audio/useAudio";
import { getRoomImage, getEffectImage } from "../../assets/assetRegistry";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { HeroIcon } from "../ui/HeroIcon";

interface Props {
  onBack: () => void;
}

const REST_OPTIONS = [
  {
    icon: "💚",
    title: "Full Heal",
    desc: "All living Heroes restored to max HP",
    detail: "A soothing wave of restorative energy washes over your party, closing wounds and replenishing vitality.",
    accentColor: "16, 185, 129",
    gradient: "from-emerald-900/20 via-green-900/10 to-spire-bg/40",
    iconBg: "bg-emerald-500/15",
  },
  {
    icon: "🔄",
    title: "Revive + Heal",
    desc: "Revive a fallen Hero at 50% HP. All others fully healed.",
    detail: "Channel the heart room's power to call a fallen comrade back from the brink, restored to half strength.",
    accentColor: "34, 211, 238",
    gradient: "from-cyan-900/20 via-sky-900/10 to-spire-bg/40",
    iconBg: "bg-cyan-500/15",
  },
  {
    icon: "💰",
    title: "Gold Hoard",
    desc: "Roll 2d6 × 10 × tier for gold",
    detail: "Search the landing for hidden treasures. The higher you climb the Astrilith, the richer the rewards.",
    accentColor: "212, 175, 55",
    gradient: "from-amber-900/20 via-yellow-900/10 to-spire-bg/40",
    iconBg: "bg-amber-500/15",
  },
  {
    icon: "⬆️",
    title: "Max HP +2",
    desc: "All Heroes gain +2 max HP permanently",
    detail: "A permanent boost to your party's vitality. This enhancement carries forward through the entire run.",
    accentColor: "139, 92, 246",
    gradient: "from-fuchsia-900/20 via-purple-900/10 to-spire-bg/40",
    iconBg: "bg-fuchsia-500/15",
  },
];

export function RestView({ onBack }: Props) {
  const state = useGameStore((s) => s.state);
  const doRestChoice = useGameStore((s) => s.doRestChoice);
  const { playMusic, playSfx } = useAudio();

  useEffect(() => {
    playMusic(`tier${state?.spire.tier ?? 1}` as any);
  }, [playMusic, state?.spire.tier]);

  const restBg = getRoomImage("rest");
  const heartGlow = getEffectImage("heart_glow");

  const handleChoice = (choice: 1 | 2 | 3 | 4) => {
    playSfx("rooms", "heart_room_chime");
    doRestChoice(choice);
    onBack();
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Digit1" || e.code === "Numpad1") handleChoice(1);
      else if (e.code === "Digit2" || e.code === "Numpad2") handleChoice(2);
      else if (e.code === "Digit3" || e.code === "Numpad3") handleChoice(3);
      else if (e.code === "Digit4" || e.code === "Numpad4") handleChoice(4);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!state) return null;

  const living = getLivingHeroes(state);
  const dead = getDeadHeroes(state);
  const isCompanionMode = state.settings.mode === "companion";
  const restSuggestion = isCompanionMode ? suggestRestChoice(state) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in relative">
      {restBg && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${restBg})`, opacity: 0.15 }}
        />
      )}
      <div className="relative z-10 space-y-6">
      <div className="glass-panel p-4 sm:p-6 text-center relative overflow-hidden">
        {heartGlow && (
          <img src={heartGlow} alt="" className="absolute top-2 right-4 w-16 h-16 opacity-20 rounded-lg" />
        )}
        <div className="text-3xl mb-2">❤️</div>
        <h2 className="text-2xl font-display gold-text mb-2">Sanctuary Landing</h2>
        <p className="text-spire-muted text-sm">A moment of respite amidst the Astrilith's dangers. Choose one blessing for your party:</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {REST_OPTIONS.map((opt, i) => {
          const choiceNum = (i + 1) as 1 | 2 | 3 | 4;
          const isDisabled = (choiceNum === 2 && (dead.length === 0 || state.settings.difficulty === "hard")) || (choiceNum === 4 && state?.party?.maxHpBoostUsed);
          const isRecommended = isCompanionMode && restSuggestion?.choice === choiceNum;
          return (
            <button
              key={i}
              className={`group relative overflow-hidden text-left space-y-3 transition-all duration-300 hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed rounded-xl p-5
                bg-gradient-to-br ${opt.gradient} border border-spire-border/40 ${isRecommended ? "ring-2 ring-cyan-400/50" : ""}`}
              style={{ boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04)` }}
              onMouseEnter={(e) => { if (!isDisabled) { e.currentTarget.style.boxShadow = `0 0 24px rgba(${opt.accentColor}, 0.2), inset 0 1px 0 rgba(255,255,255,0.06)`; e.currentTarget.style.borderColor = `rgba(${opt.accentColor}, 0.4)`; } }}
              onMouseLeave={(e) => { e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.04)`; e.currentTarget.style.borderColor = `rgba(26, 26, 58, 0.4)`; }}
              onClick={() => handleChoice(choiceNum)}
              disabled={isDisabled}
            >
              {isRecommended && (
                <span className="absolute -top-2 left-3 text-[9px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-400/30 whitespace-nowrap z-10">💡 Recommended</span>
              )}
              {!isDisabled && (
                <kbd className="absolute top-2 right-2 w-5 h-5 flex items-center justify-center rounded text-[10px] font-mono font-bold bg-spire-bg/60 border border-spire-border/40 text-spire-muted/60 group-hover:text-spire-white group-hover:border-spire-accent/40 transition-colors z-10">{choiceNum}</kbd>
              )}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${opt.iconBg} flex items-center justify-center text-xl flex-shrink-0 border border-white/5`} style={{ textShadow: `0 0 12px rgba(${opt.accentColor}, 0.4)` }}>{opt.icon}</div>
                <h3 className="text-sm font-display font-bold tracking-wide" style={{ color: `rgb(${opt.accentColor})`, textShadow: `0 0 10px rgba(${opt.accentColor}, 0.3)` }}>{opt.title}</h3>
              </div>
              <p className="text-xs text-spire-white/80 leading-relaxed font-medium">{opt.desc}</p>
              <p className="text-[10px] text-spire-muted leading-relaxed italic border-t border-spire-border/20 pt-2">{opt.detail}</p>
              {choiceNum === 2 && dead.length > 0 && (
                <div className="text-[10px] text-cyan-400/70">
                  Will revive: <span className="font-medium">{dead[0].name}</span>
                </div>
              )}
              {choiceNum === 2 && dead.length === 0 && (
                <div className="text-[10px] text-spire-muted/50">No dead Heroes to revive</div>
              )}
              {choiceNum === 2 && state.settings.difficulty === "hard" && <div className="text-[10px] text-spire-warning">Death is permanent in Hard mode.</div>}
              {choiceNum === 4 && state?.party?.maxHpBoostUsed && (
                <div className="text-[10px] text-spire-muted/50">Already used this run</div>
              )}
            </button>
          );
        })}
      </div>

      {isCompanionMode && restSuggestion && (
        <div className="glass-card p-3 text-center">
          <p className="text-[11px] text-cyan-300/80 italic">
            <span className="font-medium">💡 AI Advisor:</span> {restSuggestion.reason}
          </p>
        </div>
      )}

      <div className="glass-card p-4">
        <h3 className="section-heading mb-3">Party Status</h3>
        {living.map((h) => {
          const hpPct = (h.currentHp / h.maxHp) * 100;
          const classColor = CLASS_TEXT_COLORS[h.className] ?? "text-spire-white";
          const hpAnimClass = hpPct < 25 ? "hp-flash" : hpPct < 50 ? "hp-blink" : "";
          const hpColor = hpPct > 60 ? "from-emerald-500 to-green-400" : hpPct > 30 ? "from-amber-500 to-yellow-400" : "from-red-600 to-red-400";
          return (
            <div key={h.id} className="flex items-center gap-3 py-2.5 border-b border-spire-border/20 last:border-0">
              <HeroIcon hero={h} size={36} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-sm font-display font-medium truncate ${classColor}`}>{h.specialization}</span>
                  <span className="text-xs text-spire-white font-medium tabular-nums flex-shrink-0">{h.currentHp}/{h.maxHp}</span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-spire-muted/60 mb-1.5">{h.className}</div>
                <div className="hp-bar">
                  <div
                    className={`hp-bar-fill bg-gradient-to-r ${hpColor} ${hpAnimClass}`}
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {dead.map((h) => (
          <div key={h.id} className="flex items-center gap-3 py-2.5 opacity-40 grayscale">
            <HeroIcon hero={h} size={36} />
            <div className="flex-1 min-w-0">
              <span className="text-sm font-display font-medium truncate text-spire-muted">{h.specialization}</span>
              <div className="text-[10px] uppercase tracking-wider text-spire-muted/60">{h.className}</div>
            </div>
            <span className="text-spire-danger text-sm font-medium">Dead</span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
