import {
  state,
  resetState,
  setRunning,
  setSpeed,
  updateParams,
  advanceSimulation,
  subscribe,
} from "./state.js";

const SPEED_TO_STEPS = {
  slow: 1,
  normal: 2,
  fast: 6,
};

function formatNum(value) {
  return Number(value).toFixed(2);
}

function applyPreset(name) {
  const presets = {
    balanced: {
      alpha: 1.1,
      beta: 0.06,
      delta: 0.03,
      gamma: 0.7,
      prey0: 40,
      predator0: 9,
      dt: 0.03,
    },
    predatorCrash: {
      alpha: 1.0,
      beta: 0.04,
      delta: 0.018,
      gamma: 1.0,
      prey0: 45,
      predator0: 12,
      dt: 0.03,
    },
    preyCrash: {
      alpha: 0.7,
      beta: 0.09,
      delta: 0.045,
      gamma: 0.6,
      prey0: 28,
      predator0: 16,
      dt: 0.025,
    },
    highCycles: {
      alpha: 1.3,
      beta: 0.08,
      delta: 0.028,
      gamma: 0.75,
      prey0: 55,
      predator0: 7,
      dt: 0.02,
    },
  };

  const selected = presets[name] || presets.balanced;
  updateParams(selected);
  syncControlsFromState();
  resetState();
}

function syncControlsFromState() {
  const setVal = (id, val, text) => {
    const el = document.getElementById(id);
    if (el) el.value = String(val);
    if (text) text.textContent = val;
  };

  setVal("slider-alpha", state.alpha);
  setVal("slider-beta", state.beta);
  setVal("slider-delta", state.delta);
  setVal("slider-gamma", state.gamma);
  setVal("slider-dt", state.dt);
  setVal("slider-prey0", state.prey0);
  setVal("slider-predator0", state.predator0);

  document.getElementById("val-alpha").textContent = formatNum(state.alpha);
  document.getElementById("val-beta").textContent = formatNum(state.beta);
  document.getElementById("val-delta").textContent = formatNum(state.delta);
  document.getElementById("val-gamma").textContent = formatNum(state.gamma);
  document.getElementById("val-dt").textContent = formatNum(state.dt);
  document.getElementById("val-prey0").textContent = String(Math.round(state.prey0));
  document.getElementById("val-predator0").textContent = String(Math.round(state.predator0));
}

function bindControls() {
  const btnPlayPause = document.getElementById("btn-playpause");
  const btnReset = document.getElementById("btn-reset");
  const selectPreset = document.getElementById("select-preset");

  btnPlayPause.addEventListener("click", () => {
    setRunning(!state.running);
  });

  btnReset.addEventListener("click", () => {
    setRunning(false);
    resetState();
  });

  document.querySelectorAll(".btn-speed").forEach((btn) => {
    btn.addEventListener("click", () => {
      setSpeed(btn.dataset.speed);
    });
  });

  selectPreset.addEventListener("change", () => {
    setRunning(false);
    applyPreset(selectPreset.value);
  });

  const bindSlider = (id, key, formatter = formatNum) => {
    const slider = document.getElementById(id);
    const label = document.getElementById(`val-${key}`);

    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      updateParams({ [key]: value });
      label.textContent = formatter(value);
    });

    slider.addEventListener("change", () => {
      setRunning(false);
      resetState();
    });
  };

  bindSlider("slider-alpha", "alpha", formatNum);
  bindSlider("slider-beta", "beta", formatNum);
  bindSlider("slider-delta", "delta", formatNum);
  bindSlider("slider-gamma", "gamma", formatNum);
  bindSlider("slider-dt", "dt", formatNum);
  bindSlider("slider-prey0", "prey0", (v) => String(Math.round(v)));
  bindSlider("slider-predator0", "predator0", (v) => String(Math.round(v)));
}

function setupControlReactivity() {
  subscribe((s) => {
    const btnPlayPause = document.getElementById("btn-playpause");
    btnPlayPause.textContent = s.running ? "❚❚ Pause" : "▶ Run";

    document.querySelectorAll(".btn-speed").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.speed === s.speed);
    });

    document.getElementById("sim-time").textContent = `${s.t.toFixed(1)} t`;
    document.getElementById("sim-prey").textContent = s.prey.toFixed(1);
    document.getElementById("sim-pred").textContent = s.predator.toFixed(1);
  });
}

new p5((p) => {
  let simW = 0;
  let simH = 0;

  function updateCanvasSize() {
    const host = document.getElementById("sim-container");
    if (!host) return;
    simW = Math.max(240, host.clientWidth - 24);
    simH = Math.max(220, host.clientHeight - 24);
    if (p.width > 0 && p.height > 0) {
      p.resizeCanvas(simW, simH);
    }
  }

  p.setup = () => {
    const host = document.getElementById("sim-container");
    simW = Math.max(240, host.clientWidth - 24);
    simH = Math.max(220, host.clientHeight - 24);

    const canvas = p.createCanvas(simW, simH);
    canvas.parent("sim-container");

    bindControls();
    setupControlReactivity();
    syncControlsFromState();
    resetState();
  };

  p.windowResized = () => {
    updateCanvasSize();
  };

  p.draw = () => {
    p.background(247, 249, 252);

    if (state.running) {
      advanceSimulation(SPEED_TO_STEPS[state.speed] || 2);
    }

    const margin = 24;
    const centerY = simH * 0.56;
    const preyX = simW * 0.33;
    const predX = simW * 0.67;

    const preyR = p.constrain(18 + Math.sqrt(state.prey) * 3.8, 18, 130);
    const predR = p.constrain(14 + Math.sqrt(state.predator) * 4.8, 14, 130);

    p.noStroke();
    p.fill(230, 238, 250);
    p.rect(margin, margin, simW - margin * 2, simH - margin * 2, 10);

    p.fill(90, 145, 220, 180);
    p.circle(preyX, centerY, preyR * 2);

    p.fill(226, 98, 78, 180);
    p.circle(predX, centerY, predR * 2);

    p.fill(35, 35, 35);
    p.textAlign(p.CENTER, p.CENTER);
    p.textSize(14);
    p.text("Prey", preyX, centerY - preyR - 18);
    p.text("Predators", predX, centerY - predR - 18);

    p.textSize(13);
    p.text(state.prey.toFixed(1), preyX, centerY);
    p.text(state.predator.toFixed(1), predX, centerY);

    p.textAlign(p.LEFT, p.CENTER);
    p.textSize(12);
    p.fill(100, 100, 100);
    p.text("Bubble size tracks abundance", margin + 10, simH - margin - 14);
  };
});
