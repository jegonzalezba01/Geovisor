/* ═══════════════════════════════════════════════════════════
   GEOEXPLORER — app.js  (v3)
   Nuevas capas: Fertilidad, HDI, Pobreza extrema
   Rango slider restringido a 1990–2022
   Nuevas gráficas: Top10 HDI, Top10 Pobreza, Scatter HDI×Fert,
                    Scatter GDP×Pov, Serie temporal indicadores extra
═══════════════════════════════════════════════════════════ */

// ── LOADING OVERLAY ───────────────────────────────────────
document.body.insertAdjacentHTML('afterbegin', `
  <div id="loading-overlay">
    <div class="loading-brand">◈ GeoExplorer</div>
    <div class="loading-sub">CARGANDO DATOS MUNDIALES...</div>
    <div class="loading-bar-wrap"><div class="loading-bar"></div></div>
  </div>
`);

// ── CONSTANTS ─────────────────────────────────────────────
const YEAR_MIN = 1990;
const YEAR_MAX = 2022;
const YEAR_DEFAULT = 2015;

// ── REGION CONFIG ─────────────────────────────────────────
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
  currentYear:     YEAR_DEFAULT,
  activeLayer:     'gdp',
  showPopBubbles:  true,
  activeRegions:   new Set(Object.keys(REGIONS)),
  selectedCountry: null,
  playing:         false,
  playInterval:    null,
  charts:          {},
  markers:         {},
  rawData:         [],
  byYearCode:      {},
  extraByYearCode: {},
};

// ── HELPERS ───────────────────────────────────────────────
const fmt = {
  gdp:  v => '$' + (v >= 1000 ? (v/1000).toFixed(1) + 'k' : Math.round(v)),
  le:   v => v.toFixed(1) + ' yrs',
  pop:  v => v >= 1e9 ? (v/1e9).toFixed(2) + 'B' : v >= 1e6 ? (v/1e6).toFixed(1) + 'M' : (v/1000).toFixed(0) + 'K',
  fert: v => v.toFixed(2) + ' h/m',
  hdi:  v => v.toFixed(3),
  pov:  v => v.toFixed(1) + '%',
};

// ── COLOR SCALES ──────────────────────────────────────────
function gdpColor(gdp) {
  const min = 500, max = 120000;
  const t = Math.max(0, Math.min(1, (Math.log(gdp)-Math.log(min))/(Math.log(max)-Math.log(min))));
  return `rgb(${Math.round(20+t*(0-20))},${Math.round(50+t*(204-50))},${Math.round(60+t*(180-60))})`;
}
function leColor(le) {
  const t = Math.max(0, Math.min(1, (le-30)/55));
  return `rgb(${Math.round(220-t*170)},${Math.round(70+t*130)},${Math.round(40+t*30)})`;
}
function fertColor(fert) {
  const t = Math.max(0, Math.min(1, (fert-1)/6));
  return `rgb(${Math.round(80+t*160)},${Math.round(20+t*80)},${Math.round(160-t*140)})`;
}
function hdiColor(hdi) {
  const t = Math.max(0, Math.min(1, (hdi-0.3)/0.7));
  return `rgb(${Math.round(200-t*200)},${Math.round(60+t*160)},${Math.round(80+t*120)})`;
}
function povColor(pov) {
  const t = Math.max(0, Math.min(1, pov/80));
  return `rgb(${Math.round(30+t*190)},${Math.round(180-t*150)},${Math.round(80-t*60)})`;
}

function getMarkerColor(rec) {
  const ex = state.extraByYearCode[state.currentYear]?.[rec.c];
  switch (state.activeLayer) {
    case 'gdp':  return gdpColor(rec.gdp);
    case 'le':   return leColor(rec.le);
    case 'fert': return ex?.fert != null ? fertColor(ex.fert) : '#333';
    case 'hdi':  return ex?.hdi  != null ? hdiColor(ex.hdi)  : '#333';
    case 'pov':  return ex?.pov  != null ? povColor(ex.pov)  : '#333';
    default:     return REGIONS[rec.r]?.color || '#888';
  }
}
function popRadius(pop) { return Math.max(4, Math.min(22, Math.sqrt(pop/1e6)*2.8)); }

