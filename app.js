/* ═══════════════════════════════════════════════════════════
   GEOEXPLORER — app.js  (v2)
   Fixes: tooltip convulsion, data path, paleta, textos
═══════════════════════════════════════════════════════════ */

// ── LOADING OVERLAY ───────────────────────────────────────
document.body.insertAdjacentHTML('afterbegin', `
  <div id="loading-overlay">
    <div class="loading-brand">◈ GeoExplorer</div>
    <div class="loading-sub">CARGANDO DATOS MUNDIALES...</div>
    <div class="loading-bar-wrap"><div class="loading-bar"></div></div>
  </div>
`);

// ── REGION CONFIG (paleta ajustada) ───────────────────────
const REGIONS = {
  'Africa':        { color: '#f4a932' },
  'Asia':          { color: '#cc3333' },
  'Europe':        { color: '#3399ff' },
  'North America': { color: '#33cc66' },
  'South America': { color: '#cc55ff' },
  'Oceania':       { color: '#ff6699' },
};

// ── STATE ─────────────────────────────────────────────────
const state = {
  currentYear:     2022,
  activeLayer:     'gdp',
  showPopBubbles:  true,
  activeRegions:   new Set(Object.keys(REGIONS)),
  selectedCountry: null,
  playing:         false,
  playInterval:    null,
  charts:          {},
  markers:         {},     // code → { marker, currentRec }
  rawData:         [],
  byYearCode:      {},
};

// ── HELPERS ───────────────────────────────────────────────
const fmt = {
  gdp:  v => '$' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : Math.round(v)),
  le:   v => v.toFixed(1) + ' yrs',
  pop:  v => v >= 1e9 ? (v/1e9).toFixed(2) + 'B'
           : v >= 1e6 ? (v/1e6).toFixed(1) + 'M'
           : (v/1000).toFixed(0) + 'K',
};

function gdpColor(gdp) {
  const min = 500, max = 120000;
  const t = Math.max(0, Math.min(1,
    (Math.log(gdp) - Math.log(min)) / (Math.log(max) - Math.log(min))
  ));
  const r = Math.round(20  + t * (0  - 20));
  const g = Math.round(50  + t * (204 - 50));
  const b = Math.round(60  + t * (180 - 60));
  return `rgb(${r},${g},${b})`;
}

function leColor(le) {
  const t = Math.max(0, Math.min(1, (le - 30) / 55));
  const r = Math.round(220 - t * (220 - 50));
  const g = Math.round(70  + t * (200 - 70));
  const b = Math.round(40  + t * (70  - 40));
  return `rgb(${r},${g},${b})`;
}

function getMarkerColor(rec) {
  if (state.activeLayer === 'gdp') return gdpColor(rec.gdp);
  if (state.activeLayer === 'le')  return leColor(rec.le);
  return REGIONS[rec.r]?.color || '#888';
}

function popRadius(pop) {
  return Math.max(4, Math.min(22, Math.sqrt(pop / 1e6) * 2.8));
}

// ── MAP INIT ──────────────────────────────────────────────
const map = L.map('map', {
  center: [20, 10],
  zoom: 2,
  zoomControl: false,
  attributionControl: false,
});

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '© OpenStreetMap contributors',
}).addTo(map);

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.attribution({ position: 'bottomright', prefix: '© OSM | GeoExplorer' }).addTo(map);

// ── DATA LOAD ─────────────────────────────────────────────
// Ruta actualizada: data/data.json
fetch('data/data.json')
  .then(r => r.json())
  .then(data => {
    state.rawData = data;
    data.forEach(rec => {
      if (!state.byYearCode[rec.y]) state.byYearCode[rec.y] = {};
      state.byYearCode[rec.y][rec.c] = rec;
    });

    initUI();
    renderMarkers(state.currentYear);
    renderAllCharts(state.currentYear);
    updateLegend();

    const ov = document.getElementById('loading-overlay');
    ov.classList.add('fade-out');
    setTimeout(() => ov.remove(), 500);
  })
  .catch(err => {
    console.error('Data load failed:', err);
    const sub = document.querySelector('.loading-sub');
    if (sub) sub.textContent = 'Error al cargar datos. Verifica data/data.json';
  });

