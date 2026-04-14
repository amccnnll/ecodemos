import {
  state,
  resetState,
  setRunning,
  setSpeed,
  setUnboundedTime,
  updateParams,
  advanceSimulation,
  subscribe,
} from "./state.js";

const SPEED_TO_STEPS = {
  slow: 1,
  normal: 2,
  fast: 6,
};

const DEFAULT_PP_PRESET = "balanced";
const DEFAULT_DYNAMIC_PRESET = "dampedSpiral";
const DEFAULT_COMP_PRESET = "coexistence";

function formatNum(value) {
  return Number(value).toFixed(2);
}

function applyCompetitionPreset(name) {
  const presets = {
    coexistence: {
      r1: 0.9,
      r2: 0.8,
      K1: 75,
      K2: 65,
      alpha12: 0.6,
      alpha21: 0.5,
      prey0: 40,
      predator0: 35,
      dt: 0.03,
    },
    species1Wins: {
      r1: 1.0,
      r2: 0.7,
      K1: 85,
      K2: 60,
      alpha12: 0.45,
      alpha21: 1.35,
      prey0: 55,
      predator0: 45,
      dt: 0.03,
    },
    species2Wins: {
      r1: 0.7,
      r2: 1.0,
      K1: 60,
      K2: 85,
      alpha12: 1.3,
      alpha21: 0.45,
      prey0: 45,
      predator0: 55,
      dt: 0.03,
    },
  };

  const selected = presets[name] || presets.coexistence;
  updateParams(selected);
  syncControlsFromState();
  resetState();
}

function applyDynamicPreset(name) {
  const presets = {
    dampedSpiral: {
      alpha: 1.0,
      beta: 0.035,
      delta: 0.02,
      gamma: 0.8,
      Kdyn: 150,
      mPred: 0.05,
      prey0: 80,
      predator0: 18,
      dt: 0.03,
    },
    slowDamping: {
      alpha: 0.6,
      beta: 0.05,
      delta: 0.01,
      gamma: 1.0,
      Kdyn: 80,
      mPred: 0.0001,
      prey0: 80,
      predator0: 12,
      dt: 0.03,
    },
    tightCycle: {
      alpha: 0.9,
      beta: 0.03,
      delta: 0.02,
      gamma: 0.75,
      Kdyn: 120,
      mPred: 0.02,
      prey0: 50,
      predator0: 14,
      dt: 0.03,
    },
  };

  const selected = presets[name] || presets.dampedSpiral;
  updateParams(selected);
  syncControlsFromState();
  resetState();
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
      alpha: 0.3,
      beta: 0.01,
      delta: 0.003,
      gamma: 1.3,
      prey0: 55,
      predator0: 22,
      dt: 0.02,
    },
    preyCrash: {
      alpha: 0.45,
      beta: 0.16,
      delta: 0.06,
      gamma: 0.4,
      prey0: 22,
      predator0: 26,
      dt: 0.02,
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

  const showCompetition = state.modelType === "competition";
  const showDynamic = state.modelType === "dynamicPredatorPrey";

  document.getElementById("select-model-type").value = state.modelType;
  document.getElementById("dynamic-params").style.display = showDynamic ? "block" : "none";
  document.getElementById("row-dynamic-preset").style.display = showDynamic ? "flex" : "none";
  document.getElementById("competition-params").style.display = showCompetition ? "block" : "none";
  document.getElementById("row-competition-preset").style.display = showCompetition ? "flex" : "none";

  document.getElementById("row-preset").style.display = showCompetition || showDynamic ? "none" : "flex";
  document.getElementById("row-alpha").style.display = showCompetition ? "none" : "flex";
  document.getElementById("row-beta").style.display = showCompetition ? "none" : "flex";
  document.getElementById("row-delta").style.display = showCompetition ? "none" : "flex";
  document.getElementById("row-gamma").style.display = showCompetition ? "none" : "flex";

  document.getElementById("label-prey0").textContent = showCompetition ? "N₁,₀" : "N₀";
  document.getElementById("label-pred0").textContent = showCompetition ? "N₂,₀" : "P₀";

  setVal("slider-alpha", state.alpha);
  setVal("slider-beta", state.beta);
  setVal("slider-delta", state.delta);
  setVal("slider-gamma", state.gamma);
  setVal("slider-dt", state.dt);
  setVal("slider-prey0", state.prey0);
  setVal("slider-predator0", state.predator0);

  setVal("slider-r1", state.r1);
  setVal("slider-r2", state.r2);
  setVal("slider-k1", state.K1);
  setVal("slider-k2", state.K2);
  setVal("slider-a12", state.alpha12);
  setVal("slider-a21", state.alpha21);
  setVal("slider-kdyn", state.Kdyn);
  setVal("slider-mpred", state.mPred);

  document.getElementById("val-alpha").textContent = formatNum(state.alpha);
  document.getElementById("val-beta").textContent = formatNum(state.beta);
  document.getElementById("val-delta").textContent = formatNum(state.delta);
  document.getElementById("val-gamma").textContent = formatNum(state.gamma);
  document.getElementById("val-dt").textContent = formatNum(state.dt);
  document.getElementById("val-prey0").textContent = String(Math.round(state.prey0));
  document.getElementById("val-predator0").textContent = String(Math.round(state.predator0));

  document.getElementById("val-r1").textContent = formatNum(state.r1);
  document.getElementById("val-r2").textContent = formatNum(state.r2);
  document.getElementById("val-k1").textContent = String(Math.round(state.K1));
  document.getElementById("val-k2").textContent = String(Math.round(state.K2));
  document.getElementById("val-a12").textContent = formatNum(state.alpha12);
  document.getElementById("val-a21").textContent = formatNum(state.alpha21);
  document.getElementById("val-kdyn").textContent = String(Math.round(state.Kdyn));
  document.getElementById("val-mpred").textContent = formatNum(state.mPred);
}

