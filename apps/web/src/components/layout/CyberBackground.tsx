"use client";

export function CyberBackground() {
  return (
    <div className="cyber-bg" aria-hidden="true">
      <div className="cyber-gradient-layer cyber-gradient-layer-1">
        <div className="cyber-gradient-band cyber-gradient-band-1" />
      </div>
      <div className="cyber-gradient-layer cyber-gradient-layer-2">
        <div className="cyber-gradient-band cyber-gradient-band-2" />
      </div>
      <div className="cyber-gradient-layer cyber-gradient-layer-3">
        <div className="cyber-gradient-band cyber-gradient-band-3" />
      </div>
      <div className="cyber-center-mask" />
      <div className="cyber-glass-vignette" />
    </div>
  );
}
