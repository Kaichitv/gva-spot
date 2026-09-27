"use client";

import { useEffect } from "react";

/** Enregistre le service worker (PWA) côté client. */
export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silencieux : la PWA reste optionnelle */
      });
    };
    // L'effet s'exécute souvent APRÈS l'événement load (hydratation) : dans ce
    // cas on enregistre tout de suite, sinon le SW ne le serait jamais.
    if (document.readyState === "complete") {
      onLoad();
      return;
    }
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