// ── MAP INIT ──────────────────────────────────────────────
const map = L.map('map', { center:[20,10], zoom:2, zoomControl:false, attributionControl:false });
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:18 }).addTo(map);
L.control.zoom({ position:'bottomright' }).addTo(map);
L.control.attribution({ position:'bottomright', prefix:'© OSM | GeoExplorer' }).addTo(map);

// ── DATA LOAD ─────────────────────────────────────────────
Promise.all([
  fetch('data/GPD&LE.json').then(r => r.json()),
  fetch('data/extra_data.json').then(r => r.json()),
])
.then(([mainData, extraData]) => {
  state.rawData = mainData;
  mainData.forEach(rec => {
    if (rec.y < YEAR_MIN || rec.y > YEAR_MAX) return;
    if (!state.byYearCode[rec.y]) state.byYearCode[rec.y] = {};
    state.byYearCode[rec.y][rec.c] = rec;
  });
  Object.entries(extraData).forEach(([yr, codes]) => {
    state.extraByYearCode[+yr] = codes;
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
  if (sub) sub.textContent = 'Error al cargar datos. Verifica data/';
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

function buildRegionList() {
  const container = document.getElementById('region-list');
  container.innerHTML = '';
  Object.entries(REGIONS).forEach(([name, cfg]) => {
    const div = document.createElement('div');
    div.className = 'region-item active';
    div.dataset.region = name;
    div.style.setProperty('--region-color', cfg.color);
    div.innerHTML = `<span class="region-dot"></span><span>${name}</span><span class="region-check">✓</span>`;
    div.addEventListener('click', () => toggleRegion(name, div));
    container.appendChild(div);
  });
}
function toggleRegion(name, el) {
  if (state.activeRegions.has(name)) { state.activeRegions.delete(name); el.classList.remove('active'); }
  else { state.activeRegions.add(name); el.classList.add('active'); }
  renderMarkers(state.currentYear);
  renderAllCharts(state.currentYear);
}

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
      document.querySelectorAll('.layer-item:not([data-layer="pop"])').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      state.activeLayer = layer;
      updateAllMarkerStyles();
      updateLegend();
    });
  });
}

function bindTimeslider() {
  const slider = document.getElementById('year-slider');
  slider.min   = YEAR_MIN;
  slider.max   = YEAR_MAX;
  slider.value = YEAR_DEFAULT;
  const ticks  = document.querySelector('.slider-ticks');
  if (ticks) {
    ticks.innerHTML = '';
    [1990,1995,2000,2005,2010,2015,2020,2022].forEach(y => {
      const s = document.createElement('span'); s.textContent = y; ticks.appendChild(s);
    });
  }
  slider.addEventListener('input', e => setYear(parseInt(e.target.value)));
}

function setYear(yr) {
  state.currentYear = yr;
  document.getElementById('year-badge').textContent          = yr;
  document.getElementById('year-display-header').textContent = yr;
  document.getElementById('right-year-label').textContent    = yr;
  document.getElementById('year-slider').value               = yr;
  renderMarkers(yr);
  renderAllCharts(yr);
  if (state.selectedCountry) updateCountryCard(state.selectedCountry);
}

function bindPlayButton() {
  const btn = document.getElementById('play-btn');
  btn.addEventListener('click', () => {
    if (state.playing) {
      clearInterval(state.playInterval);
      state.playing = false; btn.textContent = '▶'; btn.classList.remove('playing');
    } else {
      state.playing = true; btn.textContent = '■'; btn.classList.add('playing');
      if (state.currentYear >= YEAR_MAX) setYear(YEAR_MIN);
      state.playInterval = setInterval(() => {
        const next = state.currentYear + 1;
        if (next > YEAR_MAX) {
          clearInterval(state.playInterval);
          state.playing = false; btn.textContent = '▶'; btn.classList.remove('playing');
          return;
        }
        setYear(next);
      }, 120);
    }
  });
}

function bindLegendToggle() {
  document.getElementById('legend-toggle').addEventListener('click', () => {
    document.getElementById('legend-panel').classList.toggle('hidden');
  });
}

