// src/audio/AudioManager.ts
// Minimal audio manager using HTMLAudioElement. No external libs.
// Adds conservative console logging for diagnosis; logic unchanged.

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

  init() {
    if (this.inited) {
      console.info("[Audio] init() skipped: already inited");
      return;
    }
    console.info("[Audio] init(): creating audio elements");
    this.bgmMain = makeAudio("/audio/bgm_main.mp3", true, 0.6);
    this.bgmDisaster = makeAudio("/audio/bgm_disaster.mp3", true, 0.65);
    this.sfxEat = makeAudio("/audio/sfx_eat.mp3", false, 1.0);

    // Apply current mute flag (in case user pressed Mute before init)
    this.setMuted(this.muted);

    this.inited = true;
    console.info("[Audio] init(): done");
  }

  isInited() {
    return this.inited;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.bgmMain) this.bgmMain.muted = m;
    if (this.bgmDisaster) this.bgmDisaster.muted = m;
    if (this.sfxEat) this.sfxEat.muted = m;
    if (this.currentBgm) this.currentBgm.muted = m;
    console.info("[Audio] setMuted:", m);
  }

  async playBgm(mode: BgmMode) {
    if (!this.inited) {
      console.warn("[Audio] playBgm() before init — ignoring (will start after first gesture)");
      return;
    }
    const next = mode === "disaster" ? this.bgmDisaster : this.bgmMain;
    if (!next) {
      console.warn("[Audio] playBgm(): target track is null for mode:", mode);
      return;
    }

    if (this.currentBgm === next && !next.paused) {
      // Already playing requested mode
      if (this.currentMode !== mode) {
        this.currentMode = mode;
      }
      console.info("[Audio] playBgm(): already on", mode);
      return;
    }

    console.info("[Audio] playBgm(): crossfading to", mode);
    await this.crossfade(next, 400);
    this.currentMode = mode;
  }

  private async crossfade(next: HTMLAudioElement, ms: number) {
    const prev = this.currentBgm;
    if (prev === next) return;

    const nextBaseVol = Math.max(0, Math.min(1, next.volume || 1));
    next.volume = 0;

    try {
      await next.play();
      console.info("[Audio] BGM play() ok");
    } catch (e) {
      console.warn("[Audio] BGM play blocked/fail", e);
    }

    this.currentBgm = next;

    const steps = 12;
    const dt = ms / steps;

    // Fade out previous
    if (prev) {
      const prevBaseVol = Math.max(0, Math.min(1, prev.volume || 1));
      for (let i = 0; i < steps; i++) {
        prev.volume = prevBaseVol * (1 - (i + 1) / steps);
        await new Promise((r) => setTimeout(r, dt));
      }
      prev.pause();
      prev.currentTime = 0;
      prev.volume = prevBaseVol;
      console.info("[Audio] previous BGM paused");
    }

    // Fade in next
    for (let i = 0; i < steps; i++) {
      next.volume = nextBaseVol * ((i + 1) / steps);
      await new Promise((r) => setTimeout(r, dt));
    }
    next.volume = nextBaseVol;
    console.info("[Audio] next BGM at volume", next.volume);
  }

  playEatSfx() {
    if (!this.inited) {
      console.warn("[Audio] playEatSfx() before init — ignoring");
      return;
    }
    if (!this.sfxEat) {
      console.warn("[Audio] playEatSfx(): sfx element missing");
      return;
    }
    // Allow overlapping by cloning for rapid taps
    const a = this.sfxEat.cloneNode(true) as HTMLAudioElement;
    a.volume = this.sfxEat.volume;
    a.muted = this.muted;
    a.preload = "auto";
    a.crossOrigin = "anonymous";
    a.play().then(
      () => console.info("[Audio] SFX play() ok"),
      (e) => console.warn("[Audio] SFX play blocked/fail", e)
    );
  }

  async setCatastrophe(on: boolean) {
    console.info("[Audio] setCatastrophe:", on);
    await this.playBgm(on ? "disaster" : "main");
  }
}

export const audio = new AudioManager();