function bindControls() {
  const btnPlayPause = document.getElementById("btn-playpause");
  const btnReset = document.getElementById("btn-reset");
  const btnResetDefaults = document.getElementById("btn-reset-defaults");
  const selectPreset = document.getElementById("select-preset");
  const selectModelType = document.getElementById("select-model-type");
  const selectDynamicPreset = document.getElementById("select-dynamic-preset");
  const selectCompetitionPreset = document.getElementById("select-competition-preset");
  const checkboxUnbounded = document.getElementById("checkbox-unbounded-time");
  const complications = document.getElementById("lv-complications");

  btnPlayPause.addEventListener("click", () => {
    setRunning(!state.running);
  });

  btnReset.addEventListener("click", () => {
    setRunning(false);
    resetState();
  });

  btnResetDefaults.addEventListener("click", () => {
    setRunning(false);
    setSpeed("normal");
    setUnboundedTime(false);

    if (state.modelType === "competition") {
      selectCompetitionPreset.value = DEFAULT_COMP_PRESET;
      applyCompetitionPreset(DEFAULT_COMP_PRESET);
    } else if (state.modelType === "dynamicPredatorPrey") {
      selectDynamicPreset.value = DEFAULT_DYNAMIC_PRESET;
      applyDynamicPreset(DEFAULT_DYNAMIC_PRESET);
    } else {
      selectPreset.value = DEFAULT_PP_PRESET;
      applyPreset(DEFAULT_PP_PRESET);
    }
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

  selectModelType.addEventListener("change", () => {
    setRunning(false);
    updateParams({ modelType: selectModelType.value });

    if (selectModelType.value === "competition") {
      complications.open = true;
      applyCompetitionPreset(selectCompetitionPreset.value);
    } else if (selectModelType.value === "dynamicPredatorPrey") {
      complications.open = true;
      applyDynamicPreset(selectDynamicPreset.value);
    } else {
      applyPreset(selectPreset.value);
    }
  });

  selectDynamicPreset.addEventListener("change", () => {
    if (state.modelType !== "dynamicPredatorPrey") return;
    setRunning(false);
    applyDynamicPreset(selectDynamicPreset.value);
  });

  selectCompetitionPreset.addEventListener("change", () => {
    if (state.modelType !== "competition") return;
    setRunning(false);
    applyCompetitionPreset(selectCompetitionPreset.value);
  });

  checkboxUnbounded.addEventListener("change", () => {
    setUnboundedTime(checkboxUnbounded.checked);
  });

  const bindSlider = (id, key, formatter = formatNum, labelId = `val-${key}`) => {
    const slider = document.getElementById(id);
    const label = document.getElementById(labelId);

    slider.addEventListener("input", () => {
      const value = Number(slider.value);
      updateParams({ [key]: value });
      if (label) label.textContent = formatter(value);
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

  bindSlider("slider-r1", "r1", formatNum);
  bindSlider("slider-r2", "r2", formatNum);
  bindSlider("slider-k1", "K1", (v) => String(Math.round(v)), "val-k1");
  bindSlider("slider-k2", "K2", (v) => String(Math.round(v)), "val-k2");
  bindSlider("slider-a12", "alpha12", formatNum);
  bindSlider("slider-a21", "alpha21", formatNum);
  bindSlider("slider-kdyn", "Kdyn", (v) => String(Math.round(v)), "val-kdyn");
  bindSlider("slider-mpred", "mPred", formatNum, "val-mpred");
}

function setupControlReactivity() {
  subscribe((s) => {
    const btnPlayPause = document.getElementById("btn-playpause");
    if (s.running) {
      btnPlayPause.textContent = "❚❚ Pause";
    } else if (s.autoPausedAt !== null) {
      btnPlayPause.textContent = "▶ Resume";
    } else {
      btnPlayPause.textContent = "▶ Run";
    }

    document.querySelectorAll(".btn-speed").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.speed === s.speed);
    });

    document.getElementById("sim-time").textContent = `${s.t.toFixed(1)} t`;
    document.getElementById("sim-prey").textContent = s.prey.toFixed(1);
    document.getElementById("sim-pred").textContent = s.predator.toFixed(1);

    const checkboxUnbounded = document.getElementById("checkbox-unbounded-time");
    checkboxUnbounded.checked = s.unboundedTime;

    const pauseHint = document.getElementById("lv-autopause-hint");
    if (s.unboundedTime) {
      pauseHint.textContent = "Unbounded time is on. Simulation will not auto-pause.";
      pauseHint.style.display = "block";
    } else if (s.autoPausedAt !== null) {
      pauseHint.textContent = `Paused at t = ${s.autoPausedAt.toFixed(1)}. Press Resume to continue.`;
      pauseHint.style.display = "block";
    } else {
      pauseHint.style.display = "none";
    }

    document.getElementById("est-label-s1").textContent = s.modelType === "competition" ? "Species 1" : "Prey";
    document.getElementById("est-label-s2").textContent = s.modelType === "competition" ? "Species 2" : "Predators";
    document.getElementById("est-label-eq1").textContent = s.modelType === "competition" ? "Species 1 equilibrium" : "Prey equilibrium";
    document.getElementById("est-label-eq2").textContent = s.modelType === "competition" ? "Species 2 equilibrium" : "Predator equilibrium";
    document.getElementById("lv-phase-subtitle").textContent =
      s.modelType === "competition"
        ? "Trajectory through species 1-species 2 state space"
        : s.modelType === "dynamicPredatorPrey"
          ? "Trajectory under dynamic predator-prey equations"
          : "Trajectory through prey-predator state space";

  });
}

function tick() {
  if (state.running) {
    advanceSimulation(SPEED_TO_STEPS[state.speed] || 2);
  }
  requestAnimationFrame(tick);
}

bindControls();
setupControlReactivity();
syncControlsFromState();
resetState();
requestAnimationFrame(tick);