function updateLegend() {
  const content = document.getElementById('legend-content');
  const layer   = state.activeLayer;
  const META = {
    gdp:  { label:'GDP PER CÁPITA',       grad:'linear-gradient(to right,#142832,#00ccb4)',                          from:'$500',  to:'$120k+' },
    le:   { label:'ESPERANZA DE VIDA',     grad:'linear-gradient(to right,rgb(220,70,40),rgb(50,200,70))',            from:'30 yrs',to:'85 yrs' },
    fert: { label:'FERTILIDAD',            grad:'linear-gradient(to right,rgb(80,20,160),rgb(240,100,20))',           from:'1 h/m', to:'7+ h/m' },
    hdi:  { label:'ÍND. DESARR. HUMANO',   grad:'linear-gradient(to right,rgb(200,60,80),rgb(0,220,200))',            from:'0.3',   to:'1.0'    },
    pov:  { label:'POBREZA EXTREMA ($3/d)',grad:'linear-gradient(to right,rgb(30,180,80),rgb(220,30,20))',            from:'0%',    to:'80%+'   },
  };
  const m = META[layer] || META.gdp;
  let html = `<div class="legend-scale">
    <div class="legend-scale-title">${m.label}</div>
    <div class="legend-gradient" style="background:${m.grad}"></div>
    <div class="legend-scale-labels"><span>${m.from}</span><span>${m.to}</span></div>
  </div>
  <div class="legend-scale" style="margin-top:10px">
    <div class="legend-scale-title">REGIONES</div>`;
  Object.entries(REGIONS).forEach(([name, cfg]) => {
    if (state.activeRegions.has(name))
      html += `<div class="legend-item"><span class="legend-swatch" style="background:${cfg.color}"></span><span>${name}</span></div>`;
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

function bindHeaderButtons() {
  document.getElementById('btn-download').addEventListener('click', () => {
    const yr    = state.currentYear;
    const recs  = Object.values(state.byYearCode[yr] || {}).filter(r => state.activeRegions.has(r.r));
    const extra = state.extraByYearCode[yr] || {};
    const csv   = [
      'Entity,Code,Year,Life Expectancy,GDP per Capita,Population,Region,Fertility,HDI,Poverty%',
      ...recs.map(r => { const ex = extra[r.c]||{}; return `${r.e},${r.c},${r.y},${r.le},${r.gdp},${r.pop},${r.r},${ex.fert??''},${ex.hdi??''},${ex.pov??''}`; })
    ].join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `geoexplorer_${yr}.csv`;
    a.click();
  });
}

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
// MAP MARKERS
// ══════════════════════════════════════════════════════════
function renderMarkers(year) {
  const yearData = state.byYearCode[year] || {};
  Object.entries(state.markers).forEach(([code, obj]) => {
    const rec     = yearData[code];
    const visible = rec && state.activeRegions.has(rec.r);
    if (visible) obj.marker.addTo(map); else obj.marker.remove();
  });
  Object.values(yearData).forEach(rec => {
    if (!state.activeRegions.has(rec.r)) return;
    if (!state.markers[rec.c]) _createMarker(rec);
  });
  Object.entries(state.markers).forEach(([code, obj]) => {
    const rec = yearData[code];
    if (!rec) return;
    _updateMarkerStyle(obj.marker, rec, code === state.selectedCountry);
  });
}

function _createMarker(rec) {
  const m = L.circleMarker([rec.lat, rec.lng], {
    radius: state.showPopBubbles ? popRadius(rec.pop) : 6,
    fillColor: getMarkerColor(rec), fillOpacity: 0.78,
    color: '#000000', weight: 0, interactive: true,
  });
  m.bindTooltip('', { permanent:false, sticky:false, interactive:false, offset:L.point(10,0), direction:'right' });
  m.on('mouseover', function() {
    const yr = state.currentYear;
    const r  = state.byYearCode[yr]?.[rec.c];
    const ex = state.extraByYearCode[yr]?.[rec.c];
    if (!r) return;
    let tip = `<b>${r.e}</b><br>GDP: ${fmt.gdp(r.gdp)} &nbsp;|&nbsp; LE: ${fmt.le(r.le)}<br>Pop: ${fmt.pop(r.pop)}`;
    if (ex?.fert != null) tip += `<br>Fertilidad: ${fmt.fert(ex.fert)}`;
    if (ex?.hdi  != null) tip += ` &nbsp;|&nbsp; HDI: ${fmt.hdi(ex.hdi)}`;
    if (ex?.pov  != null) tip += `<br>Pobreza: ${fmt.pov(ex.pov)}`;
    this.setTooltipContent(tip); this.openTooltip();
  });
  m.on('mouseout', function() { this.closeTooltip(); });
  m.on('click', () => selectCountry(rec.c));
  state.markers[rec.c] = { marker: m, code: rec.c };
  m.addTo(map);
}

function _updateMarkerStyle(m, rec, isSelected) {
  m.setStyle({
    fillColor:   getMarkerColor(rec),
    fillOpacity: isSelected ? 1.0 : 0.78,
    color:       isSelected ? '#ffffff' : '#000000',
    weight:      isSelected ? 2 : 0,
  });
  m.setRadius(state.showPopBubbles ? popRadius(rec.pop) : 6);
}

function updateAllMarkerStyles() {
  const yearData = state.byYearCode[state.currentYear] || {};
  Object.entries(state.markers).forEach(([code, obj]) => {
    const rec = yearData[code];
    if (!rec) return;
    const visible = state.activeRegions.has(rec.r);
    if (visible) { obj.marker.addTo(map); _updateMarkerStyle(obj.marker, rec, code === state.selectedCountry); }
    else obj.marker.remove();
  });
}

function selectCountry(code) {
  const prev = state.selectedCountry;
  state.selectedCountry = code;
  if (prev && state.markers[prev]) {
    const rec = state.byYearCode[state.currentYear]?.[prev];
    if (rec) _updateMarkerStyle(state.markers[prev].marker, rec, false);
  }
  if (state.markers[code]) {
    const rec = state.byYearCode[state.currentYear]?.[code];
    if (rec) _updateMarkerStyle(state.markers[code].marker, rec, true);
  }
  updateCountryCard(code);
  renderTrendChart(code);
}

function updateCountryCard(code) {
  const rec  = state.byYearCode[state.currentYear]?.[code];
  const ex   = state.extraByYearCode[state.currentYear]?.[code];
  const card = document.getElementById('active-country-card');
  if (!rec) { card.innerHTML = `<div class="country-placeholder">Sin datos para ${code} en ${state.currentYear}</div>`; return; }
  const rc = REGIONS[rec.r]?.color || '#888';
  card.innerHTML = `
    <div class="country-name">${rec.e}</div>
    <div class="stat-row"><span class="stat-label">Región</span><span class="stat-value" style="color:${rc}">${rec.r}</span></div>
    <div class="stat-row"><span class="stat-label">GDP p/c</span><span class="stat-value">${fmt.gdp(rec.gdp)}</span></div>
    <div class="stat-row"><span class="stat-label">Esp. de vida</span><span class="stat-value orange">${fmt.le(rec.le)}</span></div>
    <div class="stat-row"><span class="stat-label">Población</span><span class="stat-value purple">${fmt.pop(rec.pop)}</span></div>
    ${ex?.fert != null ? `<div class="stat-row"><span class="stat-label">Fertilidad</span><span class="stat-value fert">${fmt.fert(ex.fert)}</span></div>` : ''}
    ${ex?.hdi  != null ? `<div class="stat-row"><span class="stat-label">HDI</span><span class="stat-value hdi">${fmt.hdi(ex.hdi)}</span></div>` : ''}
    ${ex?.pov  != null ? `<div class="stat-row"><span class="stat-label">Pobreza extrema</span><span class="stat-value pov">${fmt.pov(ex.pov)}</span></div>` : ''}
    <div class="stat-row"><span class="stat-label">Año</span><span class="stat-value">${state.currentYear}</span></div>`;
}

// ══════════════════════════════════════════════════════════
// CHARTS
// ══════════════════════════════════════════════════════════
const CFONT = "'DM Mono', monospace";
const CGRID = 'rgba(30,42,58,0.9)';
const CTICK = '#aab8cc';
const CWHITE = '#ffffff';

function chartDefaults() {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor:'#0d1117', borderColor:'#2e4060', borderWidth:1,
        titleColor:CWHITE, bodyColor:CTICK,
        titleFont:{family:CFONT,size:12}, bodyFont:{family:CFONT,size:11}, padding:9,
      },
    },
  };
}
function scaleDef() {
  return { grid:{color:CGRID}, ticks:{color:CTICK,font:{family:CFONT,size:11}} };
}

