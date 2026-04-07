# ◈ GeoExplorer — Life & Wealth Explorer

**Autor:** Jonatan E. González Balaguera  
**Versión:** 1.0.0  
**Stack:** HTML · CSS · Vanilla JS · Leaflet.js · Chart.js

---

## Descripción

GeoExplorer es un geovisor interactivo que visualiza la relación entre el **PIB per cápita**, la **esperanza de vida al nacer** y la **población** de 159 países entre **1950 y 2022**. Permite explorar patrones globales de desarrollo humano a través del tiempo mediante capas cartográficas, gráficas estadísticas dinámicas y un slider temporal animado.

Concebido como proyecto de portafolio profesional en ciencia de datos geoespacial, combina visualización cartográfica con análisis estadístico multivariable en una interfaz de tres paneles inspirada en plataformas como MapBiomas y Gapminder.

---

## Vista general

```
┌─────────────────┬──────────────────────────┬─────────────────┐
│   Panel Izq.    │        Mapa Central       │   Panel Der.    │
│   (25%)         │         (50%)             │   (25%)         │
│                 │                           │                 │
│  · Capas        │  Burbujas proporcionales  │  · Scatter      │
│  · Regiones     │  al tamaño de población   │  · Donut        │
│  · País Activo  │  coloreadas por GDP / LE  │  · Top 10 LE    │
│                 │                           │  · Top 10 GDP   │
│                 │  [Slider temporal]        │  · Serie temp.  │
└─────────────────┴──────────────────────────┴─────────────────┘
```

---

## Características

### Mapa
- **Burbujas proporcionales a la población** — radio escalado por raíz cuadrada, rango 4–22px.
- **Capa GDP per cápita** — escala logarítmica de color verde oscuro (USD 500) a verde cian (USD 120k+).
- **Capa Esperanza de vida** — gradiente rojo (30 años) a verde (85 años).
- **Filtrado por región** — 6 regiones activables/desactivables de forma independiente.
- **Tooltips estables** — sin efecto de "convulsión"; tooltip se abre en `mouseover` y cierra en `mouseout` sin re-render continuo.
- **Selección de país** — clic sobre burbuja resalta el marcador y actualiza panel derecho y serie temporal.

### Slider temporal
- Rango **1950–2022** con paso anual.
- Botón **Play/Stop** — animación automática con intervalo de 120ms por año.
- El año activo se refleja simultáneamente en el header, el badge del slider y el título del panel de análisis.

### Panel de análisis (derecho)
| Gráfica | Descripción |
|---|---|
| **Scatter GDP vs LE** | Relación log-lineal entre PIB y esperanza de vida, coloreada por región. Clic en punto selecciona el país. |
| **Donut por región** | Distribución de población total por región geográfica para el año activo. |
| **Top 10 — Esperanza de vida** | Barras horizontales de los 10 países con mayor LE en el año activo. |
| **Top 10 — GDP per cápita** | Barras horizontales de los 10 países con mayor PIB per cápita. |
| **Serie temporal** | Línea doble (LE + GDP) desde 1950 hasta 2022 para el país seleccionado o el promedio global. |

### Export
- Botón en el header exporta los datos del año activo (países visibles según filtros de región) como archivo `.csv`.

---

## Estructura del proyecto

```
geoexplorer/
│
├── index.html          # Estructura semántica de los tres paneles
├── style.css           # Sistema de diseño completo (tokens, layout, componentes)
├── app.js              # Lógica de aplicación (mapa, charts, estado, interacciones)
│
└── data/
    └── data.json       # Dataset limpio — 11.092 registros, 159 países, 1950–2022
                        # Campos: entity, code, year, le, gdp, pop, region, lat, lng
```

> La carpeta `data/` está preparada para recibir capas GeoJSON adicionales (límites de países, biomas, cuencas, etc.) en futuras versiones.

---

## Fuente de datos

| Campo | Fuente original |
|---|---|
| Esperanza de vida al nacer | Our World in Data — Gapminder / UN WPP |
| GDP per cápita (PPP 2017 USD) | Our World in Data — Maddison Project |
| Población | Our World in Data — Gapminder / UN WPP |
| Región geográfica | Our World in Data (clasificación OWID) |

Dataset original: `life-expectancy-vs-gdp-per-capita.csv` (Our World in Data).  
Procesamiento: filtrado a registros con código ISO3 válido, coordenadas geográficas y valores numéricos completos. Año mínimo: 1950.

---

## Tecnologías

| Librería | Versión | Uso |
|---|---|---|
| [Leaflet.js](https://leafletjs.com/) | 1.9.4 | Motor cartográfico, `circleMarker`, tooltips |
| [Chart.js](https://www.chartjs.org/) | 4.4.0 | Scatter, doughnut, bar, line charts |
| [Outfit](https://fonts.google.com/specimen/Outfit) | — | Tipografía display (geométrica sans-serif) |
| [DM Mono](https://fonts.google.com/specimen/DM+Mono) | — | Tipografía monoespaciada para datos numéricos |
| OpenStreetMap | — | Tiles base (filtro oscuro vía CSS) |

Sin frameworks JS ni bundlers. Todo vanilla para máxima portabilidad y velocidad de carga.

---

## Cómo ejecutar

```bash
# Clona o descarga el repositorio
git clone https://github.com/joesgoba/geoexplorer.git
cd geoexplorer

# Levanta un servidor local (necesario para el fetch de data/data.json)
python3 -m http.server 8000

# Abre en el navegador
http://localhost:8000
```

> **Nota:** No se puede abrir `index.html` directamente como archivo local (`file://`) porque el navegador bloquea el `fetch()` por política CORS. Se requiere un servidor HTTP, así sea local.

---

## Decisiones de diseño

**Arquitectura de markers sin recreación** — cada `circleMarker` de Leaflet se crea una sola vez al cargar el dataset. Los cambios de año, capa o filtro de región únicamente actualizan el estilo (color, radio, visibilidad) mediante `setStyle()`, evitando el parpadeo y el efecto de "convulsión" que produce recrear elementos DOM en cada frame.

**Escala logarítmica para GDP** — el PIB per cápita tiene una distribución muy sesgada (Qatar ~$130k vs Burundi ~$300). La escala log permite leer diferencias en rangos bajos y altos simultáneamente sin que los países pobres queden todos del mismo color oscuro.

**Índice `byYearCode`** — el dataset de 11k registros se indexa al cargar como `{ año: { código: registro } }`, lo que permite acceso O(1) a cualquier país en cualquier año sin iterar el array completo en cada cambio de slider.

---

## Roadmap

- [ ] Capa choropleth con GeoJSON de fronteras nacionales
- [ ] Panel de comparación entre dos países seleccionados simultáneamente
- [ ] Filtro por rango de años (doble slider)
- [ ] Modo oscuro / claro
- [ ] Integración de indicadores adicionales (mortalidad infantil, Gini, emisiones CO₂)
- [ ] Versión mobile responsive

---

## Licencia

Uso personal y de portafolio profesional. Datos originales bajo licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) de Our World in Data.

---

*GeoExplorer es parte del portafolio de análisis de datos geoespaciales de Jonatan E. González Balaguera — Bogotá, Colombia.*