// ── UI INIT ───────────────────────────────────────────────
function initUI() {
  buildRegionList();
  bindLayerCheckboxes();
  bindTimeslider();
  bindPlayButton();
  bindLegendToggle();
  bindHeaderButtons();
  bindSectionToggles();
}

// ── REGION LIST ───────────────────────────────────────────
function buildRegionList() {
  const container = document.getElementById('region-list');
  container.innerHTML = '';
  Object.entries(REGIONS).forEach(([name, cfg]) => {
    const div = document.createElement('div');
    div.className = 'region-item active';
    div.dataset.region = name;
    div.style.setProperty('--region-color', cfg.color);
    div.innerHTML = `
      <span class="region-dot"></span>
      <span>${name}</span>
      <span class="region-check">✓</span>
    `;
    div.addEventListener('click', () => toggleRegion(name, div));
    container.appendChild(div);
  });
}

function toggleRegion(name, el) {
  if (state.activeRegions.has(name)) {
    state.activeRegions.delete(name);
    el.classList.remove('active');
  } else {
    state.activeRegions.add(name);
    el.classList.add('active');
  }
  renderMarkers(state.currentYear);
  renderAllCharts(state.currentYear);
}

// ── LAYER CHECKBOXES ──────────────────────────────────────
function bindLayerCheckboxes() {
  document.querySelectorAll('.layer-item').forEach(item => {
    const layer = item.dataset.layer;
    item.addEventListener('click', () => {
      if (layer === 'pop') {
        state.showPopBubbles = !state.showPopBubbles;
        item.classList.toggle('active', state.showPopBubbles);
        updateAllMarkerStyles();
        return;
      }
      document.querySelectorAll('.layer-item[data-layer="gdp"], .layer-item[data-layer="le"]')
        .forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      state.activeLayer = layer;
      updateAllMarkerStyles();
      updateLegend();
    });
  });
}

// ── TIME SLIDER ───────────────────────────────────────────
function bindTimeslider() {
  document.getElementById('year-slider').addEventListener('input', e => {
    setYear(parseInt(e.target.value));
  });
}

function setYear(yr) {
  state.currentYear = yr;
  document.getElementById('year-badge').textContent = yr;
  document.getElementById('year-display-header').textContent = yr;
  document.getElementById('right-year-label').textContent = yr;
  document.getElementById('year-slider').value = yr;
  renderMarkers(yr);
  renderAllCharts(yr);
  if (state.selectedCountry) updateCountryCard(state.selectedCountry);
}

// ── PLAY ──────────────────────────────────────────────────
function bindPlayButton() {
  const btn = document.getElementById('play-btn');
  btn.addEventListener('click', () => {
    if (state.playing) {
      clearInterval(state.playInterval);
      state.playing = false;
      btn.textContent = '▶';
      btn.classList.remove('playing');
    } else {
      state.playing = true;
      btn.textContent = '■';
      btn.classList.add('playing');
      if (state.currentYear >= 2022) setYear(1950);
      state.playInterval = setInterval(() => {
        const next = state.currentYear + 1;
        if (next > 2022) {
          clearInterval(state.playInterval);
          state.playing = false;
          btn.textContent = '▶';
          btn.classList.remove('playing');
          return;
        }
        setYear(next);
      }, 120);
    }
  });
}

// ── LEGEND ────────────────────────────────────────────────
function bindLegendToggle() {
  document.getElementById('legend-toggle').addEventListener('click', () => {
    document.getElementById('legend-panel').classList.toggle('hidden');
  });
}