function renderAllCharts(year) {
  const recs  = Object.values(state.byYearCode[year] || {}).filter(r => state.activeRegions.has(r.r));
  const extra = state.extraByYearCode[year] || {};
  renderScatter(recs);
  renderDonut(recs);
  renderBarLE(recs);
  renderBarGDP(recs);
  renderBarHDI(recs, extra);
  renderBarPov(recs, extra);
  renderScatterHDIFert(recs, extra);
  renderScatterGDPPov(recs, extra);
  if (!state.selectedCountry) renderTrendChart(null);
}

// ── SCATTER GDP vs LE ─────────────────────────────────────
function renderScatter(recs) {
  const ctx      = document.getElementById('chart-scatter').getContext('2d');
  const datasets = Object.entries(REGIONS).map(([name, cfg]) => ({
    label: name,
    data: recs.filter(r=>r.r===name).map(r=>({x:Math.log10(r.gdp),y:r.le,label:r.e,code:r.c,gdp:r.gdp})),
    backgroundColor: cfg.color+'bb', borderColor:cfg.color, borderWidth:0.5, pointRadius:4, pointHoverRadius:6,
  }));
  if (state.charts.scatter) { state.charts.scatter.data.datasets=datasets; state.charts.scatter.update('none'); return; }
  state.charts.scatter = new Chart(ctx, {
    type:'scatter', data:{datasets},
    options: {
      ...chartDefaults(),
      plugins: { ...chartDefaults().plugins,
        legend:{ display:true, position:'bottom', labels:{color:CTICK,font:{family:CFONT,size:10},boxWidth:8,boxHeight:8,padding:4,usePointStyle:true} },
        tooltip:{ ...chartDefaults().plugins.tooltip, callbacks:{ label:c=>`${c.raw.label}: ${fmt.gdp(c.raw.gdp)} | ${c.raw.y.toFixed(1)} yrs` } },
      },
      scales: {
        x:{ ...scaleDef(), title:{display:true,text:'GDP p/c (log)',color:CTICK,font:{family:CFONT,size:10}}, ticks:{...scaleDef().ticks,callback:v=>'$'+Math.round(Math.pow(10,v)).toLocaleString()} },
        y:{ ...scaleDef(), title:{display:true,text:'Años vida',color:CTICK,font:{family:CFONT,size:10}} },
      },
      onClick:(e,els)=>{ if(!els.length)return; const code=state.charts.scatter.data.datasets[els[0].datasetIndex].data[els[0].index].code; selectCountry(code); },
    },
  });
}

