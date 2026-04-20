"use client";

import { useEffect, useRef, type CSSProperties } from "react";

export function CyberBackground() {
  const backgroundRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    if (reduceMotion || coarsePointer) {
      return;
    }

    let animationFrameId: number | null = null;
    let running = false;
    let lastFrameTs = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let pointerX = 0;
    let pointerY = 0;
    let scrollOffsetY = 0;

    const tick = (timestamp: number) => {
      if (!running) {
        return;
      }

      if (timestamp - lastFrameTs < 33) {
        animationFrameId = window.requestAnimationFrame(tick);
        return;
      }

      lastFrameTs = timestamp;
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;

      if (backgroundRef.current) {
        backgroundRef.current.style.setProperty(
          "--parallax-x",
          `${currentX.toFixed(2)}px`,
        );
        backgroundRef.current.style.setProperty(
          "--parallax-y",
          `${currentY.toFixed(2)}px`,
        );
      }

      animationFrameId = window.requestAnimationFrame(tick);
    };

    const start = () => {
      if (running) {
        return;
      }
      running = true;
      animationFrameId = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    const updateTargets = () => {
      targetX = pointerX * 16;
      targetY = pointerY * 12 + scrollOffsetY * 0.02;
    };

    const handleMouseMove = (event: globalThis.MouseEvent) => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      pointerX = (event.clientX / width - 0.5) * 2;
      pointerY = (event.clientY / height - 0.5) * 2;
      updateTargets();
    };

    const handleScroll = () => {
      scrollOffsetY = Math.min(window.scrollY, 1400);
      updateTargets();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };

    updateTargets();
    start();
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stop();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return (
    <div
      ref={backgroundRef}
      className="cyber-bg"
      aria-hidden="true"
      style={
        {
          "--parallax-x": "0px",
          "--parallax-y": "0px",
        } as CSSProperties
      }
    >
      <div className="cyber-blob-layer cyber-blob-layer-1">
        <div className="cyber-blob cyber-blob-1" />
      </div>
      <div className="cyber-blob-layer cyber-blob-layer-2">
        <div className="cyber-blob cyber-blob-2" />
      </div>
      <div className="cyber-blob-layer cyber-blob-layer-3">
        <div className="cyber-blob cyber-blob-3" />
      </div>
      <div className="cyber-blob-layer cyber-blob-layer-4">
        <div className="cyber-blob cyber-blob-4" />
      </div>

      <div className="cyber-sweep cyber-sweep-1" />
      <div className="cyber-sweep cyber-sweep-2" />
      <div className="cyber-sweep cyber-sweep-3" />

      <div className="cyber-line cyber-line-h cyber-line-1" />
      <div className="cyber-line cyber-line-h cyber-line-2" />
      <div className="cyber-line cyber-line-v cyber-line-3" />
      <div className="cyber-line cyber-line-v cyber-line-4" />

      <div className="cyber-node cyber-node-1" />
      <div className="cyber-node cyber-node-2" />
      <div className="cyber-node cyber-node-3" />
      <div className="cyber-node cyber-node-4" />
      <div className="cyber-node cyber-node-5" />
      <div className="cyber-node cyber-node-6" />
    </div>
  );
}
