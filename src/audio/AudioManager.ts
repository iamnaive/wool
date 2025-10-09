// src/audio/AudioManager.ts
// Minimal audio manager using HTMLAudioElement. No external libs.
// Lazy init on first user gesture + auto-start main BGM if idle.

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
    this.bgmMain = makeAudio("/audio/bgm_main.mp3", true, 0.3);
    this.bgmDisaster = makeAudio("/audio/bgm_disaster.mp3", true, 0.05);
    this.sfxEat = makeAudio("/audio/sfx_eat.mp3", false, 0.1);

    // respect current mute state
    this.setMuted(this.muted);

    this.inited = true;
    console.info("[Audio] init(): done");
  }

  /** ensure init if called from a user gesture; also auto-start main bgm if nothing is playing */
  private async ensureInitAndNudgeBgm() {
    const wasInited = this.inited;
    if (!this.inited) this.init();

    // If after init nothing is playing, start main bgm once.
    if (this.inited) {
      const playing =
        this.currentBgm && !this.currentBgm.paused && !this.currentBgm.ended;
      if (!playing) {
        // If catastrophe later switches mode, crossfade will handle it
        try {
          await this.playBgm("main");
          if (!wasInited) console.info("[Audio] auto-started main BGM");
        } catch (e) {
          console.warn("[Audio] auto-start main BGM failed", e);
        }
      }
    }
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
    // make sure we're inited (click/keydown context satisfies autoplay)
    if (!this.inited) await this.ensureInitAndNudgeBgm();

    if (!this.inited) {
      console.warn("[Audio] playBgm(): not inited (no user gesture yet?)");
      return;
    }
    const next = mode === "disaster" ? this.bgmDisaster : this.bgmMain;
    if (!next) {
      console.warn("[Audio] playBgm(): target track is null for mode:", mode);
      return;
    }

    if (this.currentBgm === next && !next.paused) {
      if (this.currentMode !== mode) this.currentMode = mode;
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

  async playEatSfx() {
    // first feed click should also arm audio and start bgm if idle
    await this.ensureInitAndNudgeBgm();

    if (!this.inited) {
      console.warn("[Audio] playEatSfx(): not inited (no user gesture?)");
      return;
    }
    if (!this.sfxEat) {
      console.warn("[Audio] playEatSfx(): sfx element missing");
      return;
    }
    const a = this.sfxEat.cloneNode(true) as HTMLAudioElement; // allow overlaps
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
