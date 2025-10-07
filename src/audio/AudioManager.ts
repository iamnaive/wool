// src/audio/AudioManager.ts
// Minimal audio manager using HTMLAudioElement. No external libs.

// Small helper to create an <audio> with common defaults.
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

  // Must be called from a user gesture (click/tap/keydown) once.
  init() {
    if (this.inited) return;
    this.bgmMain = makeAudio("/audio/bgm_main.mp3", true, 0.6);
    this.bgmDisaster = makeAudio("/audio/bgm_disaster.mp3", true, 0.65);
    this.sfxEat = makeAudio("/audio/sfx_eat.mp3", false, 1);

    this.inited = true;
  }

  isInited() {
    return this.inited;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.bgmMain) this.bgmMain.muted = m;
    if (this.bgmDisaster) this.bgmDisaster.muted = m;
    if (this.sfxEat) this.sfxEat.muted = m;
  }

  async playBgm(mode: BgmMode) {
    if (!this.inited) return;

    // Choose target track
    const next =
      mode === "disaster" ? this.bgmDisaster : this.bgmMain;

    if (!next) return;

    // If already on that track, ensure it is playing
    if (this.currentBgm === next && !next.paused) return;

    // Fade out current, fade in next (simple linear fade)
    await this.crossfade(next, 400); // 400ms quick crossfade
    this.currentMode = mode;
  }

  async crossfade(next: HTMLAudioElement, ms: number) {
    const prev = this.currentBgm;
    if (prev === next) return;

    // Start next at 0 volume then raise
    const nextBaseVol = next.volume;
    next.volume = 0;
    try { await next.play(); } catch { /* ignore */ }

    this.currentBgm = next;

    const steps = 12;
    const dt = ms / steps;

    // Fade out previous
    if (prev) {
      const prevBaseVol = prev.volume;
      for (let i = 0; i < steps; i++) {
        prev.volume = prevBaseVol * (1 - (i + 1) / steps);
        await new Promise(r => setTimeout(r, dt));
      }
      prev.pause();
      prev.currentTime = 0;
      prev.volume = prevBaseVol;
    }

    // Fade in next
    for (let i = 0; i < steps; i++) {
      next.volume = nextBaseVol * ((i + 1) / steps);
      await new Promise(r => setTimeout(r, dt));
    }
    next.volume = nextBaseVol;
  }

  playEatSfx() {
    if (!this.inited || !this.sfxEat) return;
    // Allow overlapping by cloning for very rapid taps
    const a = this.sfxEat.cloneNode(true) as HTMLAudioElement;
    a.volume = this.sfxEat.volume;
    a.muted = this.muted;
    a.play().catch(() => {});
  }

  // Public helpers for your game:
  async setCatastrophe(on: boolean) {
    await this.playBgm(on ? "disaster" : "main");
  }
}

export const audio = new AudioManager();
