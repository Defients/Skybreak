import { useState } from "react";
import { RULES_INDEX, searchRules, RULE_KEYWORDS } from "../../data/rulesIndex";
import { getStarsImage } from "../../assets/assetRegistry";

interface Props {
  onBack: () => void;
}

export function RulesReference({ onBack }: Props) {
  const [query, setQuery] = useState("");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  const results = query ? searchRules(query) : RULES_INDEX;
  const selected = selectedSection ? RULES_INDEX.find(r => r.id === selectedSection) : null;

  const starsUrl = getStarsImage();

  return (
    <div className="space-y-4 relative">
      {starsUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${starsUrl})`, opacity: 0.08 }}
        />
      )}
      <div className="relative z-10 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display gold-text">📖 Rules Reference</h2>
      </div>

      <div className="glass-card p-4">
        <input
          className="input w-full"
          placeholder="Search rules..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5 mt-3">
          {RULE_KEYWORDS.slice(0, 15).map((kw) => (
            <button
              key={kw}
              className="text-xs px-2.5 py-1 rounded-lg bg-spire-bg border border-spire-border text-spire-muted hover:text-spire-white hover:border-spire-muted transition-all duration-200"
              onClick={() => setQuery(kw)}
            >
              {kw}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-2 max-h-[600px] overflow-y-auto">
          {results.map((rule) => (
            <button
              key={rule.id}
              className={`w-full text-left p-3 rounded-lg text-sm transition-all duration-200 ${
                selectedSection === rule.id
                  ? "bg-spire-accent/20 border border-spire-accent shadow-sm"
                  : "bg-spire-bg border border-spire-border hover:border-spire-muted"
              }`}
              onClick={() => setSelectedSection(rule.id)}
            >
              <div className="text-spire-gold text-xs font-medium">§{rule.section}</div>
              <div className="text-spire-white mt-0.5">{rule.title}</div>
            </button>
          ))}
          {results.length === 0 && (
            <div className="text-center text-spire-muted text-sm py-4">No results</div>
          )}
        </div>

        <div className="lg:col-span-8">
          {selected ? (
            <div className="glass-card p-6">
              <div className="text-xs text-spire-gold font-medium mb-1">Section {selected.section}</div>
              <h3 className="text-lg font-display gold-text mb-3">{selected.title}</h3>
              <p className="text-sm text-spire-white leading-relaxed">{selected.content}</p>
              <div className="flex flex-wrap gap-1.5 mt-4">
                {selected.keywords.map((kw) => (
                  <span key={kw} className="text-xs px-2.5 py-1 rounded-lg bg-spire-bg border border-spire-border text-spire-muted">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="glass-card p-6 text-center text-spire-muted">
              Select a rule section to view details
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