// ── DONUT ─────────────────────────────────────────────────
function renderDonut(recs) {
  const ctx    = document.getElementById('chart-donut').getContext('2d');
  const names  = Object.keys(REGIONS).filter(r=>state.activeRegions.has(r));
  const pops   = names.map(r=>recs.filter(x=>x.r===r).reduce((a,b)=>a+b.pop,0));
  const colors = names.map(r=>REGIONS[r].color);
  if (state.charts.donut) {
    state.charts.donut.data.labels=names;
    state.charts.donut.data.datasets[0].data=pops;
    state.charts.donut.data.datasets[0].backgroundColor=colors;
    state.charts.donut.update('none'); return;
  }
  state.charts.donut = new Chart(ctx, {
    type:'doughnut', data:{ labels:names, datasets:[{data:pops,backgroundColor:colors,borderColor:'#0d1117',borderWidth:2,hoverOffset:4}] },
    options:{ ...chartDefaults(), cutout:'60%', plugins:{ ...chartDefaults().plugins,
      legend:{display:true,position:'right',labels:{color:CWHITE,font:{family:CFONT,size:10},boxWidth:9,boxHeight:9,padding:4,usePointStyle:true}},
      tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>`${c.label}: ${fmt.pop(c.raw)}`}},
    }},
  });
}

// ── BAR LE ────────────────────────────────────────────────
function renderBarLE(recs) {
  const ctx    = document.getElementById('chart-bar').getContext('2d');
  const sorted = [...recs].sort((a,b)=>b.le-a.le).slice(0,10);
  const labels = sorted.map(r=>r.c); const values = sorted.map(r=>r.le); const colors = sorted.map(r=>REGIONS[r.r]?.color||'#888');
  if (state.charts.barLE) { state.charts.barLE.data.labels=labels; state.charts.barLE.data.datasets[0].data=values; state.charts.barLE.data.datasets[0].backgroundColor=colors; state.charts.barLE.update('none'); return; }
  state.charts.barLE = new Chart(ctx, {
    type:'bar', data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:3,borderSkipped:false}]},
    options:{ ...chartDefaults(), indexAxis:'y',
      scales:{ x:{...scaleDef(),ticks:{...scaleDef().ticks,callback:v=>v+' yr'}}, y:{...scaleDef()} },
      plugins:{ ...chartDefaults().plugins, tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>fmt.le(c.raw)}} },
      onClick:(e,els)=>{ if(els.length) selectCountry(sorted[els[0].index].c); },
    },
  });
}

