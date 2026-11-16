/* LexiPop - hero banner: "LexiPop by NexaSecure AI" */
interface BannerProps {
  compact?: boolean;
  onClose?: () => void;
  pinned?: boolean;
  onTogglePin?: () => void;
}

export function Banner({ compact = false, onClose, pinned = false, onTogglePin }: BannerProps) {
  return (
    <div className={`lx-banner ${compact ? "lx-banner--compact" : ""}`}>
      <div className="lx-aurora lx-aurora-1" />
      <div className="lx-aurora lx-aurora-2" />
      <div className="lx-aurora lx-aurora-3" />
      <div className="lx-grid" />
      <div className="lx-banner-inner">
        <div className="lx-orb">
          <span>L</span>
        </div>
        <div className="lx-text">
          <div className="lx-wordmark">LexiPop</div>
          <div className="lx-tagline">
            <span className="lx-by">by</span>
            <span className="lx-brand">NexaSecure AI</span>
          </div>
        </div>
        {!compact && (
          <div className="lx-hint">
            <kbd>Ctrl</kbd> + <kbd>Right-click</kbd> any word
          </div>
        )}
        {onTogglePin && (
          <button
            type="button"
            className={`lx-pin no-drag ${pinned ? "lx-pin--on" : ""}`}
            onClick={onTogglePin}
            title={pinned ? "Unpin (popup will hide when the mouse leaves)" : "Pin (keep popup open)"}
            aria-label="Pin popup"
          >
            &#128204;
          </button>
        )}
        {onClose && (
          <button type="button" className="lx-close no-drag" onClick={onClose} title="Close (Esc)" aria-label="Close">
            &#10005;
          </button>
        )}
      </div>
    </div>
  );
}
