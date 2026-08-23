import deffyLogo from "../../../assets/deffy.png";
import { useAudio } from "../../audio/useAudio";
import { useIsMobile } from "../../hooks/useIsMobile";

export function DeffyBadge({ isHomePage }: { isHomePage: boolean }) {
  const { playSfx } = useAudio();
  const { isMobile } = useIsMobile();

  const isBackgroundOnly = isMobile && !isHomePage;

  if (isBackgroundOnly) {
    return (
      <div className="mt-2 pointer-events-none inline-block">
        <img
          src={deffyLogo}
          alt="deffy.me"
          className="w-20 h-20 object-contain opacity-30"
        />
      </div>
    );
  }

  return (
    <a
      href="https://deffy.me"
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-block mt-2 transition-all duration-300"
      onClick={() => playSfx("ui", "button_click")}
    >
      <div className="relative group/deffy">
        <img
          src={deffyLogo}
          alt="deffy.me"
          className="w-20 h-20 object-contain transition-all duration-300 opacity-[0.67] group-hover/deffy:opacity-85 group-hover/deffy:drop-shadow-[0_0_16px_rgba(34,211,238,0.6)]"
        />
        <div className="absolute bottom-full right-0 mb-2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
          <div className="glass-panel rounded-lg px-4 py-2.5 border border-spire-accent/30 shadow-panel">
            <div className="text-sm font-medium text-spire-accent tracking-wide">View the creator's personal website</div>
          </div>
        </div>
      </div>
    </a>
  );
}