// ── BAR GDP ───────────────────────────────────────────────
function renderBarGDP(recs) {
  const ctx    = document.getElementById('chart-gdp').getContext('2d');
  const sorted = [...recs].sort((a,b)=>b.gdp-a.gdp).slice(0,10);
  const labels = sorted.map(r=>r.c); const values = sorted.map(r=>r.gdp); const colors = sorted.map(r=>REGIONS[r.r]?.color||'#888');
  if (state.charts.barGDP) { state.charts.barGDP.data.labels=labels; state.charts.barGDP.data.datasets[0].data=values; state.charts.barGDP.data.datasets[0].backgroundColor=colors; state.charts.barGDP.update('none'); return; }
  state.charts.barGDP = new Chart(ctx, {
    type:'bar', data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:3,borderSkipped:false}]},
    options:{ ...chartDefaults(), indexAxis:'y',
      scales:{ x:{...scaleDef(),ticks:{...scaleDef().ticks,callback:v=>fmt.gdp(v)}}, y:{...scaleDef()} },
      plugins:{ ...chartDefaults().plugins, tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>fmt.gdp(c.raw)}} },
      onClick:(e,els)=>{ if(els.length) selectCountry(sorted[els[0].index].c); },
    },
  });
}

// ── BAR HDI ───────────────────────────────────────────────
function renderBarHDI(recs, extra) {
  const ctx      = document.getElementById('chart-hdi').getContext('2d');
  const withHDI  = recs.map(r=>({...r,hdi:extra[r.c]?.hdi})).filter(r=>r.hdi!=null).sort((a,b)=>b.hdi-a.hdi).slice(0,10);
  const labels   = withHDI.map(r=>r.c);
  const values   = withHDI.map(r=>r.hdi);
  const colors   = withHDI.map(r=>hdiColor(r.hdi));
  if (state.charts.barHDI) { state.charts.barHDI.data.labels=labels; state.charts.barHDI.data.datasets[0].data=values; state.charts.barHDI.data.datasets[0].backgroundColor=colors; state.charts.barHDI.update('none'); return; }
  state.charts.barHDI = new Chart(ctx, {
    type:'bar', data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:3,borderSkipped:false}]},
    options:{ ...chartDefaults(), indexAxis:'y',
      scales:{ x:{...scaleDef(),min:0.6,ticks:{...scaleDef().ticks,callback:v=>v.toFixed(2)}}, y:{...scaleDef()} },
      plugins:{ ...chartDefaults().plugins, tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>'HDI: '+fmt.hdi(c.raw)}} },
      onClick:(e,els)=>{ if(els.length) selectCountry(withHDI[els[0].index].c); },
    },
  });
}

// ── BAR POBREZA ───────────────────────────────────────────
function renderBarPov(recs, extra) {
  const ctx     = document.getElementById('chart-pov').getContext('2d');
  const withPov = recs.map(r=>({...r,pov:extra[r.c]?.pov})).filter(r=>r.pov!=null).sort((a,b)=>b.pov-a.pov).slice(0,10);
  const labels  = withPov.map(r=>r.c);
  const values  = withPov.map(r=>r.pov);
  const colors  = withPov.map(r=>povColor(r.pov));
  if (state.charts.barPov) { state.charts.barPov.data.labels=labels; state.charts.barPov.data.datasets[0].data=values; state.charts.barPov.data.datasets[0].backgroundColor=colors; state.charts.barPov.update('none'); return; }
  state.charts.barPov = new Chart(ctx, {
    type:'bar', data:{labels,datasets:[{data:values,backgroundColor:colors,borderRadius:3,borderSkipped:false}]},
    options:{ ...chartDefaults(), indexAxis:'y',
      scales:{ x:{...scaleDef(),ticks:{...scaleDef().ticks,callback:v=>v+'%'}}, y:{...scaleDef()} },
      plugins:{ ...chartDefaults().plugins, tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>fmt.pov(c.raw)}} },
      onClick:(e,els)=>{ if(els.length) selectCountry(withPov[els[0].index].c); },
    },
  });
}

