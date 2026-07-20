const state = { models: new Map(), series: new Map(), selected: null, charts: new Map() };
const $ = (id) => document.getElementById(id);

const ws = new WebSocket(`ws://${location.host}`);
ws.onopen = () => ($("run-status").textContent = "running");
ws.onclose = () => ($("run-status").textContent = "disconnected");
ws.onmessage = (m) => handle(JSON.parse(m.data));

function handle(e) {
  if (e.type === "run_started") return onRunStarted(e);
  if (e.type === "metric") return onMetric(e);
  if (e.type === "breach") return onBreach(e);
  if (e.type === "push") return onPush(e);
  if (e.type === "run_done") return ($("run-status").textContent = "done");
  if (e.type === "error") return onError(e);
}

function onRunStarted(e) {
  $("target").textContent = e.target;
  for (const m of e.models) {
    state.models.set(m.externalKey, { ...m, latest: {} });
    state.series.set(m.externalKey, {});
  }
  renderFleet();
  if (!state.selected && e.models[0]) selectModel(e.models[0].externalKey);
}

function onMetric(e) {
  const model = state.models.get(e.externalKey);
  if (!model) return;
  const key = e.segment === "overall" ? e.metric : `${e.metric}:${e.segment}`;
  model.latest[key] = { value: e.value, status: e.status };
  const series = state.series.get(e.externalKey);
  (series[key] ||= []).push({ x: e.period, y: e.value, status: e.status, threshold: e.threshold });
  renderFleetCard(e.externalKey);
  if (state.selected === e.externalKey) renderCharts(e.externalKey);
}

function onBreach(e) {
  const li = document.createElement("li");
  li.className = e.severity === "warn" ? "warn" : "breach";
  const arrow = e.flagged ? " → revalidation flagged" : "";
  li.textContent = `${e.externalKey} · ${e.metric} ${e.value} · ${e.severity} · ${e.period}${arrow}`;
  $("feed-list").prepend(li);
}

const totals = { computed: 0, pushed: 0, accepted: 0, breaches: 0 };
function onPush(e) {
  totals.pushed += e.accepted;
  totals.accepted += e.results.length;
  totals.breaches += e.results.filter((r) => r.status === "breach" || r.status === "warn").length;
  totals.computed = [...state.series.values()].reduce((n, s) => n + Object.values(s).reduce((a, arr) => a + arr.length, 0), 0);
  $("t-computed").textContent = totals.computed;
  $("t-pushed").textContent = totals.pushed;
  $("t-accepted").textContent = totals.accepted;
  $("t-breaches").textContent = totals.breaches;
}

function onError(e) {
  const b = $("error-banner");
  b.hidden = false;
  b.textContent = `Error: ${e.message}`;
  $("run-status").textContent = "stopped";
}

function renderFleet() {
  const el = $("fleet-cards");
  el.innerHTML = "";
  for (const [key, m] of state.models) {
    const card = document.createElement("div");
    card.className = "model-card" + (state.selected === key ? " selected" : "");
    card.id = `card-${key}`;
    card.onclick = () => selectModel(key);
    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = m.name;
    const tierEl = document.createElement("div");
    tierEl.className = "tier";
    tierEl.textContent = `Tier ${m.tier}`;
    const metricsEl = document.createElement("div");
    metricsEl.className = "metrics";
    card.appendChild(nameEl);
    card.appendChild(tierEl);
    card.appendChild(metricsEl);
    el.appendChild(card);
    renderFleetCard(key);
  }
}

function renderFleetCard(key) {
  const card = document.getElementById(`card-${key}`);
  if (!card) return;
  const m = state.models.get(key);
  const chips = card.querySelector(".metrics");
  chips.innerHTML = "";
  for (const [mk, v] of Object.entries(m.latest)) {
    const c = document.createElement("span");
    c.className = `chip ${v.status}`;
    c.textContent = `${mk} ${v.value}`;
    chips.appendChild(c);
  }
}

function selectModel(key) {
  state.selected = key;
  document.querySelectorAll(".model-card").forEach((c) => c.classList.remove("selected"));
  document.getElementById(`card-${key}`)?.classList.add("selected");
  $("charts-title").textContent = state.models.get(key)?.name ?? key;
  renderCharts(key);
}

function renderCharts(key) {
  const series = state.series.get(key) || {};
  const grid = $("chart-grid");
  for (const [mk, arr] of Object.entries(series)) {
    let box = document.getElementById(`chart-${key}-${mk}`);
    if (!box) {
      box = document.createElement("div");
      box.className = "chart-box";
      box.id = `chart-${key}-${mk}`;
      const h3 = document.createElement("h3");
      h3.textContent = mk;
      const cvs = document.createElement("canvas");
      box.appendChild(h3);
      box.appendChild(cvs);
      grid.appendChild(box);
    }
    drawChart(box.querySelector("canvas"), `${key}-${mk}`, arr);
  }
  // Remove charts for metrics not in this model.
  for (const el of [...grid.children]) if (!el.id.startsWith(`chart-${key}-`)) el.remove();
}

function drawChart(canvas, id, arr) {
  const labels = arr.map((p) => p.x);
  const data = arr.map((p) => p.y);
  const thr = arr.find((p) => p.threshold)?.threshold;
  const line = thr && thr.value_num != null ? thr.value_num : null;
  const pointColors = arr.map((p) => (p.status === "breach" ? "#b42318" : p.status === "warn" ? "#b54708" : "#13715b"));
  const datasets = [{ data, borderColor: "#13715b", pointBackgroundColor: pointColors, tension: 0.2, pointRadius: 3 }];
  if (line != null) datasets.push({ data: labels.map(() => line), borderColor: "#b42318", borderDash: [4, 4], pointRadius: 0 });
  const existing = state.charts.get(id);
  if (existing) {
    existing.data.labels = labels;
    existing.data.datasets = datasets;
    existing.update("none");
    return;
  }
  state.charts.set(id, new Chart(canvas, { type: "line", data: { labels, datasets }, options: { animation: false, plugins: { legend: { display: false } }, scales: { x: { display: false } } } }));
}
