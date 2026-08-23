import { useContext } from "react";
import { AudioCtx, type AudioContextValue } from "./AudioContext";

export function useAudio(): AudioContextValue {
  const ctx = useContext(AudioCtx);
  if (!ctx) {
    return {
      playMusic: () => {},
      stopMusic: () => {},
      stopAllSfx: () => {},
      pauseMusic: () => {},
      resumeMusic: () => {},
      playSfx: () => {},
      toggleMute: () => {},
      toggleMusicMute: () => {},
      toggleSfxMute: () => {},
      isMuted: false,
      isMusicMuted: false,
      isSfxMuted: false,
      isReady: false,
      volume: 0.35,
      setVolume: () => {},
    };
  }
  return ctx;
}