function updateLegend() {
  const content = document.getElementById('legend-content');
  const layer = state.activeLayer;

  let html = `<div class="legend-scale">
    <div class="legend-scale-title">${layer === 'gdp' ? 'GDP PER CÁPITA' : 'ESPERANZA DE VIDA'}</div>`;
  if (layer === 'gdp') {
    html += `<div class="legend-gradient" style="background:linear-gradient(to right,#142832,#00ccb4)"></div>
             <div class="legend-scale-labels"><span>$500</span><span>$120k+</span></div>`;
  } else {
    html += `<div class="legend-gradient" style="background:linear-gradient(to right,rgb(220,70,40),rgb(50,200,70))"></div>
             <div class="legend-scale-labels"><span>30 yrs</span><span>85 yrs</span></div>`;
  }
  html += `</div><div class="legend-scale" style="margin-top:10px">
    <div class="legend-scale-title">REGIONES</div>`;
  Object.entries(REGIONS).forEach(([name, cfg]) => {
    if (state.activeRegions.has(name)) {
      html += `<div class="legend-item">
        <span class="legend-swatch" style="background:${cfg.color}"></span>
        <span>${name}</span>
      </div>`;
    }
  });
  html += `</div>`;
  if (state.showPopBubbles) {
    html += `<div class="legend-scale" style="margin-top:10px">
      <div class="legend-scale-title">POBLACIÓN (radio burbuja)</div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:5px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#3399ff;opacity:.7"></span>
        <span style="font-size:12px;color:#aab8cc">1M</span>
        <span style="display:inline-block;width:18px;height:18px;border-radius:50%;background:#3399ff;opacity:.7"></span>
        <span style="font-size:12px;color:#aab8cc">100M+</span>
      </div></div>`;
  }
  content.innerHTML = html;
}

// ── HEADER BUTTONS ────────────────────────────────────────
function bindHeaderButtons() {
  document.getElementById('btn-download').addEventListener('click', () => {
    const yr = state.currentYear;
    const recs = Object.values(state.byYearCode[yr] || {})
      .filter(r => state.activeRegions.has(r.r));
    const csv = [
      'Entity,Code,Year,Life Expectancy,GDP per Capita,Population,Region',
      ...recs.map(r => `${r.e},${r.c},${r.y},${r.le},${r.gdp},${r.pop},${r.r}`)
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `geoexplorer_${yr}.csv`;
    a.click();
  });
}

// ── SECTION TOGGLES ───────────────────────────────────────
function bindSectionToggles() {
  document.querySelectorAll('.section-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const sec = document.getElementById('sec-' + btn.dataset.section);
      if (!sec) return;
      const collapsed = sec.style.display === 'none';
      sec.style.display = collapsed ? '' : 'none';
      btn.classList.toggle('collapsed', !collapsed);
    });
  });
}

// ══════════════════════════════════════════════════════════
// MAP MARKERS  — FIX CONVULSIÓN
// Estrategia: crear markers UNA SOLA VEZ por código de país.
// Solo actualizar style/radius en cada cambio de año.
// El tooltip se vincula sin 'sticky', con pointer-events:none.
// ══════════════════════════════════════════════════════════

function renderMarkers(year) {
  const yearData = state.byYearCode[year] || {};

  // 1) Ocultar markers de países sin datos o región desactivada
  Object.entries(state.markers).forEach(([code, obj]) => {
    const rec = yearData[code];
    const visible = rec && state.activeRegions.has(rec.r);
    if (visible) {
      obj.marker.addTo(map);
    } else {
      obj.marker.remove();
    }
  });

  // 2) Crear markers nuevos (solo si no existen aún)
  Object.values(yearData).forEach(rec => {
    if (!state.activeRegions.has(rec.r)) return;
    if (!state.markers[rec.c]) {
      _createMarker(rec);
    }
  });

  // 3) Actualizar estilos de todos los markers visibles
  Object.entries(state.markers).forEach(([code, obj]) => {
    const rec = yearData[code];
    if (!rec) return;
    _updateMarkerStyle(obj.marker, rec, code === state.selectedCountry);
  });
}

function _createMarker(rec) {
  // Usamos circleMarker SIN tooltip de Leaflet para evitar la convulsión.
  // El tooltip se muestra via un div HTML estático.
  const m = L.circleMarker([rec.lat, rec.lng], {
    radius:      state.showPopBubbles ? popRadius(rec.pop) : 6,
    fillColor:   getMarkerColor(rec),
    fillOpacity: 0.78,
    color:       '#ffffff',
    weight:      0,
    interactive: true,
  });

  // Tooltip simple sin sticky ni permanent — evita el re-render agresivo
  m.bindTooltip('', {
    permanent:   false,
    sticky:      false,
    interactive: false,
    offset:      L.point(10, 0),
    direction:   'right',
  });

  m.on('mouseover', function(e) {
    const yr  = state.currentYear;
    const r   = state.byYearCode[yr]?.[rec.c];
    if (!r) return;
    const tip = `<b>${r.e}</b><br>GDP: ${fmt.gdp(r.gdp)} &nbsp;|&nbsp; LE: ${fmt.le(r.le)}<br>Pop: ${fmt.pop(r.pop)}`;
    this.setTooltipContent(tip);
    this.openTooltip();
  });

  m.on('mouseout', function() {
    this.closeTooltip();
  });

  m.on('click', () => selectCountry(rec.c));

  state.markers[rec.c] = { marker: m, code: rec.c };
  m.addTo(map);
}

