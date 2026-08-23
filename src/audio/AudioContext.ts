import { createContext } from "react";
import { type MusicTrackName, type SfxCategory } from "../assets/assetRegistry";

export interface AudioContextValue {
  playMusic: (track: MusicTrackName) => void;
  stopMusic: () => void;
  stopAllSfx: () => void;
  pauseMusic: () => void;
  resumeMusic: () => void;
  playSfx: (category: SfxCategory, name: string) => void;
  toggleMute: () => void;
  toggleMusicMute: () => void;
  toggleSfxMute: () => void;
  isMuted: boolean;
  isMusicMuted: boolean;
  isSfxMuted: boolean;
  isReady: boolean;
  volume: number;
  setVolume: (v: number) => void;
}

export const AudioCtx = createContext<AudioContextValue | null>(null);