// ── SCATTER HDI vs FERTILIDAD ─────────────────────────────
function renderScatterHDIFert(recs, extra) {
  const ctx      = document.getElementById('chart-hdi-fert').getContext('2d');
  const datasets = Object.entries(REGIONS).map(([name, cfg]) => ({
    label: name,
    data: recs.filter(r=>r.r===name && extra[r.c]?.hdi!=null && extra[r.c]?.fert!=null)
              .map(r=>({x:extra[r.c].hdi, y:extra[r.c].fert, label:r.e, code:r.c})),
    backgroundColor:cfg.color+'bb', borderColor:cfg.color, borderWidth:0.5, pointRadius:4, pointHoverRadius:6,
  }));
  if (state.charts.scatterHDIFert) { state.charts.scatterHDIFert.data.datasets=datasets; state.charts.scatterHDIFert.update('none'); return; }
  state.charts.scatterHDIFert = new Chart(ctx, {
    type:'scatter', data:{datasets},
    options:{ ...chartDefaults(),
      plugins:{ ...chartDefaults().plugins,
        legend:{display:true,position:'bottom',labels:{color:CTICK,font:{family:CFONT,size:10},boxWidth:8,boxHeight:8,padding:4,usePointStyle:true}},
        tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>`${c.raw.label}: HDI ${c.raw.x.toFixed(3)} | ${c.raw.y.toFixed(2)} h/m`}},
      },
      scales:{
        x:{...scaleDef(),title:{display:true,text:'HDI',color:CTICK,font:{family:CFONT,size:10}},ticks:{...scaleDef().ticks,callback:v=>v.toFixed(1)}},
        y:{...scaleDef(),title:{display:true,text:'Hijos/mujer',color:CTICK,font:{family:CFONT,size:10}}},
      },
      onClick:(e,els)=>{ if(!els.length)return; const code=state.charts.scatterHDIFert.data.datasets[els[0].datasetIndex].data[els[0].index].code; selectCountry(code); },
    },
  });
}

// ── SCATTER GDP vs POBREZA ────────────────────────────────
function renderScatterGDPPov(recs, extra) {
  const ctx      = document.getElementById('chart-gdp-pov').getContext('2d');
  const datasets = Object.entries(REGIONS).map(([name, cfg]) => ({
    label: name,
    data: recs.filter(r=>r.r===name && extra[r.c]?.pov!=null)
              .map(r=>({x:Math.log10(r.gdp), y:extra[r.c].pov, label:r.e, code:r.c, gdp:r.gdp})),
    backgroundColor:cfg.color+'bb', borderColor:cfg.color, borderWidth:0.5, pointRadius:4, pointHoverRadius:6,
  }));
  if (state.charts.scatterGDPPov) { state.charts.scatterGDPPov.data.datasets=datasets; state.charts.scatterGDPPov.update('none'); return; }
  state.charts.scatterGDPPov = new Chart(ctx, {
    type:'scatter', data:{datasets},
    options:{ ...chartDefaults(),
      plugins:{ ...chartDefaults().plugins,
        legend:{display:true,position:'bottom',labels:{color:CTICK,font:{family:CFONT,size:10},boxWidth:8,boxHeight:8,padding:4,usePointStyle:true}},
        tooltip:{...chartDefaults().plugins.tooltip,callbacks:{label:c=>`${c.raw.label}: ${fmt.gdp(c.raw.gdp)} | ${fmt.pov(c.raw.y)}`}},
      },
      scales:{
        x:{...scaleDef(),title:{display:true,text:'GDP p/c (log)',color:CTICK,font:{family:CFONT,size:10}},ticks:{...scaleDef().ticks,callback:v=>'$'+Math.round(Math.pow(10,v)).toLocaleString()}},
        y:{...scaleDef(),title:{display:true,text:'Pobreza extrema %',color:CTICK,font:{family:CFONT,size:10}},ticks:{...scaleDef().ticks,callback:v=>v+'%'}},
      },
      onClick:(e,els)=>{ if(!els.length)return; const code=state.charts.scatterGDPPov.data.datasets[els[0].datasetIndex].data[els[0].index].code; selectCountry(code); },
    },
  });
}

