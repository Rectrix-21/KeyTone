"use client";

import { useEffect, useRef } from "react";

export function CyberBackground() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pointerQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!pointerQuery.matches || motionQuery.matches) {
      return;
    }

    let frame: number | null = null;
    let latestX = 50;
    let latestY = 50;

    const applyPointer = () => {
      frame = null;
      glowRef.current?.style.setProperty("--pointer-x", `${latestX}%`);
      glowRef.current?.style.setProperty("--pointer-y", `${latestY}%`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      latestX = (event.clientX / window.innerWidth) * 100;
      latestY = (event.clientY / window.innerHeight) * 100;
      if (frame === null) {
        frame = window.requestAnimationFrame(applyPointer);
      }
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

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
      <div ref={glowRef} className="cyber-pointer-glow" />
      <div className="cyber-center-mask" />
      <div className="cyber-glass-vignette" />
    </div>
  );
}
