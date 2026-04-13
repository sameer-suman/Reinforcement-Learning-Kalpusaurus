import { useRef, useEffect, useState, useCallback } from "react";

const TILE = 20;
const W = 400;
const H = 400;

function rndFood(sn) {
  let f;
  do {
    f = {
      x: Math.floor(Math.random() * (W / TILE)) * TILE,
      y: Math.floor(Math.random() * (H / TILE)) * TILE,
    };
  } while (sn && sn.some((s) => s.x === f.x && s.y === f.y));
  return f;
}

function applyAction(d, a) {
  if (a === 1) return { x: d.y, y: -d.x }; // True Left
  if (a === 2) return { x: -d.y, y: d.x }; // True Right
  return d; // Straight
}

function getState(sn, f, d) {
  const h = sn[0];
  const danger = (x, y) =>
    x < 0 || y < 0 || x >= W || y >= H || sn.some((s) => s.x === x && s.y === y);

  // True relative directional vectors
  const lft = { x: d.y, y: -d.x };
  const rgt = { x: -d.y, y: d.x };

  // Vector pointing straight from the snake's head to the food
  const fx = f.x - h.x;
  const fy = f.y - h.y;

  return [
    // 1. Danger (Relative: Ahead, Left, Right)
    danger(h.x + d.x, h.y + d.y) ? 1 : 0,
    danger(h.x + lft.x, h.y + lft.y) ? 1 : 0,
    danger(h.x + rgt.x, h.y + rgt.y) ? 1 : 0,
    
    // 2. Food (Relative: using dot products to check alignment!)
    (fx * d.x + fy * d.y) > 0 ? 1 : 0,     // Food is Ahead
    (fx * d.x + fy * d.y) < 0 ? 1 : 0,     // Food is Behind
    (fx * lft.x + fy * lft.y) > 0 ? 1 : 0, // Food is to the Left
    (fx * rgt.x + fy * rgt.y) > 0 ? 1 : 0  // Food is to the Right
  ];
}

function chooseAction(qTable, state, epsilon) {
  const key = state.join(",");
  if (!qTable[key]) qTable[key] = [0, 0, 0];
  if (Math.random() < epsilon) {
    const a = Math.floor(Math.random() * 3);
    return [a, "Exploration", [...qTable[key]]];
  }
  const qs = qTable[key];
  const a = qs.indexOf(Math.max(...qs));
  return [a, "Exploitation", [...qs]];
}



function updateQ(qTable, s, a, r, ns, alpha, gamma, isTerminal = false) {
  const k = s.join(",");
  if (!qTable[k]) qTable[k] = [0, 0, 0];
  
  let maxNext = 0;
  if (!isTerminal) {
    const nk = ns.join(",");
    if (!qTable[nk]) qTable[nk] = [0, 0, 0];
    maxNext = Math.max(...qTable[nk]);
  }
  
  qTable[k][a] += alpha * (r + gamma * maxNext - qTable[k][a]);
}

function getFoodText(state) {
  if (!state.length) return "—";
  const dirs = [];
  if (state[3]) dirs.push("ahead");
  if (state[4]) dirs.push("behind");
  if (state[5]) dirs.push("left");
  if (state[6]) dirs.push("right");
  return dirs.join(", ") || "none";
}

function getDangerText(state) {
  if (!state.length) return "—";
  const dirs = [];
  if (state[0]) dirs.push("ahead");
  if (state[1]) dirs.push("left");
  if (state[2]) dirs.push("right");
  return dirs.join(", ") || "none";
}

const ACTIONS = ["STRAIGHT", "LEFT", "RIGHT"];

