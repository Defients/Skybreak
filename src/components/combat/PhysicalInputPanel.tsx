/**
 * Physical Table Bridge — UI for entering real card flips and die rolls.
 *
 * When physical mode is enabled, this panel replaces automatic RNG with
 * player-entered physical inputs. The player flips real cards and rolls
 * real dice, then enters the results here. The values are injected into
 * the RngEngine via the store's physical action methods.
 */

import { useState } from "react";
import type { Card } from "../../types/cards";

const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
const SUIT_SYMBOLS: Record<string, string> = {
  clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠",
};
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10"];

interface PhysicalInputPanelProps {
  /** Who is acting — hero name or "Monster" */
  actorName: string;
  /** Callback when the player submits physical inputs */
  onSubmit: (cards: Card[], rolls: number[]) => void;
  /** Callback to skip physical input and use RNG (fallback) */
  onSkip?: () => void;
}

export function PhysicalInputPanel({ actorName, onSubmit, onSkip }: PhysicalInputPanelProps) {
  const [card1Suit, setCard1Suit] = useState<string>("hearts");
  const [card1Rank, setCard1Rank] = useState<string>("5");
  const [card2Suit, setCard2Suit] = useState<string>("clubs");
  const [card2Rank, setCard2Rank] = useState<string>("3");
  const [actionRoll, setActionRoll] = useState<number>(4);
  const duplicate = card1Suit === card2Suit && card1Rank === card2Rank;

  const handleSubmit = () => {
    const cards: Card[] = [
      {
        id: `physical-${card1Rank}-${card1Suit}`,
        suit: card1Suit as Card["suit"],
        rank: card1Rank as Card["rank"],
        display: `${card1Rank}${SUIT_SYMBOLS[card1Suit]}`,
        deckType: "peon",
      },
      {
        id: `physical-${card2Rank}-${card2Suit}`,
        suit: card2Suit as Card["suit"],
        rank: card2Rank as Card["rank"],
        display: `${card2Rank}${SUIT_SYMBOLS[card2Suit]}`,
        deckType: "peon",
      },
    ];
    onSubmit(cards, [actionRoll]);
  };

  return (
    <div className="glass-panel rounded-xl border border-spire-accent/40 p-4 space-y-3">
      <div className="flex flex-wrap gap-1 items-center justify-between">
        <h3 className="text-sm font-bold text-spire-gold">Physical Table Input</h3>
        <span className="text-[10px] text-spire-muted uppercase tracking-wider">{actorName}'s turn</span>
      </div>
      <p className="text-xs text-spire-muted">Enter two Peon cards (2–10) and the first action die. Freeze, escape, rerolls, pets, and additional monster actions use seeded RNG.</p>
      {duplicate && <p role="alert" className="text-xs text-spire-danger">The two cards must be different.</p>}

      {/* Card flips */}
      <div className="space-y-2">
        <div className="text-[10px] text-spire-muted/70 uppercase tracking-wider">Flip 2 Peon Cards</div>
        <div className="grid grid-cols-1 gap-3">
          <CardInput label="Card 1" suit={card1Suit} rank={card1Rank} onSuitChange={setCard1Suit} onRankChange={setCard1Rank} />
          <CardInput label="Card 2" suit={card2Suit} rank={card2Rank} onSuitChange={setCard2Suit} onRankChange={setCard2Rank} />
        </div>
      </div>

      {/* Action die roll */}
      <div className="space-y-2">
        <div className="text-[10px] text-spire-muted/70 uppercase tracking-wider">Action Die (d6)</div>
        <div className="grid grid-cols-3 gap-1.5">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              aria-label={`Action die ${n}`}
              aria-pressed={actionRoll === n}
              className={`w-full min-h-[44px] rounded-lg font-mono font-bold text-sm transition-all ${
                actionRoll === n
                  ? "bg-spire-accent text-white scale-110 shadow-lg"
                  : "bg-spire-bg-deep text-spire-muted hover:text-spire-white border border-spire-border/40"
              }`}
              onClick={() => setActionRoll(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          className="flex-1 input bg-spire-accent/20 hover:bg-spire-accent/30 text-spire-white font-medium text-xs"
          onClick={handleSubmit}
          disabled={duplicate}
        >
          ✓ Confirm Physical Inputs
        </button>
        {onSkip && (
          <button
            className="input text-xs text-spire-muted hover:text-spire-white"
            onClick={onSkip}
          >
            Use RNG
          </button>
        )}
      </div>
    </div>
  );
}

function CardInput({
  label,
  suit,
  rank,
  onSuitChange,
  onRankChange,
}: {
  label: string;
  suit: string;
  rank: string;
  onSuitChange: (s: string) => void;
  onRankChange: (r: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] text-spire-muted">{label}</div>
      <div className="flex gap-1">
        {SUITS.map((s) => (
          <button
            key={s}
            aria-label={`${label} suit ${s}`}
            aria-pressed={suit === s}
            className={`flex-1 min-w-0 min-h-[44px] rounded text-sm transition-all ${
              suit === s
                ? "bg-spire-accent/30 border border-spire-accent scale-110"
                : "bg-spire-bg-deep border border-spire-border/30 hover:border-spire-border/60"
            }`}
            onClick={() => onSuitChange(s)}
            title={s}
          >
            {SUIT_SYMBOLS[s]}
          </button>
        ))}
      </div>
      <select
        aria-label={`${label} rank`}
        className="input text-xs w-full"
        value={rank}
        onChange={(e) => onRankChange(e.target.value)}
      >
        {RANKS.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );
}