function _updateMarkerStyle(m, rec, isSelected) {
  const color  = getMarkerColor(rec);
  const radius = state.showPopBubbles ? popRadius(rec.pop) : 6;
  m.setStyle({
    fillColor:   color,
    fillOpacity: isSelected ? 1.0 : 0.78,
    color:       isSelected ? '#ffffff' : '#000000',
    weight:      isSelected ? 2 : 0,
    radius,
  });
  m.setRadius(radius);
}

// Actualiza solo estilos (sin recrear) cuando cambia capa o región
function updateAllMarkerStyles() {
  const yearData = state.byYearCode[state.currentYear] || {};
  Object.entries(state.markers).forEach(([code, obj]) => {
    const rec = yearData[code];
    if (!rec) return;
    const visible = state.activeRegions.has(rec.r);
    if (visible) {
      obj.marker.addTo(map);
      _updateMarkerStyle(obj.marker, rec, code === state.selectedCountry);
    } else {
      obj.marker.remove();
    }
  });
}

function selectCountry(code) {
  const prev = state.selectedCountry;
  state.selectedCountry = code;

  // Reset previous
  if (prev && state.markers[prev]) {
    const rec = state.byYearCode[state.currentYear]?.[prev];
    if (rec) _updateMarkerStyle(state.markers[prev].marker, rec, false);
  }
  // Highlight new
  if (state.markers[code]) {
    const rec = state.byYearCode[state.currentYear]?.[code];
    if (rec) _updateMarkerStyle(state.markers[code].marker, rec, true);
  }

  updateCountryCard(code);
  renderTrendChart(code);
}

