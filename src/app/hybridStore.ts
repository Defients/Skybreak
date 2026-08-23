import { create } from "zustand";

interface HybridStore {
  aiControlledHeroes: Record<string, boolean>;
  toggleHeroAI: (heroId: string) => void;
  setHeroAI: (heroId: string, enabled: boolean) => void;
  isAIControlled: (heroId: string) => boolean;
  resetAIControl: () => void;
}

export const useHybridStore = create<HybridStore>((set, get) => ({
  aiControlledHeroes: {},
  toggleHeroAI: (heroId) => {
    set((s) => ({
      aiControlledHeroes: {
        ...s.aiControlledHeroes,
        [heroId]: !s.aiControlledHeroes[heroId],
      },
    }));
  },
  setHeroAI: (heroId, enabled) => {
    set((s) => ({
      aiControlledHeroes: {
        ...s.aiControlledHeroes,
        [heroId]: enabled,
      },
    }));
  },
  isAIControlled: (heroId) => get().aiControlledHeroes[heroId] === true,
  resetAIControl: () => set({ aiControlledHeroes: {} }),
}));
