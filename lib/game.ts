// Чистая игровая логика без DOM и Three.js: её можно тестировать отдельно от отображения.
export type Phase = "idle" | "count" | "play" | "over";
export type Diff = "easy" | "normal" | "hard";
export const BEAT = 0.8; // период ритма, с
export const TIME = 45; // длительность матча, с
export const COST = 9; // цена обычного рывка
// [средний интервал между рывками ИИ, точность попадания в ритм, порог выносливости для рывка]
const AI: Record<Diff, [number, number, number]> = {
  easy: [0.46, 0.25, 45],
  normal: [0.31, 0.5, 32],
  hard: [0.22, 0.8, 22],
};

export class Game {
  phase: Phase = "idle";
  pos = 0; // -1 (победа синих) … +1 (победа оранжевых)
  vel = 0;
  time = TIME;
  count = 3;
  beat = 0;
  st = [100, 100]; // выносливость
  idle = [0, 0]; // сколько не тянул
  lock = [0, 0]; // «выдохся»: блокировка рывков
  flash = [0, 0];
  perfect = [0, 0];
  winner: -1 | 0 | 1 | null = null;
  by: "rope" | "time" | null = null;
  private aiT = 0;
  private cd = 0;

  constructor(public vsAI = true, public diff: Diff = "normal") {}

  reset() {
    Object.assign(this, new Game(this.vsAI, this.diff));
  }

  start() {
    this.reset();
    this.phase = "count";
  }

  /** Рывок стороны s (0 — левые, 1 — правые). Вне фазы "play" ничего не делает. */
  pull(s: 0 | 1, forcePerfect = false) {
    if (this.phase !== "play" || this.lock[s] > 0) return;
    if (this.st[s] < COST) {
      this.lock[s] = 1;
      return;
    }
    const d = Math.min(this.beat, BEAT - this.beat);
    const perfect = forcePerfect || d < 0.09;
    this.st[s] -= perfect ? COST - 4 : COST;
    this.idle[s] = 0;
    const power = 0.4 + (0.6 * this.st[s]) / 100;
    this.vel += (s ? 1 : -1) * 0.2 * (perfect ? 1.8 : 1) * power;
    this.flash[s] = 1;
    this.perfect[s] = perfect ? 1 : 0;
  }

  step(dt: number) {
    if (this.phase === "count") {
      this.cd += dt;
      this.count = Math.max(1, 3 - Math.floor(this.cd));
      if (this.cd >= 3) this.phase = "play";
      return;
    }
    if (this.phase !== "play") return;
    this.time -= dt;
    this.beat = (this.beat + dt) % BEAT;
    for (const s of [0, 1]) {
      this.idle[s] += dt;
      this.lock[s] = Math.max(0, this.lock[s] - dt);
      this.flash[s] = Math.max(0, this.flash[s] - dt * 5);
      if (this.lock[s] <= 0) {
        // не тянешь дольше 0.35 с — восстановление втрое быстрее
        this.st[s] = Math.min(100, this.st[s] + dt * (14 + (this.idle[s] > 0.35 ? 24 : 0)));
      }
    }
    if (this.vsAI) {
      this.aiT -= dt;
      if (this.aiT <= 0) {
        const [gap, acc, thr] = AI[this.diff];
        this.aiT = gap * (0.7 + Math.random() * 0.6);
        if (this.st[1] > thr) this.pull(1, Math.random() < acc);
      }
    }
    this.vel *= Math.exp(-3 * dt);
    this.pos = Math.max(-1, Math.min(1, this.pos + this.vel * dt));
    if (Math.abs(this.pos) >= 1) this.finish(this.pos > 0 ? 1 : 0, "rope");
    else if (this.time <= 0) this.finish(Math.abs(this.pos) < 0.03 ? -1 : this.pos > 0 ? 1 : 0, "time");
  }

  private finish(w: -1 | 0 | 1, by: "rope" | "time") {
    this.phase = "over";
    this.winner = w;
    this.by = by;
    this.time = Math.max(0, this.time);
  }
}
