"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { BEAT, Diff, Game, TIME } from "@/lib/game";

type Cfg = { vsAI: boolean; diff: Diff; sound: boolean };
type Rec = { w: -1 | 0 | 1; by: string; vsAI: boolean; t: number };
const KEY = "tow.v1";
const NAME = ["Синие", "Оранжевые"];
const DIFF: Record<Diff, string> = { easy: "Лёгкий", normal: "Средний", hard: "Сложный" };

let ac: AudioContext | undefined;
const beep = (f: number, d = 0.07) => {
  try {
    ac ??= new AudioContext();
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = f;
    g.gain.value = 0.05;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + d);
  } catch {}
};

export default function GameView() {
  const mount = useRef<HTMLDivElement>(null);
  const g = useRef(new Game());
  const [cfg, setCfg] = useState<Cfg>({ vsAI: true, diff: "normal", sound: true });
  const [hist, setHist] = useState<Rec[]>([]);
  const [, tick] = useState(0);
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  // сохранение настроек и результатов матчей в localStorage
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || "{}");
      if (s.cfg) setCfg(s.cfg);
      if (s.hist) setHist(s.hist);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ cfg, hist })); } catch {}
  }, [cfg, hist]);

  const pull = (s: 0 | 1) => {
    const G = g.current;
    G.pull(s);
    if (G.flash[s] === 1 && cfgRef.current.sound) beep(G.perfect[s] ? 700 : 260, 0.05);
  };
  const begin = () => {
    const G = g.current;
    G.vsAI = cfgRef.current.vsAI;
    G.diff = cfgRef.current.diff;
    G.start();
  };
  const toMenu = () => {
    const G = g.current;
    G.vsAI = cfgRef.current.vsAI;
    G.diff = cfgRef.current.diff;
    G.reset();
  };

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const G = g.current;
      if (e.code === "Space") e.preventDefault();
      if (e.code === "KeyA" || (e.code === "Space" && G.vsAI)) pull(0);
      if (e.code === "KeyL" && !G.vsAI) pull(1);
      if (e.code === "Enter" && (G.phase === "idle" || G.phase === "over")) begin();
    };
    addEventListener("keydown", kd);
    return () => removeEventListener("keydown", kd);
  }, []);

  // 3D-сцена
  useEffect(() => {
    const el = mount.current!;
    const r = new THREE.WebGLRenderer({ antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(r.domElement);
    const sc = new THREE.Scene();
    sc.background = new THREE.Color("#b9dcf5");
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x557755, 1.7));
    const dl = new THREE.DirectionalLight(0xffffff, 1.6);
    dl.position.set(4, 8, 6);
    sc.add(dl);
    const M = (c: string) => new THREE.MeshStandardMaterial({ color: c });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 16), M("#5fb37a"));
    ground.rotation.x = -Math.PI / 2;
    sc.add(ground);
    [[-3, "#0ea5e9"], [0, "#ffffff"], [3, "#f97316"]].forEach(([x, c]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 16), M(c as string));
      m.position.set(x as number, 0.02, 0);
      sc.add(m);
    });

    const rope = new THREE.Group();
    const rm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 12, 8), M("#e8cf9a"));
    rm.rotation.z = Math.PI / 2;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.06), M("#ef4444"));
    flag.position.y = -0.3;
    rope.add(rm, flag);
    rope.position.y = 1.2;
    sc.add(rope);

    const teams = [0, 1].map((s) => {
      const t = new THREE.Group();
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Group();
        const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 8), M(s ? "#f97316" : "#0ea5e9"));
        b.position.y = 0.65;
        const h = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), M("#fcd9b6"));
        h.position.y = 1.55;
        f.add(b, h);
        f.position.x = (s ? 1 : -1) * (2.6 + i * 0.95);
        t.add(f);
      }
      sc.add(t);
      return t;
    });

    const rs = () => {
      const w = el.clientWidth, h = el.clientHeight;
      r.setSize(w, h);
      cam.aspect = w / h;
      cam.position.set(0, 3.5, 13 * Math.max(1, 1.7 / cam.aspect));
      cam.lookAt(0, 1.1, 0);
      cam.updateProjectionMatrix();
    };
    rs();
    addEventListener("resize", rs);

    let last = performance.now(), raf = 0, lc = -1, prev = g.current.phase;
    const loop = (n: number) => {
      const G = g.current, dt = Math.min(0.05, (n - last) / 1000);
      last = n;
      G.step(dt);
      const snd = cfgRef.current.sound;
      if (G.phase === "count" && G.count !== lc) { lc = G.count; if (snd) beep(440, 0.1); }
      if (prev === "count" && G.phase === "play" && snd) beep(880, 0.25);
      if (prev !== "over" && G.phase === "over") {
        const rec: Rec = { w: G.winner ?? -1, by: G.by ?? "time", vsAI: G.vsAI, t: TIME - G.time };
        setHist((h) => [rec, ...h].slice(0, 8));
        if (snd) beep(G.winner === -1 ? 330 : 990, 0.4);
      }
      prev = G.phase;
      const x = G.pos * 3;
      rope.position.x = x;
      teams.forEach((t, s) => {
        t.position.x = x;
        t.children.forEach((f, i) => {
          f.rotation.z = (s ? -1 : 1) * (0.22 + G.flash[s] * 0.28 + (G.lock[s] > 0 ? 0.5 : 0));
          f.position.y = G.flash[s] * 0.08 * Math.abs(Math.sin(i + n / 60));
        });
      });
      r.render(sc, cam);
      tick((k) => k + 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", rs);
      r.dispose();
      el.removeChild(r.domElement);
    };
  }, []);

  const G = g.current;
  const inWin = Math.min(G.beat, BEAT - G.beat) < 0.09;
  const wins = [0, 1].map((s) => hist.filter((h) => h.w === s).length);

  const seg = (on: boolean, label: string, fn: () => void) => (
    <button onClick={fn} className={`rounded-lg px-3 py-2 text-sm ${on ? "bg-slate-900 text-white" : "bg-slate-900/10"}`}>
      {label}
    </button>
  );

  const panel = (s: 0 | 1) => {
    const ai = s === 1 && G.vsAI;
    const label = s ? (G.vsAI ? "Компьютер" : "Игрок 2 · L") : G.vsAI ? "Ты · A или пробел" : "Игрок 1 · A";
    return (
      <div className={`absolute bottom-3 w-[44vw] max-w-xs select-none ${s ? "right-3" : "left-3"}`}>
        <div className="mb-1 flex justify-between text-xs">
          <span>{label}</span>
          <span>{G.lock[s] > 0 ? "Выдохся!" : Math.round(G.st[s])}</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-black/40">
          <div className={`h-full ${G.lock[s] > 0 ? "bg-red-500" : s ? "bg-orange-400" : "bg-sky-400"}`} style={{ width: `${G.st[s]}%` }} />
        </div>
        {!ai && (
          <button onPointerDown={() => pull(s)} className={`mt-2 w-full touch-none rounded-2xl py-5 text-lg active:scale-95 ${s ? "bg-orange-500" : "bg-sky-500"}`}>
            Тянуть
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="relative h-dvh w-screen">
      <div ref={mount} className="absolute inset-0" />

      <div className="absolute left-1/2 top-3 -translate-x-1/2 text-center text-slate-900">
        <div className="text-4xl tabular-nums">{Math.ceil(G.time)}</div>
        <div className="relative mx-auto mt-1 h-2 w-64 max-w-[70vw] rounded bg-white/60">
          <div className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500 ring-2 ring-white" style={{ left: `${(G.pos + 1) * 50}%` }} />
        </div>
      </div>

      {G.phase === "play" && (
        <div className="absolute left-1/2 top-24 h-14 w-14 -translate-x-1/2">
          <div className={`absolute inset-0 rounded-full border-4 ${inWin ? "border-lime-300 bg-lime-300/50" : "border-white/80"}`} />
          <div className="absolute inset-0 rounded-full border-2 border-white/60" style={{ transform: `scale(${1 + (1 - G.beat / BEAT) * 1.4})` }} />
        </div>
      )}

      {(G.phase === "count" || G.phase === "play") && panel(0)}
      {(G.phase === "count" || G.phase === "play") && panel(1)}

      {G.phase === "count" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-9xl text-white drop-shadow-lg">{G.count}</div>
      )}
      {G.phase === "play" && G.time > TIME - 0.8 && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-7xl text-white drop-shadow-lg">Тяни!</div>
      )}

      {(G.phase === "idle" || G.phase === "over") && (
        <div className="absolute inset-0 grid place-items-center overflow-auto bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-[#f4f7f2] p-6 text-slate-900">
            {G.phase === "over" ? (
              <>
                <h1 className="text-2xl">{G.winner === -1 ? "Ничья" : `${NAME[G.winner ?? 0]} победили`}</h1>
                <p className="mt-1 font-sans text-sm">
                  {G.by === "rope" ? "Флаг дошёл до линии." : G.winner === -1 ? "Время вышло, флаг остался в центре." : "Время вышло, флаг ближе к их стороне."}
                </p>
                <div className="mt-4 flex gap-2">
                  <button onClick={begin} className="flex-1 rounded-xl bg-slate-900 py-3 text-white">Реванш</button>
                  <button onClick={toMenu} className="rounded-xl bg-slate-900/10 px-4 py-3">В меню</button>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-3xl">Рывок и выдох</h1>
                <p className="mt-1 font-sans text-sm">Перетягивание каната, где важно вовремя отдохнуть.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {seg(cfg.vsAI, "С компьютером", () => setCfg({ ...cfg, vsAI: true }))}
                  {seg(!cfg.vsAI, "Вдвоём", () => setCfg({ ...cfg, vsAI: false }))}
                  {seg(cfg.sound, cfg.sound ? "Звук включён" : "Звук выключен", () => setCfg({ ...cfg, sound: !cfg.sound }))}
                </div>
                {cfg.vsAI && (
                  <div className="mt-2 flex gap-2">
                    {(Object.keys(DIFF) as Diff[]).map((d) => seg(cfg.diff === d, DIFF[d], () => setCfg({ ...cfg, diff: d })))}
                  </div>
                )}
                <button onClick={begin} className="mt-4 w-full rounded-xl bg-sky-500 py-3 text-lg text-white">Начать матч</button>
                <ul className="mt-4 list-disc space-y-1 pl-5 font-sans text-sm">
                  <li>Тяни на A (с компьютером — ещё и пробел). Вдвоём: A и L. На телефоне — кнопки «Тянуть».</li>
                  <li>Рывок тратит выносливость, и чем её меньше, тем он слабее.</li>
                  <li>Если не тянуть, выносливость восстанавливается, а после паузы 0,35 с — втрое быстрее.</li>
                  <li>Тянуть в такт (кольцо светится зелёным): рывок в 1,8 раза сильнее и дешевле.</li>
                  <li>Остался без сил — 1 секунду не можешь тянуть.</li>
                  <li>Победа: дотянуть флаг до цветной линии за 45 секунд. Если время вышло, побеждает тот, к кому флаг ближе; у центра — ничья.</li>
                </ul>
                {hist.length > 0 && (
                  <div className="mt-4 border-t border-slate-900/15 pt-3 font-sans text-sm">
                    <div>Победы: синие {wins[0]}, оранжевые {wins[1]}</div>
                    {hist.slice(0, 5).map((h, i) => (
                      <div key={i} className="text-slate-600">
                        {h.w === -1 ? "Ничья" : NAME[h.w]}, {h.vsAI ? "с компьютером" : "вдвоём"}, {Math.round(h.t)} с
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