function updateCountryCard(code) {
  const rec  = state.byYearCode[state.currentYear]?.[code];
  const card = document.getElementById('active-country-card');
  if (!rec) {
    card.innerHTML = `<div class="country-placeholder">Sin datos para ${code} en ${state.currentYear}</div>`;
    return;
  }
  const rc = REGIONS[rec.r]?.color || '#888';
  card.innerHTML = `
    <div class="country-name">${rec.e}</div>
    <div class="stat-row">
      <span class="stat-label">Región</span>
      <span class="stat-value" style="color:${rc}">${rec.r}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">GDP p/c</span>
      <span class="stat-value">${fmt.gdp(rec.gdp)}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Esperanza vida</span>
      <span class="stat-value orange">${fmt.le(rec.le)}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Población</span>
      <span class="stat-value purple">${fmt.pop(rec.pop)}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Año</span>
      <span class="stat-value">${state.currentYear}</span>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════════
const CFONT   = "'DM Mono', monospace";
const CGRID   = 'rgba(30,42,58,0.9)';
const CTICK   = '#aab8cc';
const CWHITE  = '#ffffff';

function chartDefaults() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0d1117',
        borderColor: '#2e4060',
        borderWidth: 1,
        titleColor: CWHITE,
        bodyColor: CTICK,
        titleFont: { family: CFONT, size: 12 },
        bodyFont:  { family: CFONT, size: 11 },
        padding: 9,
      },
    },
  };
}

function scaleDef() {
  return {
    grid:  { color: CGRID },
    ticks: { color: CTICK, font: { family: CFONT, size: 11 } },
  };
}

function renderAllCharts(year) {
  const recs = Object.values(state.byYearCode[year] || {})
    .filter(r => state.activeRegions.has(r.r));
  renderScatter(recs);
  renderDonut(recs);
  renderBarLE(recs);
  renderBarGDP(recs);
  if (!state.selectedCountry) renderTrendChart(null);
}

// ── SCATTER ───────────────────────────────────────────────
function renderScatter(recs) {
  const ctx = document.getElementById('chart-scatter').getContext('2d');
  const datasets = Object.entries(REGIONS).map(([name, cfg]) => ({
    label: name,
    data: recs.filter(r => r.r === name)
              .map(r => ({ x: Math.log10(r.gdp), y: r.le, label: r.e, code: r.c, gdp: r.gdp })),
    backgroundColor: cfg.color + 'bb',
    borderColor:     cfg.color,
    borderWidth: 0.5,
    pointRadius: 4,
    pointHoverRadius: 6,
  }));

  if (state.charts.scatter) {
    state.charts.scatter.data.datasets = datasets;
    state.charts.scatter.update('none');
    return;
  }

  state.charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      ...chartDefaults(),
      plugins: {
        ...chartDefaults().plugins,
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            color: CTICK,
            font: { family: CFONT, size: 10 },
            boxWidth: 8, boxHeight: 8, padding: 4,
            usePointStyle: true,
          },
        },
        tooltip: {
          ...chartDefaults().plugins.tooltip,
          callbacks: {
            label: c => `${c.raw.label}: ${fmt.gdp(c.raw.gdp)} | ${c.raw.y.toFixed(1)} yrs`,
          },
        },
      },
      scales: {
        x: {
          ...scaleDef(),
          title: { display: true, text: 'GDP p/c (log)', color: CTICK, font: { family: CFONT, size: 10 } },
          ticks: { ...scaleDef().ticks, callback: v => '$' + Math.round(Math.pow(10, v)).toLocaleString() },
        },
        y: {
          ...scaleDef(),
          title: { display: true, text: 'Años vida', color: CTICK, font: { family: CFONT, size: 10 } },
        },
      },
      onClick: (e, els) => {
        if (!els.length) return;
        const code = state.charts.scatter.data.datasets[els[0].datasetIndex].data[els[0].index].code;
        selectCountry(code);
      },
    },
  });
}

// ── DONUT ─────────────────────────────────────────────────
function renderDonut(recs) {
  const ctx      = document.getElementById('chart-donut').getContext('2d');
  const names    = Object.keys(REGIONS).filter(r => state.activeRegions.has(r));
  const pops     = names.map(r => recs.filter(x => x.r === r).reduce((a, b) => a + b.pop, 0));
  const colors   = names.map(r => REGIONS[r].color);

  if (state.charts.donut) {
    state.charts.donut.data.labels = names;
    state.charts.donut.data.datasets[0].data = pops;
    state.charts.donut.data.datasets[0].backgroundColor = colors;
    state.charts.donut.update('none');
    return;
  }

  state.charts.donut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: names,
      datasets: [{ data: pops, backgroundColor: colors, borderColor: '#0d1117', borderWidth: 2, hoverOffset: 4 }],
    },
    options: {
      ...chartDefaults(),
      cutout: '60%',
      plugins: {
        ...chartDefaults().plugins,
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: CWHITE,
            font: { family: CFONT, size: 10 },
            boxWidth: 9, boxHeight: 9, padding: 4,
            usePointStyle: true,
          },
        },
        tooltip: {
          ...chartDefaults().plugins.tooltip,
          callbacks: { label: c => `${c.label}: ${fmt.pop(c.raw)}` },
        },
      },
    },
  });
}

// ── BAR LE ────────────────────────────────────────────────
function renderBarLE(recs) {
  const ctx    = document.getElementById('chart-bar').getContext('2d');
  const sorted = [...recs].sort((a, b) => b.le - a.le).slice(0, 10);
  const labels = sorted.map(r => r.c);
  const values = sorted.map(r => r.le);
  const colors = sorted.map(r => REGIONS[r.r]?.color || '#888');

  if (state.charts.barLE) {
    state.charts.barLE.data.labels = labels;
    state.charts.barLE.data.datasets[0].data   = values;
    state.charts.barLE.data.datasets[0].backgroundColor = colors;
    state.charts.barLE.update('none');
    return;
  }

  state.charts.barLE = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
    options: {
      ...chartDefaults(),
      indexAxis: 'y',
      scales: {
        x: { ...scaleDef(), ticks: { ...scaleDef().ticks, callback: v => v + ' yr' } },
        y: { ...scaleDef() },
      },
      plugins: {
        ...chartDefaults().plugins,
        tooltip: { ...chartDefaults().plugins.tooltip, callbacks: { label: c => fmt.le(c.raw) } },
      },
      onClick: (e, els) => {
        if (!els.length) return;
        selectCountry(sorted[els[0].index].c);
      },
    },
  });
}

// ── BAR GDP ───────────────────────────────────────────────
function renderBarGDP(recs) {
  const ctx    = document.getElementById('chart-gdp').getContext('2d');
  const sorted = [...recs].sort((a, b) => b.gdp - a.gdp).slice(0, 10);
  const labels = sorted.map(r => r.c);
  const values = sorted.map(r => r.gdp);
  const colors = sorted.map(r => REGIONS[r.r]?.color || '#888');

  if (state.charts.barGDP) {
    state.charts.barGDP.data.labels = labels;
    state.charts.barGDP.data.datasets[0].data   = values;
    state.charts.barGDP.data.datasets[0].backgroundColor = colors;
    state.charts.barGDP.update('none');
    return;
  }

  state.charts.barGDP = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 3, borderSkipped: false }] },
    options: {
      ...chartDefaults(),
      indexAxis: 'y',
      scales: {
        x: { ...scaleDef(), ticks: { ...scaleDef().ticks, callback: v => fmt.gdp(v) } },
        y: { ...scaleDef() },
      },
      plugins: {
        ...chartDefaults().plugins,
        tooltip: { ...chartDefaults().plugins.tooltip, callbacks: { label: c => fmt.gdp(c.raw) } },
      },
      onClick: (e, els) => {
        if (!els.length) return;
        selectCountry(sorted[els[0].index].c);
      },
    },
  });
}

// ── TREND LINE ────────────────────────────────────────────
function renderTrendChart(code) {
  const ctx   = document.getElementById('chart-trend').getContext('2d');
  const lbl   = document.getElementById('trend-country-label');
  let trendData;

  if (code) {
    trendData = state.rawData.filter(r => r.c === code).sort((a, b) => a.y - b.y);
    lbl.textContent = trendData[0]?.e || code;
  } else {
    const byYear = {};
    state.rawData.forEach(r => {
      if (!state.activeRegions.has(r.r)) return;
      if (!byYear[r.y]) byYear[r.y] = { le: 0, gdp: 0, n: 0 };
      byYear[r.y].le  += r.le;
      byYear[r.y].gdp += r.gdp;
      byYear[r.y].n++;
    });
    trendData = Object.entries(byYear)
      .sort((a, b) => +a[0] - +b[0])
      .map(([y, v]) => ({ y: +y, le: v.le / v.n, gdp: v.gdp / v.n }));
    lbl.textContent = 'Promedio Global';
  }

  const years  = trendData.map(r => r.y);
  const leVals = trendData.map(r => r.le);
  const gdpVals= trendData.map(r => r.gdp);

  if (state.charts.trend) {
    state.charts.trend.data.labels = years;
    state.charts.trend.data.datasets[0].data = leVals;
    state.charts.trend.data.datasets[1].data = gdpVals;
    state.charts.trend.update('none');
    return;
  }

  state.charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Esperanza vida',
          data: leVals,
          borderColor: '#e05c2a',
          backgroundColor: 'rgba(224,92,42,0.12)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y',
          fill: true,
        },
        {
          label: 'GDP p/c',
          data: gdpVals,
          borderColor: '#00ccb4',
          backgroundColor: 'rgba(0,204,180,0.06)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y2',
        },
      ],
    },
    options: {
      ...chartDefaults(),
      scales: {
        x: { ...scaleDef(), ticks: { ...scaleDef().ticks, maxTicksLimit: 6 } },
        y: {
          ...scaleDef(),
          position: 'left',
          ticks: { ...scaleDef().ticks, callback: v => v + 'yr', color: '#e05c2a' },
        },
        y2: {
          ...scaleDef(),
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { ...scaleDef().ticks, callback: v => fmt.gdp(v), color: '#00ccb4' },
        },
      },
      plugins: {
        ...chartDefaults().plugins,
        legend: {
          display: true,
          labels: {
            color: CWHITE,
            font: { family: CFONT, size: 11 },
            boxWidth: 12, boxHeight: 2, padding: 6,
          },
        },
      },
    },
  });
}
