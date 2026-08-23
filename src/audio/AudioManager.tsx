import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import {
  getMusicTrack,
  getSound,
  type MusicTrackName,
  type SfxCategory,
} from "../assets/assetRegistry";
import { AudioCtx } from "./AudioContext";

const MUTE_KEY = "skyward_muted";
const MUSIC_MUTE_KEY = "skyward_music_muted";
const SFX_MUTE_KEY = "skyward_sfx_muted";
const VOLUME_KEY = "skyward_volume";

export function AudioProvider({ children }: { children: ReactNode }) {
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const currentTrackRef = useRef<string | null>(null);
  const activeSfxRef = useRef<Set<HTMLAudioElement>>(new Set());
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isMusicMuted, setIsMusicMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUSIC_MUTE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isSfxMuted, setIsSfxMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SFX_MUTE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [isReady, setIsReady] = useState(false);
  const [volume, setVolumeState] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(VOLUME_KEY);
      return stored !== null ? parseFloat(stored) : 0.35;
    } catch {
      return 0.35;
    }
  });
  const userInteractedRef = useRef(false);
  const fadeRafRef = useRef<number | null>(null);

  // Create the music audio element once
  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = volume;
    musicRef.current = audio;
    setIsReady(true);

    return () => {
      audio.pause();
      musicRef.current = null;
    };
  }, []);

  // Update muted state on the music element
  useEffect(() => {
    if (musicRef.current) {
      const musicShouldBeMuted = isMuted || isMusicMuted;
      musicRef.current.muted = musicShouldBeMuted;
      if (!musicShouldBeMuted) {
        musicRef.current.volume = volume;
      }
    }
    try {
      localStorage.setItem(MUTE_KEY, String(isMuted));
    } catch {
      /* ignore */
    }
  }, [isMuted, isMusicMuted, volume]);

  // Mark user interaction so we can start audio
  useEffect(() => {
    const onInteract = () => {
      userInteractedRef.current = true;
      // If music was queued but couldn't play, try again
      if (musicRef.current && currentTrackRef.current) {
        musicRef.current.play().catch(() => {});
      }
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
    window.addEventListener("click", onInteract);
    window.addEventListener("keydown", onInteract);
    return () => {
      window.removeEventListener("click", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, []);

  const playMusic = useCallback(
    (track: MusicTrackName) => {
      const url = getMusicTrack(track);
      if (!url || !musicRef.current) return;

      // Don't restart if same track
      if (currentTrackRef.current === track && !musicRef.current.paused) return;

      currentTrackRef.current = track;

      // Cancel any in-progress fade
      if (fadeRafRef.current !== null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }

      const musicShouldBeMuted = isMuted || isMusicMuted;

      // Fade out current, then switch
      const audio = musicRef.current;
      const fadeStep = () => {
        if (audio.volume > 0.05) {
          audio.volume -= 0.03;
          fadeRafRef.current = requestAnimationFrame(fadeStep);
        } else {
          fadeRafRef.current = null;
          audio.src = url;
          audio.volume = musicShouldBeMuted ? 0 : volume;
          audio.play().catch(() => {
            // Autoplay blocked — will retry on user interaction
          });
          // Fade in
          const fadeIn = () => {
            const target = musicShouldBeMuted ? 0 : volume;
            if (audio.volume < target - 0.01) {
              audio.volume = Math.min(audio.volume + 0.03, target);
              fadeRafRef.current = requestAnimationFrame(fadeIn);
            } else {
              fadeRafRef.current = null;
            }
          };
          fadeIn();
        }
      };
      if (audio.src) {
        fadeStep();
      } else {
        audio.src = url;
          audio.volume = musicShouldBeMuted ? 0 : volume;
          audio.play().catch(() => {});
      }
    },
    [isMuted, isMusicMuted, volume]
  );

  const stopMusic = useCallback(() => {
    if (fadeRafRef.current !== null) {
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = null;
    }
    if (musicRef.current) {
      musicRef.current.pause();
      musicRef.current.src = "";
      currentTrackRef.current = null;
    }
  }, []);

  const pauseMusic = useCallback(() => {
    if (musicRef.current && !musicRef.current.paused) {
      musicRef.current.pause();
    }
  }, []);

  const resumeMusic = useCallback(() => {
    if (musicRef.current && currentTrackRef.current && musicRef.current.paused) {
      musicRef.current.play().catch(() => {});
    }
  }, []);

  const playSfx = useCallback(
    (category: SfxCategory, name: string) => {
      if (isMuted || isSfxMuted) return;
      const url = getSound(category, name);
      if (!url) return;
      const sfx = new Audio(url);
      sfx.volume = Math.min(1, volume * 1.4); // SFX slightly louder than music
      activeSfxRef.current.add(sfx);
      sfx.play().catch(() => {});
      // Clean up after playback
      sfx.addEventListener("ended", () => {
        activeSfxRef.current.delete(sfx);
        sfx.remove();
      });
    },
    [isMuted, isSfxMuted, volume]
  );

  const stopAllSfx = useCallback(() => {
    activeSfxRef.current.forEach((sfx) => {
      if (!sfx.paused) {
        const currentVol = sfx.volume;
        const fadeStart = performance.now();
        const fadeDuration = 200; // sharp fade out in 200ms
        const fade = () => {
          const elapsed = performance.now() - fadeStart;
          if (elapsed >= fadeDuration) {
            sfx.pause();
            sfx.volume = 0;
            activeSfxRef.current.delete(sfx);
            sfx.remove();
          } else {
            sfx.volume = currentVol * (1 - elapsed / fadeDuration);
            requestAnimationFrame(fade);
          }
        };
        fade();
      } else {
        activeSfxRef.current.delete(sfx);
        sfx.remove();
      }
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    if (musicRef.current && !isMuted) {
      musicRef.current.volume = clamped;
    }
    try {
      localStorage.setItem(VOLUME_KEY, String(clamped));
    } catch {
      /* ignore */
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const toggleMusicMute = useCallback(() => {
    setIsMusicMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUSIC_MUTE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const toggleSfxMute = useCallback(() => {
    setIsSfxMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SFX_MUTE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <AudioCtx.Provider
      value={{ playMusic, stopMusic, stopAllSfx, pauseMusic, resumeMusic, playSfx, toggleMute, toggleMusicMute, toggleSfxMute, isMuted, isMusicMuted, isSfxMuted, isReady, volume, setVolume }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

