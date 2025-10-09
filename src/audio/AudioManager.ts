// src/audio/AudioManager.ts
// Minimal audio manager using HTMLAudioElement. No external libs.
// Lazy init on first user gesture + auto-start main BGM if idle.
// Comments: English only.

function makeAudio(src: string, loop = false, volume = 1): HTMLAudioElement {
  const a = new Audio(src);
  a.loop = loop;
  a.preload = "auto";
  a.volume = volume;
  a.crossOrigin = "anonymous";
  return a;
}

type BgmMode = "main" | "disaster";

class AudioManager {
  private inited = false;
  private muted = false;

  private bgmMain: HTMLAudioElement | null = null;
  private bgmDisaster: HTMLAudioElement | null = null;
  private sfxEat: HTMLAudioElement | null = null;

  private currentBgm: HTMLAudioElement | null = null;
  private currentMode: BgmMode = "main";

  // --- State ---
  isInited() {
    return this.inited;
  }
  isMuted() {
    return this.muted;
  }

  // --- Boot ---
  init() {
    if (this.inited) {
      console.info("[Audio] init() skipped: already inited");
      return;
    }
    console.info("[Audio] init(): creating audio elements");

    // NOTE: these paths assume files in /public/audio/*
    this.bgmMain = makeAudio("/audio/bgm_main.mp3", true, 0.1);
    this.bgmDisaster = makeAudio("/audio/bgm_disaster.mp3", true, 0.05);
    this.sfxEat = makeAudio("/audio/sfx_eat.mp3", false, 0.05);

    // Apply pending mute state
    this.setMuted(this.muted);

    this.inited = true;
  }

  // --- BGM ---
  async playBgm(mode: BgmMode) {
    if (!this.inited) this.init();

    this.currentMode = mode;
    const next = mode === "main" ? this.bgmMain : this.bgmDisaster;
    if (!next) {
      console.warn("[Audio] playBgm(): target track not created");
      return;
    }

    // Stop previous
    if (this.currentBgm && this.currentBgm !== next) {
      try {
        this.currentBgm.pause();
        this.currentBgm.currentTime = 0;
      } catch {}
    }

    this.currentBgm = next;

    // Try to play; browsers may require user gesture (handled by AudioProvider)
    try {
      await next.play();
      console.info(`[Audio] BGM playing: ${mode}`);
    } catch (e) {
      console.warn("[Audio] BGM play blocked/fail", e);
    }
  }

  // --- Mute ---
  setMuted(m: boolean) {
    this.muted = m;
    const all = [this.bgmMain, this.bgmDisaster, this.sfxEat];
    for (const a of all) if (a) a.muted = m;
  }

  // --- SFX ---
  async playSfx(key: "eat") {
    if (!this.inited) return;
    const a = key === "eat" ? this.sfxEat : null;
    if (!a) return;
    try {
      a.currentTime = 0;
      await a.play();
      console.info("[Audio] SFX play ok");
    } catch (e) {
      console.warn("[Audio] SFX play blocked/fail", e);
    }
  }

  // --- External helpers ---
  async setCatastrophe(on: boolean) {
    console.info("[Audio] setCatastrophe:", on);
    await this.playBgm(on ? "disaster" : "main");
  }
}

export const audio = new AudioManager();