// ── TREND LINE ────────────────────────────────────────────
function renderTrendChart(code) {
  const ctx = document.getElementById('chart-trend').getContext('2d');
  const lbl = document.getElementById('trend-country-label');
  let trendData;
  if (code) {
    trendData = state.rawData.filter(r=>r.c===code && r.y>=YEAR_MIN && r.y<=YEAR_MAX).sort((a,b)=>a.y-b.y);
    lbl.textContent = trendData[0]?.e || code;
  } else {
    const byYear = {};
    state.rawData.forEach(r => {
      if (r.y<YEAR_MIN||r.y>YEAR_MAX||!state.activeRegions.has(r.r)) return;
      if (!byYear[r.y]) byYear[r.y]={le:0,gdp:0,n:0};
      byYear[r.y].le+=r.le; byYear[r.y].gdp+=r.gdp; byYear[r.y].n++;
    });
    trendData = Object.entries(byYear).sort((a,b)=>+a[0]-+b[0]).map(([y,v])=>({y:+y,le:v.le/v.n,gdp:v.gdp/v.n}));
    lbl.textContent = 'Promedio Global';
  }
  const years   = trendData.map(r=>r.y);
  const leVals  = trendData.map(r=>r.le);
  const gdpVals = trendData.map(r=>r.gdp);

  function avgExtra(key, yr) {
    if (code) return state.extraByYearCode[yr]?.[code]?.[key] ?? null;
    const yr_data = state.extraByYearCode[yr] || {};
    const vals = Object.values(yr_data).map(v=>v[key]).filter(v=>v!=null);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  }
  const fertVals = years.map(y => avgExtra('fert', y));
  const hdiVals  = years.map(y => avgExtra('hdi',  y));
  const povVals  = years.map(y => avgExtra('pov',  y));

  if (state.charts.trend) {
    state.charts.trend.data.labels = years;
    state.charts.trend.data.datasets[0].data = leVals;
    state.charts.trend.data.datasets[1].data = gdpVals;
    state.charts.trend.data.datasets[2].data = fertVals;
    state.charts.trend.data.datasets[3].data = hdiVals;
    state.charts.trend.data.datasets[4].data = povVals;
    state.charts.trend.update('none'); return;
  }
  state.charts.trend = new Chart(ctx, {
    type:'line',
    data:{ labels:years, datasets:[
      { label:'Esp. Vida', data:leVals, borderColor:'#e05c2a', backgroundColor:'rgba(224,92,42,0.10)', borderWidth:2, pointRadius:0, tension:0.3, yAxisID:'y', fill:true },
      { label:'GDP p/c',  data:gdpVals, borderColor:'#00ccb4', backgroundColor:'rgba(0,204,180,0.05)', borderWidth:2, pointRadius:0, tension:0.3, yAxisID:'y2' },
      { label:'Fertilidad', data:fertVals, borderColor:'#cc55ff', borderWidth:1.5, pointRadius:0, tension:0.3, yAxisID:'y3', borderDash:[4,3], backgroundColor:'transparent' },
      { label:'HDI',      data:hdiVals, borderColor:'#33cc66', borderWidth:1.5, pointRadius:0, tension:0.3, yAxisID:'y4', borderDash:[4,3], backgroundColor:'transparent' },
      { label:'Pobreza %',data:povVals, borderColor:'#f4a932', borderWidth:1.5, pointRadius:0, tension:0.3, yAxisID:'y5', borderDash:[4,3], backgroundColor:'transparent' },
    ]},
    options:{ ...chartDefaults(),
      interaction:{ mode:'index', intersect:false },
      scales:{
        x:{ ...scaleDef(), ticks:{...scaleDef().ticks,maxTicksLimit:6} },
        y:{ ...scaleDef(), position:'left', ticks:{...scaleDef().ticks,callback:v=>v+'yr',color:'#e05c2a'} },
        y2:{ ...scaleDef(), position:'right', grid:{drawOnChartArea:false}, ticks:{...scaleDef().ticks,callback:v=>fmt.gdp(v),color:'#00ccb4'} },
        y3:{ display:false }, y4:{ display:false }, y5:{ display:false },
      },
      plugins:{ ...chartDefaults().plugins,
        legend:{ display:true, labels:{color:CWHITE,font:{family:CFONT,size:10},boxWidth:12,boxHeight:2,padding:5} },
      },
    },
  });
}
