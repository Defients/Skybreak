import { useEffect } from "react";
import { useGameStore } from "../../app/gameStore";
import { useAudio } from "../../audio/useAudio";
import { formatTier } from "../../utils/format";
import { getTierBackground, getHeroPortrait } from "../../assets/assetRegistry";

export function TierTransitionView() {
  const state = useGameStore((s) => s.state);
  const doConfirmTierTransition = useGameStore((s) => s.doConfirmTierTransition);
  const { playSfx, playMusic } = useAudio();

  const tier = state?.spire.tier ?? 1;
  const tierName = formatTier(tier);
  const bgUrl = getTierBackground(tier as 1 | 2 | 3);

  useEffect(() => {
    playSfx("ui", "transition");
    playMusic(tier === 1 ? "tier1" : tier === 2 ? "tier2" : "tier3");
  }, [playSfx, playMusic, tier]);

  if (!state) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in relative min-h-[60vh] flex flex-col items-center justify-center">
      {bgUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${bgUrl})`, opacity: 0.25 }}
        />
      )}
      <div className="relative z-10 space-y-6 text-center w-full">
        <div className="animate-scale-fade">
          <div className="text-4xl sm:text-6xl mb-3">🏔️</div>
          <h1 className="text-3xl sm:text-4xl font-display gold-text mb-2 drop-shadow-lg">
            Tier {tier}
          </h1>
          <p className="text-xl sm:text-2xl text-spire-white font-display mb-1">{tierName}</p>
          <p className="text-spire-muted text-sm mt-3 max-w-md mx-auto">
            The Astrilith shifts. Enemies grow stronger, but so do you. All Heroes have been
            fully healed and gained +2 Max HP. Merchant prices have increased by 50%.
          </p>
        </div>

        <div className="glass-card p-5 max-w-md mx-auto">
          <h2 className="text-sm font-display gold-text mb-3">Party Status</h2>
          <div className="space-y-2">
            {state.party.heroes.map((hero) => {
              const portraitUrl = getHeroPortrait(hero.className);
              return (
                <div
                  key={hero.id}
                  className={`flex items-center justify-between text-sm p-2.5 rounded-lg ${hero.alive ? "bg-spire-bg/50" : "bg-spire-danger/10"}`}
                >
                  <div className="flex items-center gap-2">
                    {portraitUrl && (
                      <img
                        src={portraitUrl}
                        alt={hero.className}
                        className="w-8 h-8 rounded-full object-cover border border-spire-border"
                      />
                    )}
                    <div>
                      <span className={hero.alive ? "text-spire-white font-medium" : "text-spire-danger font-medium"}>
                        {hero.alive ? "💚" : "💀"} {hero.name}
                      </span>
                      <span className="text-spire-muted ml-2 text-xs">{hero.className}</span>
                    </div>
                  </div>
                  <div className="text-spire-muted text-xs">
                    {hero.alive ? `${hero.currentHp}/${hero.maxHp} HP` : "Dead"}
                    {" · "}
                    {hero.weapon.name}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="text-xs text-spire-muted">
            Gold: <span className="text-spire-gold font-medium">{state.party.gold}g</span>
            {" · "}
            Rooms Cleared: <span className="text-spire-white font-medium">{state.stats.roomsCleared}</span>
          </div>
          <button
            className="btn-gold text-lg px-8 py-3"
            onClick={() => doConfirmTierTransition()}
          >
            ⚔️ Enter Tier {tier}
          </button>
        </div>
      </div>
    </div>
  );
}