export default function App() {
  const canvasRef = useRef(null);
  const qTableRef = useRef({});
  const stateRef = useRef({
    snake: [{ x: 200, y: 200 }],
    dir: { x: TILE, y: 0 },
    food: rndFood(null),
    epsilon: 1,
    alpha: 0.1,
    gamma: 0.95,
    fps: 10,
    paused: false,
    turbo: false,
    currentReward: 0,
    episodeCount: 0,
    score: 0,
    steps: 0,
    totalSteps: 0,
    episodeRewards: [],
    lastReward: 0,
    lastAction: 0,
    lastMode: "—",
    lastQVals: [0, 0, 0],
    lastState: [],
    statesVisited: 0,
    totalActions: [0, 0, 0],
    stepsSinceFood: 0, 
    rewardFood: 10,
    rewardDeath: -10,
    rewardStep: -0.05,
    epsilonDecay: 0.9995,        
    scaleRewardWithLength: true
  });

  const [ui, setUI] = useState({
    epsilon: 1,
    alpha: 0.1,
    gamma: 0.95,
    fps: 10,
    paused: false,
    turbo: false,
    mode: "—",
    qVals: [0, 0, 0],
    action: 0,
    state: [],
    score: 0,
    episodes: 0,
    steps: 0,
    totalSteps: 0,
    currentReward: 0,
    lastReward: 0,
    episodeRewards: [],
    statesVisited: 0,
    totalActions: [0, 0, 0],
    rewardFood: 10,
    rewardDeath: -10,
    rewardStep: -0.05,
    epsilonDecay: 0.9995,
    scaleRewardWithLength: true,
  });

  const intervalRef = useRef(null);
  const turboRef = useRef(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { snake, food } = stateRef.current;
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    ctx.fillStyle = isDark ? "#0d1117" : "#f6f8fa";
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.05)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < W; x += TILE) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += TILE) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    ctx.fillStyle = "#e24b4a";
    ctx.beginPath();
    ctx.arc(food.x + TILE / 2, food.y + TILE / 2, TILE / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? "#1d9e75" : i < 3 ? "#2db885" : "#5dcaa5";
      ctx.beginPath();
      ctx.roundRect(s.x + 1, s.y + 1, TILE - 2, TILE - 2, i === 0 ? 5 : 3);
      ctx.fill();
    });
  }, []);

  const step = useCallback(() => {
    const g = stateRef.current;
    if (g.paused) return;

    // If we have enough history and the average reward is high enough,
    // lock the agent into pure exploitation.
    const recent = g.episodeRewards.slice(-20);
    const avgReward = recent.length === 20 
      ? recent.reduce((a, b) => a + b, 0) / 20 
      : 0;

    if (Math.round(avgReward) >= 700) {
      g.epsilon = 0;   
      g.alpha = 0;     
    } else {
      if (g.epsilon > 0) {
        g.epsilon = Math.max(0.01, g.epsilon * g.epsilonDecay); 
      }
    }
    
    const state = getState(g.snake, g.food, g.dir);
    const [action, mode, qVals] = chooseAction(qTableRef.current, state, g.epsilon);
    const newDir = applyAction(g.dir, action);
    g.dir = newDir;

    const head = g.snake[0];
    // const oldDist = Math.abs(head.x - g.food.x) + Math.abs(head.y - g.food.y);
    const newHead = { x: head.x + newDir.x, y: head.y + newDir.y };
    // const newDist = Math.abs(newHead.x - g.food.x) + Math.abs(newHead.y - g.food.y);

   let reward = g.rewardStep;
    g.stepsSinceFood++; // Increment hunger every step

    // Calculate maximum allowed steps based on board size (e.g., 20x20 = 400 grid squares)
    // 200 steps is plenty of time to cross a 400-square board if moving efficiently
    const starved = g.stepsSinceFood > 200; 

    const hit =
      newHead.x < 0 || newHead.y < 0 || newHead.x >= W || newHead.y >= H ||
      g.snake.slice(1).some((s) => s.x === newHead.x && s.y === newHead.y);

    // If it hits a wall OR starves, it dies
    if (hit || starved) {
      reward = g.rewardDeath;
      updateQ(qTableRef.current, state, action, reward, null, g.alpha, g.gamma, true);
      g.episodeRewards.push(parseFloat(g.currentReward.toFixed(2)));
      if (g.episodeRewards.length > 100) g.episodeRewards.shift();
      g.episodeCount++;
      g.currentReward = 0;
      g.score = 0;
      g.steps = 0;
      g.stepsSinceFood = 0; // Reset hunger on death
      g.snake = [{ x: 200, y: 200 }];
      g.dir = { x: TILE, y: 0 };
      g.food = rndFood(g.snake);
    } else {
      let newSnake = [newHead, ...g.snake];
      
      if (newHead.x === g.food.x && newHead.y === g.food.y) {
        reward = g.rewardFood + (g.scaleRewardWithLength ? (g.snake.length - 1) : 0);
        
        g.score++;
        g.stepsSinceFood = 0; 
        g.food = rndFood(newSnake);
      } else {
        newSnake.pop();
      }
      
      const nextState = getState(newSnake, g.food, newDir);
      updateQ(qTableRef.current, state, action, reward, nextState, g.alpha, g.gamma, false);
      g.snake = newSnake;
    }

    g.currentReward += reward;
    g.steps++;
    g.totalSteps++;
    g.lastReward = reward;
    g.lastAction = action;
    g.lastMode = mode;
    g.lastQVals = qVals;
    g.lastState = state;
    g.totalActions[action]++;
    g.statesVisited = Object.keys(qTableRef.current).length;

    draw();
  }, [draw]);

  const flushUI = useCallback(() => {
    const g = stateRef.current;
    setUI({
      epsilon: g.epsilon,
      alpha: g.alpha,
      gamma: g.gamma,
      fps: g.fps,
      paused: g.paused,
      turbo: g.turbo,
      mode: g.lastMode,
      qVals: g.lastQVals,
      action: g.lastAction,
      state: g.lastState,
      score: g.score,
      episodes: g.episodeCount,
      steps: g.steps,
      totalSteps: g.totalSteps,
      currentReward: parseFloat(g.currentReward.toFixed(2)),
      lastReward: parseFloat(g.lastReward.toFixed(2)),
      episodeRewards: [...g.episodeRewards],
      statesVisited: g.statesVisited,
      totalActions: [...g.totalActions],
      rewardFood: g.rewardFood,
      rewardDeath: g.rewardDeath,
      rewardStep: g.rewardStep,
      epsilonDecay: g.epsilonDecay,
    scaleRewardWithLength: g.scaleRewardWithLength,
    });
  }, []);

  const startLoop = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (turboRef.current) clearInterval(turboRef.current);
    const g = stateRef.current;
    if (g.turbo) {
      turboRef.current = setInterval(() => {
        for (let i = 0; i < 50; i++) step();
        flushUI();
      }, 16);
    } else {
      const ms = Math.round(1000 / g.fps);
      intervalRef.current = setInterval(() => {
        step();
        flushUI();
      }, ms);
    }
  }, [step, flushUI]);

  useEffect(() => {
    draw();
    startLoop();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (turboRef.current) clearInterval(turboRef.current);
    };
  }, []);

  const togglePause = () => {
    stateRef.current.paused = !stateRef.current.paused;
    flushUI();
  };

  const toggleTurbo = () => {
    stateRef.current.turbo = !stateRef.current.turbo;
    startLoop();
    flushUI();
  };

  const resetAgent = () => {
    qTableRef.current = {};
    const g = stateRef.current;
    g.snake = [{ x: 200, y: 200 }];
    g.dir = { x: TILE, y: 0 };
    g.food = rndFood(null);
    g.epsilon = 1;
    g.alpha = 0.1;
    g.currentReward = 0;
    g.episodeCount = 0;
    g.score = 0;
    g.steps = 0;
    g.totalSteps = 0;
    g.episodeRewards = [];
    g.lastReward = 0;
    g.lastAction = 0;
    g.lastMode = "—";
    g.lastQVals = [0, 0, 0];
    g.lastState = [];
    g.statesVisited = 0;
    g.totalActions = [0, 0, 0];
    g.epsilonDecay = 0.9995;
    g.turbo = false;
    startLoop();
    flushUI();
    draw();
  };

  const setParam = (key, val) => {
    stateRef.current[key] = val;
    if (key === "fps") startLoop();
    flushUI();
  };

  const maxQ = Math.max(...ui.qVals.map(Math.abs), 0.01);
  const totalActions = ui.totalActions.reduce((a, b) => a + b, 1);
  const avgReward = ui.episodeRewards.length
    ? (ui.episodeRewards.slice(-20).reduce((a, b) => a + b, 0) / Math.min(ui.episodeRewards.length, 20)).toFixed(1)
    : "—";

  const styles = {
    root: {
      display: "flex", flexDirection: "column", gap: 24, padding: "2vw",
      width: "100%", maxWidth: "100%", margin: "0 auto", boxSizing: "border-box"
    },
    
    topRow: { 
      display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" 
    },
    
    colLeft: { 
      display: "flex", flexDirection: "column", gap: 16, 
      flex: "0 0 400px", maxWidth: "100%", margin: "0 auto" 
    },
    
    colMiddle: {
      flex: "1 1 300px", 
      background: "var(--color-background-secondary, #f6f8fa)",
      border: "1px solid var(--color-border-tertiary, #d0d7de)", borderRadius: 12,
      padding: 20, display: "flex", flexDirection: "column", gap: 20, fontSize: 13,
      boxShadow: "0 4px 12px rgba(0,0,0,0.03)", minWidth: 320
    },

    colRight: {
      flex: "1 1 300px", 
      background: "var(--color-background-secondary, #f6f8fa)",
      border: "1px solid var(--color-border-tertiary, #d0d7de)", borderRadius: 12,
      padding: 20, display: "flex", flexDirection: "column", gap: 16, fontSize: 13,
      boxShadow: "0 4px 12px rgba(0,0,0,0.03)", minWidth: 320
    },
    
    bottomRow: {
      display: "flex", width: "100%"
    },
    
    guideCard: {
      flex: 1, background: "var(--color-background-secondary, #f6f8fa)",
      border: "1px solid var(--color-border-tertiary, #d0d7de)", borderRadius: 12,
      padding: 20, display: "flex", flexDirection: "column", gap: 16, fontSize: 13,
      boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
    },
    
    canvas: { 
      borderRadius: 12, display: "block", 
      width: "100%", maxWidth: 400, height: "auto",
      border: "1px solid var(--color-border-tertiary, #d0d7de)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
    },
    sectionTitle: {
      fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: "var(--color-text-tertiary, #57606a)",
      marginBottom: 8, borderBottom: "1px solid var(--color-border-tertiary, #d0d7de)", paddingBottom: 6
    },
    badge: (mode) => ({
      display: "inline-block", padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600,
      background: mode === "Exploration" ? "#faeeda" : "#e1f5ee",
      color: mode === "Exploration" ? "#633806" : "#085041",
    }),
    barTrack: {
      height: 8, background: "var(--color-background-primary, #ffffff)",
      border: "1px solid var(--color-border-tertiary, #d0d7de)", borderRadius: 4, overflow: "hidden",
    },
    barFill: (pct, color) => ({
      width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.1s ease-out",
    }),
    statGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 },
    statCard: {
      background: "var(--color-background-primary, #ffffff)",
      border: "1px solid var(--color-border-tertiary, #d0d7de)",
      borderRadius: 8, padding: "12px", display: "flex", flexDirection: "column", alignItems: "center"
    },
    statVal: { fontSize: 18, fontWeight: 600, color: "var(--color-text-primary, #24292f)" },
    statLbl: { fontSize: 10, color: "var(--color-text-secondary, #57606a)", marginTop: 4, letterSpacing: "0.05em", textAlign: "center" },
    btn: (active, color) => ({
      flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
      border: `1px solid ${active ? color : "var(--color-border-secondary, #d0d7de)"}`,
      background: active ? color : "var(--color-background-primary, #ffffff)",
      color: active ? "#fff" : "var(--color-text-primary, #24292f)",
      transition: "all 0.15s ease",
    }),
    btnDanger: {
      flex: 1, padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
      border: "1px solid #e24b4a", background: "var(--color-background-primary, #ffffff)",
      color: "#e24b4a", transition: "all 0.15s ease",
    },
    sliderRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 },
    sliderLabel: { width: 80, color: "var(--color-text-secondary, #57606a)", fontSize: 12, fontWeight: 500 },
    sliderVal: { width: 40, textAlign: "right", color: "var(--color-text-primary, #24292f)", fontWeight: 600, fontSize: 12 },
    miniStat: { display: "flex", justifyContent: "space-between", padding: "4px 0" },
    miniKey: { color: "var(--color-text-tertiary, #57606a)", fontSize: 12, fontWeight: 500 },
    miniVal: (color) => ({ color: color || "var(--color-text-primary, #24292f)", fontSize: 12, fontWeight: 600 }),
  };
  const rewardMin = ui.episodeRewards.length ? Math.min(...ui.episodeRewards) : 0;
  const rewardMax = ui.episodeRewards.length ? Math.max(...ui.episodeRewards) : 1;
  const rewardRange = rewardMax - rewardMin || 1;
  const chartW = 268, chartH = 60;
  const recent = ui.episodeRewards.slice(-60);

  return (
    <div style={styles.root}>
      

      <div style={styles.topRow}>
        
        <div style={styles.colLeft}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 4 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--color-text-primary, #ffffff)", letterSpacing: "0.02em" }}>
              🦖 Kalpusaurus
            </div>
            <span style={styles.badge(ui.mode)}>{ui.mode}</span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button style={styles.btn(ui.paused, "#378add")} onClick={togglePause}>
              {ui.paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button style={styles.btn(ui.turbo, "#ba7517")} onClick={toggleTurbo}>
              {ui.turbo ? "⚡ Turbo ON" : "⚡ Turbo"}
            </button>
            <button style={styles.btnDanger} onClick={resetAgent}>↺ Reset</button>
          </div>

          <canvas ref={canvasRef} id="game" width={W} height={H} style={styles.canvas} />
        </div>

        <div style={styles.colMiddle}>
          <div>
            <div style={styles.sectionTitle}>Live Q-Values</div>
            {["straight", "left", "right"].map((lbl, i) => {
              const v = ui.qVals[i] || 0;
              const pct = Math.min((Math.abs(v) / maxQ) * 100, 100);
              const isActive = i === ui.action;
              const color = isActive ? "#1d9e75" : v >= 0 ? "#378add" : "#e24b4a";
              return (
                <div key={i} style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                    <span style={{ color: isActive ? "#1d9e75" : "var(--color-text-secondary, #57606a)", fontWeight: isActive ? 600 : 400 }}>{lbl}</span>
                    <span style={{ color: isActive ? "#1d9e75" : "var(--color-text-secondary, #57606a)" }}>{v.toFixed(3)}</span>
                  </div>
                  <div style={styles.barTrack}><div style={styles.barFill(pct, color)} /></div>
                </div>
              );
            })}
            <div style={{ marginTop: 6, fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>
              Selected Action → <strong style={{ color: "#1d9e75" }}>{ACTIONS[ui.action]}</strong>
            </div>
          </div>

          <div>
            <div style={styles.sectionTitle}>Agent State Vector</div>
            <div style={styles.miniStat}><span style={styles.miniKey}>food direction</span><span style={styles.miniVal()}>{getFoodText(ui.state)}</span></div>
            <div style={styles.miniStat}><span style={styles.miniKey}>danger ahead/sides</span><span style={styles.miniVal("#e24b4a")}>{getDangerText(ui.state)}</span></div>
            <div style={styles.miniStat}><span style={styles.miniKey}>unique states visited</span><span style={styles.miniVal()}>{ui.statesVisited.toLocaleString()}</span></div>
            <div style={styles.miniStat}><span style={styles.miniKey}>last step reward</span>
              <span style={styles.miniVal(ui.lastReward > 0 ? "#1d9e75" : ui.lastReward < 0 ? "#e24b4a" : "inherit")}>
                {ui.lastReward > 0 ? "+" : ""}{ui.lastReward}
              </span>
            </div>
          </div>

          <div>
            <div style={styles.sectionTitle}>Action Distribution</div>
            {["straight", "left", "right"].map((lbl, i) => {
              const pct = ((ui.totalActions[i] / totalActions) * 100).toFixed(1);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ width: 50, color: "var(--color-text-tertiary, #57606a)", fontSize: 10 }}>{lbl}</span>
                  <div style={{ flex: 1, ...styles.barTrack }}>
                    <div style={styles.barFill(parseFloat(pct), "#378add")} />
                  </div>
                  <span style={{ width: 36, textAlign: "right", color: "var(--color-text-secondary, #57606a)", fontSize: 10 }}>{pct}%</span>
                </div>
              );
            })}
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ ...styles.sectionTitle, display: "flex", justifyContent: "space-between", borderBottom: "none" }}>
              <span>Reward History (60 ep)</span>
              <span style={{ color: "var(--color-text-primary, #24292f)", textTransform: "none" }}>avg of last min(n,20) episodes: {avgReward}</span>
            </div>
            <div style={{ background: "var(--color-background-primary, #ffffff)", border: "1px solid var(--color-border-tertiary, #d0d7de)", borderRadius: 8, padding: "8px", flex: 1, minHeight: 70, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {recent.length < 2 ? (
                <div style={{ fontSize: 11, color: "var(--color-text-tertiary, #57606a)", textAlign: "center" }}>waiting for episodes...</div>
              ) : (
                <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} preserveAspectRatio="none" style={{ display: "block" }}>
                  <line x1={0} y1={chartH / 2} x2={chartW} y2={chartH / 2} stroke="var(--color-border-tertiary, #d0d7de)" strokeWidth={1} strokeDasharray="4,4" />
                  {recent.map((r, i) => {
                    if (i === 0) return null;
                    const prev = recent[i - 1];
                    const x1 = ((i - 1) / (recent.length - 1)) * chartW;
                    const y1 = chartH - ((prev - rewardMin) / rewardRange) * chartH;
                    const x2 = (i / (recent.length - 1)) * chartW;
                    const y2 = chartH - ((r - rewardMin) / rewardRange) * chartH;
                    return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1d9e75" strokeWidth={2} />;
                  })}
                  {recent.length > 0 && (() => {
                    const last = recent[recent.length - 1];
                    const lx = chartW;
                    const ly = chartH - ((last - rewardMin) / rewardRange) * chartH;
                    return <circle cx={lx} cy={ly} r={3.5} fill="#1d9e75" />;
                  })()}
                </svg>
              )}
            </div>
          </div>
        </div>

        <div style={styles.colRight}>
          <div>
            <div style={styles.sectionTitle}>Performance Stats</div>
            <div style={styles.statGrid}>
              <div style={styles.statCard}><div style={styles.statVal}>{ui.score}</div><div style={styles.statLbl}>CURRENT SCORE</div></div>
              <div style={styles.statCard}><div style={styles.statVal}>{ui.episodes.toLocaleString()}</div><div style={styles.statLbl}>TOTAL EPISODES</div></div>
              <div style={styles.statCard}><div style={styles.statVal}>{ui.steps}</div><div style={styles.statLbl}>STEPS (THIS EP)</div></div>
              <div style={styles.statCard}><div style={styles.statVal}>{ui.totalSteps.toLocaleString()}</div><div style={styles.statLbl}>TOTAL STEPS</div></div>
            </div>
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={styles.sectionTitle}>Learning Parameters</div>
            {[
              { key: "epsilon", label: "ε explore", min: 0, max: 1, step: 0.01, val: ui.epsilon },
              { key: "epsilonDecay", label: "ε-decay/step", min: 0.9000, max: 1.0000, step: 0.000001, val: ui.epsilonDecay, type: "number" },
              { key: "alpha", label: "α learning", min: 0, max: 1, step: 0.01, val: ui.alpha },
              { key: "gamma", label: "γ discount", min: 0.01, max: 1, step: 0.01, val: ui.gamma },
              { key: "fps", label: "fps", min: 1, max: 60, step: 1, val: ui.fps },
            ].map(({ key, label, min, max, step, val, type = "range" }) => (
              <div key={key} style={styles.sliderRow}>
                <span style={styles.sliderLabel}>{label}</span>
                
                {/* CONDITIONAL RENDERING: Slider vs. Number Box */}
                {type === "range" ? (
                  <>
                    <input type="range" min={min} max={max} step={step} value={val !== undefined ? val : 0}
                      style={{ flex: 1, accentColor: "#378add", cursor: "pointer" }}
                      onChange={(e) => setParam(key, parseFloat(e.target.value))} />
                    <span style={styles.sliderVal}>
                      {val !== undefined ? (step < 0.001 ? val.toFixed(4) : step < 1 ? val.toFixed(3) : val) : "—"}
                    </span>
                  </>
                ) : (
                  <input type="number" min={min} max={max} step={step} value={val !== undefined ? val : ""}
                    style={{ 
                      flex: 1, padding: "4px 8px", borderRadius: 6, 
                      border: "1px solid var(--color-border-tertiary, #d0d7de)", 
                      background: "var(--color-background-primary, #ffffff)",
                      color: "var(--color-text-primary, #24292f)",
                      fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none"
                    }}
                    onChange={(e) => {
                      const newVal = e.target.value === "" ? 0 : parseFloat(e.target.value);
                      setParam(key, newVal);
                    }} 
                  />
                )}
              </div>
            ))}

            <div style={{ ...styles.sectionTitle, marginTop: 16 }}>Reward Shaping</div>
            {[
              { key: "rewardFood", label: "food (+)", min: 1, max: 50, step: 1, val: ui.rewardFood },
              { key: "rewardDeath", label: "death (-)", min: -50, max: 0, step: 1, val: ui.rewardDeath },
              { key: "rewardStep", label: "step (-)", min: -2, max: 0, step: 0.01, val: ui.rewardStep },
            ].map(({ key, label, min, max, step, val }) => (
              <div key={key} style={styles.sliderRow}>
                <span style={styles.sliderLabel}>{label}</span>
                <input type="range" min={min} max={max} step={step} value={val !== undefined ? val : 0}
                  style={{ flex: 1, accentColor: key === "rewardFood" ? "#1d9e75" : "#e24b4a" }}
                  onChange={(e) => setParam(key, parseFloat(e.target.value))} />
                <span style={styles.sliderVal}>
                  {val !== undefined ? (val % 1 !== 0 ? val.toFixed(2) : val) : "—"}
                </span>
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", marginTop: 20 }}>
              <span style={{width: 250, color: "var(--color-text-secondary, #57606a)", fontSize: 12, fontWeight: 500}}>Scale food reward with Length</span>
              <button
                onClick={() => setParam("scaleRewardWithLength", !ui.scaleRewardWithLength)}
                style={{
                  ...styles.btn(ui.scaleRewardWithLength, "#1d9e75"),
                  flex: "none", width: 60, padding: "4px 0", fontSize: 11
                }}
              >
                {ui.scaleRewardWithLength ? "ON" : "OFF"}
              </button>
            </div>

          </div>
        </div>

      </div>

      <div style={styles.bottomRow}>
        <div style={styles.guideCard}>
          <div style={styles.sectionTitle}>Environment & Parameter Guide</div>
          <div style={styles.miniStat}><span style={styles.miniKey}>ε (epsilon)</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Exploration rate (auto-decays)</span></div>
          <div style={styles.miniStat}><span style={styles.miniKey}>α (alpha)</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Learning rate (auto-decays)</span></div>
          <div style={styles.miniStat}><span style={styles.miniKey}>γ (gamma)</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Discount factor (future rewards)</span></div>
          <div style={styles.miniStat}><span style={styles.miniKey}>fps</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Simulation speed (visual only)</span></div>
          
          <div style={{ borderTop: "1px solid var(--color-border-tertiary, #d0d7de)", margin: "8px 0" }} />
          
          <div style={styles.miniStat}><span style={styles.miniKey}>Rewards</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Food: <strong style={{color:"#1d9e75"}}>{ui.rewardFood} {ui.scaleRewardWithLength ? "+ len" : ""}</strong> | Death: <strong style={{color:"#e24b4a"}}>{ui.rewardDeath}</strong></span></div>
          <div style={styles.miniStat}><span style={styles.miniKey}>Step Penalty</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Living penalty: <strong style={{color:"#e24b4a"}}>{ui.rewardStep}</strong>/step</span></div>
          <div style={styles.miniStat}><span style={styles.miniKey}>Action Space</span><span style={{ fontSize: 11, color: "var(--color-text-secondary, #57606a)" }}>Straight, Left, Right</span></div>

          <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px dashed var(--color-border-tertiary, #d0d7de)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary, #57606a)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
              <span>7-Bit State Vector Breakdown (Pure Relative)</span>
              <span>[ 0, 1, ..., 6 ]</span>
            </div>
            <div style={{ display: "flex", gap: 6, fontFamily: "'JetBrains Mono', monospace" }}>
              
              <div style={{ flex: "3", background: "rgba(226, 75, 74, 0.08)", border: "1px solid rgba(226, 75, 74, 0.2)", borderRadius: 6, padding: "6px 0", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#e24b4a" }}>DANGER</span>
                <span style={{ fontSize: 9, color: "var(--color-text-tertiary, #8c959f)" }}>Ahead, L, R</span>
              </div>

              <div style={{ flex: "4", background: "rgba(29, 158, 117, 0.08)", border: "1px solid rgba(29, 158, 117, 0.2)", borderRadius: 6, padding: "6px 0", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#1d9e75" }}>FOOD TARGET</span>
                <span style={{ fontSize: 9, color: "var(--color-text-tertiary, #8c959f)" }}>Ahead, Behind, L, R</span>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  );
}