const LEVELS = ["none", "low", "moderate", "high"];
const TAGS = [
  "walk_after",
  "poor_sleep",
  "stress",
  "exercise_before",
  "high_fiber",
  "late_meal"
];

const DB_NAME = "metabolic_tracker_db";
const DB_VERSION = 1;
const STORE_NAME = "meals";
const FASTING_STORE_NAME = "fasting";
const UNIT_STORAGE_KEY = "metabolic_tracker_glucose_unit";
const UNITS = {
  MGDL: "mg/dL",
  MMOL: "mmol/L"
};
const MGDL_PER_MMOL = 18;
const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 400;
const CARB_MIN = 0;
const CARB_MAX = 300;
const PEAK_TIME_MIN = 0;
const PEAK_TIME_MAX = 180;
const RETURN_TIME_MIN = 0;
const RETURN_TIME_MAX = 300;

const AppState = {
  meals: [],
  fastingEntries: [],
  fastingCollapsed: false,
  openEditors: new Set(),
  sort: { key: "datetime", direction: "desc" },
  charts: {},
  glucoseUnit: localStorage.getItem(UNIT_STORAGE_KEY) === UNITS.MMOL ? UNITS.MMOL : UNITS.MGDL
};

const elements = {
  tabs: document.querySelectorAll(".tab-btn"),
  unitToggle: document.getElementById("unitToggle"),
  glucoseUnitLabels: document.querySelectorAll("[data-glucose-unit-label]"),
  panels: {
    log: document.getElementById("tab-log"),
    reports: document.getElementById("tab-reports"),
    data: document.getElementById("tab-data"),
    settings: document.getElementById("tab-settings")
  },
  proteinLevel: document.getElementById("proteinLevel"),
  fatLevel: document.getElementById("fatLevel"),
  preMealForm: document.getElementById("preMealForm"),
  fastingSection: document.getElementById("fastingSection"),
  fastingContent: document.getElementById("fastingContent"),
  fastingToggle: document.getElementById("fastingToggle"),
  fastingGateMessage: document.getElementById("fastingGateMessage"),
  fastingForm: document.getElementById("fastingForm"),
  fastingDate: document.getElementById("fastingDate"),
  fastingGlucose: document.getElementById("fastingGlucose"),
  fastingList: document.getElementById("fastingList"),
  mealList: document.getElementById("mealList"),
  mealReportTableBody: document.querySelector("#mealReportTable tbody"),
  mealReportTableHead: document.querySelector("#mealReportTable thead"),
  foodPatternSummary: document.getElementById("foodPatternSummary"),
  timeOfDaySummary: document.getElementById("timeOfDaySummary"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  importJsonInput: document.getElementById("importJsonInput"),
  appMessage: document.getElementById("appMessage"),
  resetLocalDataBtn: document.getElementById("resetLocalDataBtn")
};

const DB = {
  db: null,

  async init() {
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(FASTING_STORE_NAME)) {
          db.createObjectStore(FASTING_STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllMeals() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async saveMeal(meal) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(meal);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  async getAllFasting() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(FASTING_STORE_NAME, "readonly");
      const store = tx.objectStore(FASTING_STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async saveFasting(entry) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(FASTING_STORE_NAME, "readwrite");
      const store = tx.objectStore(FASTING_STORE_NAME);
      store.put(entry);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  async bulkReplace(meals) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      meals.forEach((meal) => store.put(meal));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  },

  async bulkReplaceAll(meals, fastingEntries) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME, FASTING_STORE_NAME], "readwrite");
      const mealStore = tx.objectStore(STORE_NAME);
      const fastingStore = tx.objectStore(FASTING_STORE_NAME);
      mealStore.clear();
      fastingStore.clear();
      meals.forEach((meal) => mealStore.put(meal));
      fastingEntries.forEach((entry) => fastingStore.put(entry));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
};

const Calc = {
  toNumberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  },

  inRange(value, min, max) {
    if (value == null) return false;
    return value >= min && value <= max;
  },

  validateMealInput(values, mode = "pre") {
    const errors = [];

    if (mode === "pre") {
      if (!values.description || !values.description.trim()) {
        errors.push("Meal description is required.");
      }
      if (values.carbEstimate == null || !this.inRange(values.carbEstimate, CARB_MIN, CARB_MAX)) {
        errors.push("Carb estimate must be between 0 and 300.");
      }
      if (values.preGlucose == null || !this.inRange(values.preGlucose, GLUCOSE_MIN, GLUCOSE_MAX)) {
        errors.push("Pre-meal glucose must be between 40 and 400.");
      }
    }

    if (values.peakGlucose != null && !this.inRange(values.peakGlucose, GLUCOSE_MIN, GLUCOSE_MAX)) {
      errors.push("Peak glucose must be between 40 and 400.");
    }
    if (values.glucoseAt2Hr != null && !this.inRange(values.glucoseAt2Hr, GLUCOSE_MIN, GLUCOSE_MAX)) {
      errors.push("2-hour glucose must be between 40 and 400.");
    }
    if (values.peakTimeMinutes != null && !this.inRange(values.peakTimeMinutes, PEAK_TIME_MIN, PEAK_TIME_MAX)) {
      errors.push("Time to peak must be between 0 and 180 minutes.");
    }
    if (values.timeBackUnder120 != null && !this.inRange(values.timeBackUnder120, RETURN_TIME_MIN, RETURN_TIME_MAX)) {
      errors.push("Time back under 120 must be between 0 and 300 minutes.");
    }

    return errors;
  },

  validateFastingInput(fastingGlucose) {
    if (fastingGlucose == null || !this.inRange(fastingGlucose, GLUCOSE_MIN, GLUCOSE_MAX)) {
      return ["Fasting glucose must be between 40 and 400."];
    }
    return [];
  },

  getMealPeriod(datetime) {
    const hour = new Date(datetime).getHours();
    if (hour >= 5 && hour < 11) return "morning";
    if (hour >= 11 && hour < 17) return "afternoon";
    if (hour >= 17 && hour < 22) return "evening";
    return "late";
  },

  getSpikeMagnitude(meal) {
    if (meal.peakGlucose == null || meal.preGlucose == null) return null;
    return roundNumber(meal.peakGlucose - meal.preGlucose, 1);
  },

  getReturnDelta(meal) {
    if (meal.glucoseAt2Hr == null || meal.preGlucose == null) return null;
    return roundNumber(meal.glucoseAt2Hr - meal.preGlucose, 1);
  },

  getSpikeCategory(spikeMagnitude) {
    if (spikeMagnitude == null) return null;
    if (spikeMagnitude < 30) return "Mild";
    if (spikeMagnitude >= 30 && spikeMagnitude < 60) return "Moderate";
    return "High";
  },

  getDurationCategory(timeBackUnder120) {
    if (timeBackUnder120 == null) return null;
    if (timeBackUnder120 < 90) return "Efficient";
    if (timeBackUnder120 >= 90 && timeBackUnder120 <= 150) return "Acceptable";
    return "Prolonged";
  },

  getAucProxy(meal) {
    if (meal.preGlucose == null || meal.peakGlucose == null || meal.glucoseAt2Hr == null || meal.peakTimeMinutes == null) {
      return null;
    }

    const peakTime = Math.max(0, Math.min(120, meal.peakTimeMinutes));
    const t1 = peakTime;
    const t2 = 120 - peakTime;

    // Trapezoidal AUC proxy in mg/dL * minutes.
    // Segment 1: average of pre and peak over t1.
    // Segment 2: average of peak and 2-hour over t2.
    // This is intentionally unnormalized so future normalization can be added independently.
    const segment1 = ((meal.preGlucose + meal.peakGlucose) / 2) * t1;
    const segment2 = ((meal.peakGlucose + meal.glucoseAt2Hr) / 2) * t2;
    return roundNumber(segment1 + segment2, 1);
  },

  getComplete(meal) {
    return (
      meal.peakGlucose != null &&
      meal.peakTimeMinutes != null &&
      meal.glucoseAt2Hr != null &&
      meal.timeBackUnder120 != null
    );
  },

  withDerived(meal) {
    const spikeMagnitude = this.getSpikeMagnitude(meal);
    const returnDelta = this.getReturnDelta(meal);
    const durationCategory = this.getDurationCategory(meal.timeBackUnder120);
    const complete = this.getComplete(meal);

    return {
      ...meal,
      mealPeriod: this.getMealPeriod(meal.datetime),
      spikeMagnitude,
      spikeCategory: complete ? this.getSpikeCategory(spikeMagnitude) : null,
      durationCategory: complete ? durationCategory : null,
      aucProxy: complete ? this.getAucProxy(meal) : null,
      returnDelta,
      complete
    };
  }
};

function roundNumber(value, decimals = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function normalizeMealRecord(rawMeal) {
  const normalized = {
    id: String(rawMeal.id || crypto.randomUUID()),
    datetime: new Date(rawMeal.datetime || Date.now()).toISOString(),
    description: String(rawMeal.description || "Untitled meal"),
    carbEstimate: Calc.toNumberOrNull(rawMeal.carbEstimate),
    proteinLevel: LEVELS.includes(rawMeal.proteinLevel) ? rawMeal.proteinLevel : "none",
    fatLevel: LEVELS.includes(rawMeal.fatLevel) ? rawMeal.fatLevel : "none",
    preGlucose: Calc.toNumberOrNull(rawMeal.preGlucose),
    peakGlucose: Calc.toNumberOrNull(rawMeal.peakGlucose),
    peakTimeMinutes: Calc.toNumberOrNull(rawMeal.peakTimeMinutes),
    glucoseAt2Hr: Calc.toNumberOrNull(rawMeal.glucoseAt2Hr),
    timeBackUnder120: Calc.toNumberOrNull(rawMeal.timeBackUnder120),
    notes: String(rawMeal.notes || ""),
    contextTags: Array.isArray(rawMeal.contextTags) ? rawMeal.contextTags.map(String) : []
  };

  return Calc.withDerived(normalized);
}

function normalizeFastingEntry(rawEntry) {
  const dateValue = String(rawEntry.date || rawEntry.id || "").slice(0, 10);
  if (!dateValue) return null;

  return {
    id: dateValue,
    date: dateValue,
    fastingGlucose: Calc.toNumberOrNull(rawEntry.fastingGlucose)
  };
}

function showMessage(messageText) {
  if (!elements.appMessage) {
    alert(messageText);
    return;
  }
  elements.appMessage.textContent = messageText;
  elements.appMessage.classList.remove("hidden");
}

function clearMessage() {
  if (!elements.appMessage) return;
  elements.appMessage.textContent = "";
  elements.appMessage.classList.add("hidden");
}

const UI = {
  renderUnitState() {
    const unit = AppState.glucoseUnit;
    elements.unitToggle.querySelectorAll("[data-unit]").forEach((button) => {
      button.classList.toggle("active", button.dataset.unit === unit);
    });

    elements.glucoseUnitLabels.forEach((label) => {
      label.textContent = unit;
    });

    const glucoseInputMode = unit === UNITS.MMOL ? "decimal" : "numeric";
    ["preGlucose", "fastingGlucose"].forEach((id) => {
      const input = document.getElementById(id);
      input.inputMode = glucoseInputMode;
    });
  },

  renderFastingEntries() {
    const entries = [...AppState.fastingEntries].sort((a, b) => b.date.localeCompare(a.date));
    if (!entries.length) {
      elements.fastingList.innerHTML = `<p class="subtext">No fasting entries yet.</p>`;
      this.updateFastingGate();
      return;
    }

    elements.fastingList.innerHTML = entries
      .slice(0, 7)
      .map(
        (entry) => `
          <div class="summary-card">
            <strong>${entry.date}</strong>
            <div>Fasting: ${formatGlucose(entry.fastingGlucose)} ${AppState.glucoseUnit}</div>
          </div>
        `
      )
      .join("");

    this.updateFastingGate();
  },

  updateFastingGate() {
    const hasTodayFasting = AppState.fastingEntries.some((entry) => entry.date === getTodayDateIso());
    const shouldCollapse = hasTodayFasting && AppState.fastingCollapsed;

    elements.fastingGateMessage.textContent = hasTodayFasting
      ? "Fasting logged for today. You can still expand this section anytime."
      : "Log fasting first to unlock meal entry for today.";

    elements.preMealForm.querySelectorAll("input, textarea, button").forEach((element) => {
      element.disabled = !hasTodayFasting;
    });

    elements.mealList.querySelectorAll(".meal-toggle").forEach((button) => {
      button.disabled = !hasTodayFasting;
    });

    this.setFastingCollapsed(shouldCollapse);
  },

  setFastingCollapsed(collapsed) {
    AppState.fastingCollapsed = collapsed;
    elements.fastingContent.classList.toggle("hidden", collapsed);
    elements.fastingToggle.textContent = collapsed ? "▸" : "▾";
    elements.fastingToggle.setAttribute("aria-label", collapsed ? "Expand fasting section" : "Collapse fasting section");
    elements.fastingToggle.setAttribute("title", collapsed ? "Expand fasting section" : "Collapse fasting section");
  },

  initToggleGroup(container, name, selected) {
    container.innerHTML = "";
    LEVELS.forEach((level) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `toggle-btn${level === selected ? " active" : ""}`;
      button.dataset.value = level;
      button.dataset.group = name;
      button.textContent = level;
      container.appendChild(button);
    });
  },

  renderMeals() {
    const meals = [...AppState.meals].sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    if (!meals.length) {
      elements.mealList.innerHTML = `<p class="subtext">No meals yet. Save your first entry.</p>`;
      this.updateFastingGate();
      return;
    }

    elements.mealList.innerHTML = meals
      .map((meal) => {
        const metrics = Calc.withDerived(meal);
        const dateText = new Date(meal.datetime).toLocaleString();
        const spikeText = metrics.spikeMagnitude == null ? "pending" : `${formatGlucose(metrics.spikeMagnitude)} ${AppState.glucoseUnit}`;
        const isOpen = AppState.openEditors.has(meal.id);

        return `
          <article class="meal-item" data-meal-id="${meal.id}">
            <div class="meal-row">
              <div class="meal-main">
                <div class="title">${escapeHtml(meal.description)}</div>
                <div class="meta">${dateText} · ${meal.carbEstimate}g carbs · Spike ${spikeText}</div>
              </div>
              <button class="meal-toggle icon-btn" type="button" data-meal-id="${meal.id}" aria-label="${isOpen ? "Close post-meal form" : "Open post-meal form"}" title="${isOpen ? "Close" : "Update"}">${isOpen ? "✕" : "✎"}</button>
            </div>
            <div class="meal-inline-editor ${isOpen ? "" : "hidden"}" data-editor-for="${meal.id}">
              ${this.inlineEditorHtml(meal)}
            </div>
          </article>
        `;
      })
      .join("");

    this.updateFastingGate();
  },

  inlineEditorHtml(meal) {
    return `
      <form class="inline-post-form" data-meal-id="${meal.id}" novalidate>
        <label>
          Peak glucose (${AppState.glucoseUnit})
          <input name="peakGlucose" type="text" inputmode="${AppState.glucoseUnit === UNITS.MMOL ? "decimal" : "numeric"}" value="${toDisplayGlucose(meal.peakGlucose) ?? ""}" />
          <p class="subtext threshold-hint">Spike thresholds: &lt;30 Mild · 30–59 Moderate · ≥60 High</p>
        </label>

        <label>
          Time to peak (minutes)
          <input name="peakTimeMinutes" type="text" inputmode="numeric" value="${meal.peakTimeMinutes ?? ""}" />
        </label>

        <label>
          2-hour glucose (${AppState.glucoseUnit})
          <input name="glucoseAt2Hr" type="text" inputmode="${AppState.glucoseUnit === UNITS.MMOL ? "decimal" : "numeric"}" value="${toDisplayGlucose(meal.glucoseAt2Hr) ?? ""}" />
        </label>

        <label>
          Time back under ${AppState.glucoseUnit === UNITS.MMOL ? "6.7 mmol/L" : "120 mg/dL"} (minutes)
          <input name="timeBackUnder120" type="text" inputmode="numeric" value="${meal.timeBackUnder120 ?? ""}" />
        </label>

        <label>
          Notes
          <textarea name="notes" rows="2" maxlength="400" placeholder="Optional">${escapeHtml(meal.notes || "")}</textarea>
        </label>

        <div>
          <p class="field-label">Context tags</p>
          <div class="chips">
            ${TAGS.map(
              (tag) =>
                `<button type="button" class="chip inline-chip${(meal.contextTags || []).includes(tag) ? " active" : ""}" data-tag="${tag}">${tag}</button>`
            ).join("")}
          </div>
        </div>

        <div class="metric-preview" data-inline-preview>${this.inlinePreviewHtml(meal)}</div>

        <div class="button-row">
          <button class="primary" type="submit">Save Update</button>
          <button type="button" class="close-inline icon-btn" data-meal-id="${meal.id}" aria-label="Close post-meal form" title="Close">✕</button>
        </div>
      </form>
    `;
  },

  inlinePreviewHtml(meal) {
    const mealWithMetrics = Calc.withDerived(meal);
    const spike = mealWithMetrics.spikeMagnitude == null ? "N/A" : `${formatGlucose(mealWithMetrics.spikeMagnitude)} ${AppState.glucoseUnit}`;
    const auc = mealWithMetrics.aucProxy == null ? "N/A" : `${formatAuc(mealWithMetrics.aucProxy)} ${aucUnitLabel()}`;
    const returnDelta = mealWithMetrics.returnDelta == null ? "N/A" : `${formatGlucose(mealWithMetrics.returnDelta)} ${AppState.glucoseUnit}`;

    return `
      <div>Spike: <strong>${spike}</strong> (${mealWithMetrics.spikeCategory ?? "N/A"})</div>
      <div>Duration: <strong>${mealWithMetrics.timeBackUnder120 ?? "N/A"}</strong> min (${mealWithMetrics.durationCategory ?? "N/A"})</div>
      <div>Return delta: <strong>${returnDelta}</strong></div>
      <div>AUC proxy: <strong>${auc}</strong></div>
    `;
  },

  renderReports() {
    const meals = AppState.meals.map((meal) => Calc.withDerived(meal));
    this.renderMealTable(meals);
    this.renderFoodPatternSummary(meals);
    this.renderTimeOfDaySummary(meals);
    this.renderFastingTrendChart();
    this.renderCharts(meals);
  },

  renderFastingTrendChart() {
    if (typeof Chart === "undefined") {
      return;
    }

    const entries = [...AppState.fastingEntries]
      .filter((entry) => entry.fastingGlucose != null)
      .sort((a, b) => a.date.localeCompare(b.date));

    upsertChart("fastingTrendChart", {
      type: "line",
      data: {
        labels: entries.map((entry) => entry.date),
        datasets: [
          {
            label: `Fasting (${AppState.glucoseUnit})`,
            data: entries.map((entry) => toDisplayGlucose(entry.fastingGlucose)),
            tension: 0.25
          }
        ]
      },
      options: baseChartOptions()
    });
  },

  sortedMealsForReport(meals) {
    const { key, direction } = AppState.sort;
    const multiplier = direction === "asc" ? 1 : -1;

    return [...meals].sort((a, b) => {
      const va = a[key] ?? -Infinity;
      const vb = b[key] ?? -Infinity;

      if (key === "datetime") {
        return (new Date(va) - new Date(vb)) * multiplier;
      }

      if (typeof va === "string") {
        return va.localeCompare(vb) * multiplier;
      }

      return (va - vb) * multiplier;
    });
  },

  renderMealTable(meals) {
    const sorted = this.sortedMealsForReport(meals);

    elements.mealReportTableBody.innerHTML = sorted
      .map((meal) => {
        const spikeClass = categoryClass(meal.spikeCategory);
        const durationClass = categoryClass(meal.durationCategory);
        return `
          <tr>
            <td>${new Date(meal.datetime).toLocaleDateString()}</td>
            <td>${escapeHtml(meal.description)}</td>
            <td>${meal.carbEstimate ?? "-"}</td>
            <td>${meal.spikeMagnitude == null ? "-" : formatGlucose(meal.spikeMagnitude)}</td>
            <td>${meal.timeBackUnder120 ?? "-"}</td>
            <td>
              <span class="badge ${spikeClass}">${meal.spikeCategory ?? "N/A"}</span>
              <span class="badge ${durationClass}">${meal.durationCategory ?? "N/A"}</span>
            </td>
          </tr>
        `;
      })
      .join("");
  },

  renderFoodPatternSummary(meals) {
    const grouped = groupBy(meals, (meal) => meal.description.trim().toLowerCase());
    const rows = Object.entries(grouped)
      .map(([key, list]) => {
        const withSpike = list.filter((m) => m.spikeMagnitude != null);
        const withReturn = list.filter((m) => m.timeBackUnder120 != null);
        const avgSpike = average(withSpike.map((m) => m.spikeMagnitude));
        const avgReturn = average(withReturn.map((m) => m.timeBackUnder120));

        return {
          description: list[0].description,
          tests: list.length,
          avgSpike,
          avgReturn
        };
      })
      .sort((a, b) => b.tests - a.tests || a.description.localeCompare(b.description));

    elements.foodPatternSummary.innerHTML = rows.length
      ? rows
          .map(
            (row) => `
            <div class="summary-card">
              <strong>${escapeHtml(row.description)}</strong>
              <div>${row.tests} tests</div>
              <div>Avg spike: ${formatGlucose(row.avgSpike)} ${AppState.glucoseUnit}</div>
              <div>Avg return: ${formatNumber(row.avgReturn)} min</div>
            </div>
          `
          )
          .join("")
      : `<p class="subtext">No report data yet.</p>`;
  },

  renderTimeOfDaySummary(meals) {
    const buckets = {
      Morning: [],
      Afternoon: [],
      Evening: []
    };

    meals.forEach((meal) => {
      const hour = new Date(meal.datetime).getHours();
      if (hour >= 5 && hour < 11) buckets.Morning.push(meal);
      else if (hour >= 11 && hour < 17) buckets.Afternoon.push(meal);
      else if (hour >= 17 && hour < 22) buckets.Evening.push(meal);
    });

    elements.timeOfDaySummary.innerHTML = Object.entries(buckets)
      .map(([period, list]) => {
        const spikes = list.map((m) => m.spikeMagnitude).filter((value) => value != null);
        return `
          <div class="summary-card">
            <strong>${period}</strong>
            <div>Meals: ${list.length}</div>
            <div>Avg spike: ${formatGlucose(average(spikes))} ${AppState.glucoseUnit}</div>
          </div>
        `;
      })
      .join("");
  },

  renderCharts(meals) {
    if (typeof Chart === "undefined") {
      return;
    }

    const spikes = meals.filter((meal) => meal.spikeMagnitude != null);
    const spikeLabels = spikes.map((meal) => `${formatDateShort(meal.datetime)} ${truncate(meal.description, 16)}`);
    const spikeData = spikes.map((meal) => toDisplayGlucose(meal.spikeMagnitude));

    upsertChart("spikeBarChart", {
      type: "bar",
      data: {
        labels: spikeLabels,
        datasets: [{ label: `Spike (${AppState.glucoseUnit})`, data: spikeData }]
      },
      options: baseChartOptions()
    });

    const dailyGroups = groupBy(
      meals.filter((meal) => meal.peakGlucose != null),
      (meal) => meal.datetime.slice(0, 10)
    );

    const dailyLabels = Object.keys(dailyGroups).sort();
    const dailyAvgPeak = dailyLabels.map((day) => toDisplayGlucose(average(dailyGroups[day].map((meal) => meal.peakGlucose))));

    upsertChart("dailyPeakChart", {
      type: "line",
      data: {
        labels: dailyLabels,
        datasets: [{ label: `Avg daily peak (${AppState.glucoseUnit})`, data: dailyAvgPeak, tension: 0.25 }]
      },
      options: baseChartOptions()
    });

    const counts = { Mild: 0, Moderate: 0, High: 0 };
    spikes.forEach((meal) => {
      if (counts[meal.spikeCategory] != null) counts[meal.spikeCategory] += 1;
    });

    upsertChart("categoryHistogram", {
      type: "bar",
      data: {
        labels: Object.keys(counts),
        datasets: [{ label: "Count", data: Object.values(counts) }]
      },
      options: baseChartOptions()
    });
  }
};

function upsertChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  if (AppState.charts[canvasId]) {
    AppState.charts[canvasId].destroy();
  }

  AppState.charts[canvasId] = new Chart(canvas, config);
}

function baseChartOptions() {
  const css = getComputedStyle(document.documentElement);
  const text = css.getPropertyValue("--text").trim() || "#ffffff";
  const border = css.getPropertyValue("--border").trim() || "#333";

  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: text }
      }
    },
    scales: {
      x: {
        ticks: { color: text },
        grid: { color: border }
      },
      y: {
        ticks: { color: text },
        grid: { color: border }
      }
    }
  };
}

function getToggleSelection(container) {
  const active = container.querySelector(".toggle-btn.active");
  return active ? active.dataset.value : LEVELS[0];
}

function bindEvents() {
  elements.tabs.forEach((tabButton) => {
    tabButton.addEventListener("click", () => {
      const tab = tabButton.dataset.tab;
      elements.tabs.forEach((button) => button.classList.toggle("active", button === tabButton));
      Object.entries(elements.panels).forEach(([key, panel]) => {
        panel.classList.toggle("active", key === tab);
      });
      if (tab === "reports") UI.renderReports();
    });
  });

  document.body.addEventListener("click", (event) => {
    const unitButton = event.target.closest("[data-unit]");
    if (unitButton) {
      AppState.glucoseUnit = unitButton.dataset.unit === UNITS.MMOL ? UNITS.MMOL : UNITS.MGDL;
      localStorage.setItem(UNIT_STORAGE_KEY, AppState.glucoseUnit);
      UI.renderUnitState();
      UI.renderMeals();
      UI.renderReports();
      return;
    }

    const fastingToggleButton = event.target.closest("#fastingToggle");
    if (fastingToggleButton) {
      UI.setFastingCollapsed(!AppState.fastingCollapsed);
      return;
    }

    const toggleButton = event.target.closest(".toggle-btn[data-value]");
    if (toggleButton) {
      const parent = toggleButton.parentElement;
      parent.querySelectorAll(".toggle-btn").forEach((button) => button.classList.remove("active"));
      toggleButton.classList.add("active");
      return;
    }

    const mealToggle = event.target.closest(".meal-toggle");
    if (mealToggle) {
      const mealId = mealToggle.dataset.mealId;
      if (AppState.openEditors.has(mealId)) AppState.openEditors.delete(mealId);
      else AppState.openEditors.add(mealId);
      UI.renderMeals();
      return;
    }

    const closeInline = event.target.closest(".close-inline");
    if (closeInline) {
      AppState.openEditors.delete(closeInline.dataset.mealId);
      UI.renderMeals();
      return;
    }

    const chip = event.target.closest(".inline-chip");
    if (chip) {
      chip.classList.toggle("active");
      const form = chip.closest(".inline-post-form");
      const mealId = form?.dataset.mealId;
      if (!mealId) return;
      const meal = AppState.meals.find((entry) => entry.id === mealId);
      if (!meal) return;
      renderInlinePreview(form, meal);
      return;
    }
  });

  elements.preMealForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const description = valueOf("description").trim();
    const carbEstimate = Calc.toNumberOrNull(valueOf("carbEstimate"));
    const preGlucose = fromDisplayGlucose(valueOf("preGlucose"));

    const validationErrors = Calc.validateMealInput(
      {
        description,
        carbEstimate,
        preGlucose,
        peakGlucose: null,
        peakTimeMinutes: null,
        glucoseAt2Hr: null,
        timeBackUnder120: null
      },
      "pre"
    );

    if (validationErrors.length) {
      showMessage(validationErrors[0]);
      return;
    }

    const meal = normalizeMealRecord({
      id: crypto.randomUUID(),
      datetime: new Date().toISOString(),
      description,
      carbEstimate,
      proteinLevel: getToggleSelection(elements.proteinLevel),
      fatLevel: getToggleSelection(elements.fatLevel),
      preGlucose,
      peakGlucose: null,
      peakTimeMinutes: null,
      glucoseAt2Hr: null,
      timeBackUnder120: null,
      notes: "",
      contextTags: []
    });

    await DB.saveMeal(meal);
    AppState.meals.push(meal);
    elements.preMealForm.reset();
    UI.initToggleGroup(elements.proteinLevel, "protein", "none");
    UI.initToggleGroup(elements.fatLevel, "fat", "none");
    UI.renderMeals();
  });

  elements.fastingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage();

    const date = elements.fastingDate.value;
    const fastingGlucose = fromDisplayGlucose(elements.fastingGlucose.value);
    const validationErrors = Calc.validateFastingInput(fastingGlucose);
    if (!date || validationErrors.length) {
      showMessage(validationErrors[0] || "Date is required.");
      return;
    }

    const entry = normalizeFastingEntry({
      id: date,
      date,
      fastingGlucose
    });
    if (!entry) {
      showMessage("Invalid fasting entry.");
      return;
    }

    await DB.saveFasting(entry);
    const existingIndex = AppState.fastingEntries.findIndex((item) => item.id === entry.id);
    if (existingIndex >= 0) AppState.fastingEntries[existingIndex] = entry;
    else AppState.fastingEntries.push(entry);

    if (entry.date === getTodayDateIso()) {
      AppState.fastingCollapsed = true;
    }

    elements.fastingGlucose.value = "";
    UI.renderFastingEntries();
    UI.renderMeals();
  });

  elements.mealList.addEventListener("input", (event) => {
    const form = event.target.closest(".inline-post-form");
    if (!form) return;
    const meal = AppState.meals.find((entry) => entry.id === form.dataset.mealId);
    if (!meal) return;
    renderInlinePreview(form, meal);
  });

  elements.mealList.addEventListener("submit", async (event) => {
    const form = event.target.closest(".inline-post-form");
    if (!form) return;
    event.preventDefault();
    clearMessage();

    const mealId = form.dataset.mealId;
    const index = AppState.meals.findIndex((meal) => meal.id === mealId);
    if (index < 0) return;

    const existing = AppState.meals[index];
    const updatedCandidate = {
      ...existing,
      peakGlucose: fromDisplayGlucose(getFormValue(form, "peakGlucose")),
      peakTimeMinutes: Calc.toNumberOrNull(getFormValue(form, "peakTimeMinutes")),
      glucoseAt2Hr: fromDisplayGlucose(getFormValue(form, "glucoseAt2Hr")),
      timeBackUnder120: Calc.toNumberOrNull(getFormValue(form, "timeBackUnder120")),
      notes: getFormValue(form, "notes").trim(),
      contextTags: getInlineSelectedTags(form)
    };

    const validationErrors = Calc.validateMealInput(updatedCandidate, "post");
    if (validationErrors.length) {
      showMessage(validationErrors[0]);
      return;
    }

    const updated = normalizeMealRecord(updatedCandidate);

    await DB.saveMeal(updated);
    AppState.meals[index] = updated;
    AppState.openEditors.add(mealId);
    UI.renderMeals();
  });

  elements.mealReportTableHead.addEventListener("click", (event) => {
    const header = event.target.closest("th[data-sort]");
    if (!header) return;

    const key = header.dataset.sort;
    if (AppState.sort.key === key) {
      AppState.sort.direction = AppState.sort.direction === "asc" ? "desc" : "asc";
    } else {
      AppState.sort.key = key;
      AppState.sort.direction = "asc";
    }

    UI.renderReports();
  });

  elements.exportCsvBtn.addEventListener("click", () => exportCsvAll());
  elements.exportJsonBtn.addEventListener("click", () => exportJsonAll());
  elements.importJsonInput.addEventListener("change", importBackupFile);

  elements.resetLocalDataBtn.addEventListener("click", async () => {
    const acknowledgedBackup = confirm(
      "This will permanently erase all local meals and fasting entries on this device.\n\nBefore continuing, export a backup from the Data tab.\n\nContinue?"
    );
    if (!acknowledgedBackup) return;

    const confirmedWipe = confirm("Final confirmation: Reset ALL local data now?");
    if (!confirmedWipe) return;

    await DB.bulkReplaceAll([], []);
    AppState.meals = [];
    AppState.fastingEntries = [];
    AppState.openEditors.clear();
    AppState.fastingCollapsed = false;
    clearMessage();
    UI.renderMeals();
    UI.renderFastingEntries();
    UI.renderReports();
    alert("Local data has been reset.");
  });
}

function getFormValue(form, name) {
  const element = form.elements.namedItem(name);
  return element ? element.value : "";
}

function getInlineSelectedTags(form) {
  return [...form.querySelectorAll(".inline-chip.active")].map((chip) => chip.dataset.tag);
}

function renderInlinePreview(form, sourceMeal) {
  const stagedMeal = normalizeMealRecord({
    ...sourceMeal,
    peakGlucose: fromDisplayGlucose(getFormValue(form, "peakGlucose")),
    peakTimeMinutes: Calc.toNumberOrNull(getFormValue(form, "peakTimeMinutes")),
    glucoseAt2Hr: fromDisplayGlucose(getFormValue(form, "glucoseAt2Hr")),
    timeBackUnder120: Calc.toNumberOrNull(getFormValue(form, "timeBackUnder120")),
    notes: getFormValue(form, "notes"),
    contextTags: getInlineSelectedTags(form)
  });

  const preview = form.querySelector("[data-inline-preview]");
  if (preview) preview.innerHTML = UI.inlinePreviewHtml(stagedMeal);
}

function exportJsonAll() {
  const payload = {
    version: 2,
    meals: AppState.meals,
    fastingEntries: AppState.fastingEntries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(blob, `metabolic-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

function exportCsvAll() {
  const columns = [
    "recordType",
    "id",
    "date",
    "datetime",
    "mealPeriod",
    "complete",
    "description",
    "carbEstimate",
    "proteinLevel",
    "fatLevel",
    "preGlucose",
    "peakGlucose",
    "peakTimeMinutes",
    "glucoseAt2Hr",
    "timeBackUnder120",
    "notes",
    "contextTags",
    "spikeMagnitude",
    "spikeCategory",
    "durationCategory",
    "aucProxy",
    "returnDelta",
    "fastingGlucose"
  ];

  const lines = [columns.join(",")];

  AppState.meals.map((meal) => Calc.withDerived(meal)).forEach((meal) => {
    const exportRow = {
      recordType: "meal",
      ...meal,
      date: meal.datetime ? meal.datetime.slice(0, 10) : "",
      fastingGlucose: null
    };

    const row = columns.map((column) => {
      let value = exportRow[column];
      if (Array.isArray(value)) value = value.join("|");
      const safe = String(value ?? "").replaceAll('"', '""');
      return `"${safe}"`;
    });
    lines.push(row.join(","));
  });

  AppState.fastingEntries.forEach((entry) => {
    const exportRow = {
      recordType: "fasting",
      id: entry.id,
      date: entry.date,
      datetime: null,
      mealPeriod: null,
      complete: null,
      description: null,
      carbEstimate: null,
      proteinLevel: null,
      fatLevel: null,
      preGlucose: null,
      peakGlucose: null,
      peakTimeMinutes: null,
      glucoseAt2Hr: null,
      timeBackUnder120: null,
      notes: null,
      contextTags: null,
      spikeMagnitude: null,
      spikeCategory: null,
      durationCategory: null,
      aucProxy: null,
      returnDelta: null,
      fastingGlucose: entry.fastingGlucose
    };

    const row = columns.map((column) => {
      const safe = String(exportRow[column] ?? "").replaceAll('"', '""');
      return `"${safe}"`;
    });
    lines.push(row.join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `metabolic-tracker-backup-${new Date().toISOString().slice(0, 10)}.csv`);
}

async function importBackupFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    clearMessage();
    const text = await file.text();
    let importedMeals = [];
    let importedFasting = [];

    const fileName = (file.name || "").toLowerCase();
    const isCsv = fileName.endsWith(".csv");
    const isJson = fileName.endsWith(".json");

    if (isCsv) {
      const parsedRows = parseCsv(text);
      const extracted = extractFromCsvRows(parsedRows);
      importedMeals = extracted.meals;
      importedFasting = extracted.fastingEntries;
    } else if (isJson) {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        importedMeals = parsed;
      } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.meals)) {
        importedMeals = parsed.meals;
        importedFasting = Array.isArray(parsed.fastingEntries) ? parsed.fastingEntries : [];
      } else {
        throw new Error("Invalid JSON backup format.");
      }
    } else {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          importedMeals = parsed;
        } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.meals)) {
          importedMeals = parsed.meals;
          importedFasting = Array.isArray(parsed.fastingEntries) ? parsed.fastingEntries : [];
        } else {
          throw new Error("Invalid JSON backup format.");
        }
      } catch {
        const parsedRows = parseCsv(text);
        const extracted = extractFromCsvRows(parsedRows);
        importedMeals = extracted.meals;
        importedFasting = extracted.fastingEntries;
      }
    }

    const sanitizedMeals = importedMeals.map(sanitizeMealFromImport).filter(Boolean);
    const sanitizedFasting = importedFasting.map(sanitizeFastingFromImport).filter(Boolean);

    await DB.bulkReplaceAll(sanitizedMeals, sanitizedFasting);
    AppState.meals = sanitizedMeals;
    AppState.fastingEntries = sanitizedFasting;
    AppState.openEditors.clear();
    AppState.fastingCollapsed = AppState.fastingEntries.some((entry) => entry.date === getTodayDateIso());
    UI.renderMeals();
    UI.renderFastingEntries();
    UI.renderReports();
    clearMessage();
    alert(`Imported ${sanitizedMeals.length} meals and ${sanitizedFasting.length} fasting entries.`);
  } catch (error) {
    showMessage(`Import failed: ${error.message}`);
  } finally {
    event.target.value = "";
  }
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (!lines.length) return [];

  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function extractFromCsvRows(rows) {
  const meals = [];
  const fastingEntries = [];

  rows.forEach((row) => {
    const recordType = String(row.recordType || "meal").trim().toLowerCase();

    if (recordType === "fasting") {
      fastingEntries.push({
        id: row.id || row.date,
        date: row.date,
        fastingGlucose: row.fastingGlucose
      });
      return;
    }

    meals.push({
      id: row.id,
      datetime: row.datetime,
      description: row.description,
      carbEstimate: row.carbEstimate,
      proteinLevel: row.proteinLevel,
      fatLevel: row.fatLevel,
      preGlucose: row.preGlucose,
      peakGlucose: row.peakGlucose,
      peakTimeMinutes: row.peakTimeMinutes,
      glucoseAt2Hr: row.glucoseAt2Hr,
      timeBackUnder120: row.timeBackUnder120,
      notes: row.notes,
      contextTags: row.contextTags
    });
  });

  return { meals, fastingEntries };
}

function sanitizeMealFromImport(input) {
  if (!input || typeof input !== "object") return null;
  const parsedTags = Array.isArray(input.contextTags)
    ? input.contextTags.map(String)
    : typeof input.contextTags === "string"
      ? input.contextTags
          .split("|")
          .map((tag) => tag.trim())
          .filter((tag) => tag && tag.toLowerCase() !== "null")
      : [];

  const normalized = normalizeMealRecord({
    id: String(input.id || crypto.randomUUID()),
    datetime: new Date(input.datetime || Date.now()).toISOString(),
    description: String(input.description || "Untitled meal"),
    carbEstimate: Calc.toNumberOrNull(input.carbEstimate),
    proteinLevel: LEVELS.includes(input.proteinLevel) ? input.proteinLevel : "none",
    fatLevel: LEVELS.includes(input.fatLevel) ? input.fatLevel : "none",
    preGlucose: Calc.toNumberOrNull(input.preGlucose),
    peakGlucose: Calc.toNumberOrNull(input.peakGlucose),
    peakTimeMinutes: Calc.toNumberOrNull(input.peakTimeMinutes),
    glucoseAt2Hr: Calc.toNumberOrNull(input.glucoseAt2Hr),
    timeBackUnder120: Calc.toNumberOrNull(input.timeBackUnder120),
    notes: String(input.notes || ""),
    contextTags: parsedTags
  });

  const validationErrors = Calc.validateMealInput(normalized, "pre").concat(Calc.validateMealInput(normalized, "post"));
  return validationErrors.length ? null : normalized;
}

function sanitizeFastingFromImport(input) {
  if (!input || typeof input !== "object") return null;
  const normalized = normalizeFastingEntry(input);
  if (!normalized) return null;
  const validationErrors = Calc.validateFastingInput(normalized.fastingGlucose);
  return validationErrors.length ? null : normalized;
}

function valueOf(id) {
  return document.getElementById(id).value;
}

function setInputValue(id, value) {
  document.getElementById(id).value = value ?? "";
}

function formatDateShort(iso) {
  const date = new Date(iso);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function average(list) {
  if (!list.length) return null;
  return Number((list.reduce((sum, value) => sum + value, 0) / list.length).toFixed(1));
}

function formatNumber(value) {
  return value == null || Number.isNaN(value) ? "-" : String(value);
}

function toDisplayGlucose(valueMgdl) {
  if (valueMgdl == null) return null;
  if (AppState.glucoseUnit === UNITS.MMOL) {
    return Number((valueMgdl / MGDL_PER_MMOL).toFixed(1));
  }
  return Number(Math.round(valueMgdl));
}

function fromDisplayGlucose(rawValue) {
  const numeric = Calc.toNumberOrNull(rawValue);
  if (numeric == null) return null;
  if (AppState.glucoseUnit === UNITS.MMOL) {
    return Number((numeric * MGDL_PER_MMOL).toFixed(1));
  }
  return numeric;
}

function formatGlucose(valueMgdl) {
  const display = toDisplayGlucose(valueMgdl);
  if (display == null || Number.isNaN(display)) return "-";
  return AppState.glucoseUnit === UNITS.MMOL ? display.toFixed(1) : String(Math.round(display));
}

function formatAuc(valueAucMgdl) {
  if (valueAucMgdl == null || Number.isNaN(valueAucMgdl)) return "-";
  if (AppState.glucoseUnit === UNITS.MMOL) {
    return (valueAucMgdl / MGDL_PER_MMOL).toFixed(1);
  }
  return String(Math.round(valueAucMgdl));
}

function aucUnitLabel() {
  return AppState.glucoseUnit === UNITS.MMOL ? "mmol·min/L" : "mg·min/dL";
}

function getTodayDateIso() {
  const now = new Date();
  const timezoneOffsetMs = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - timezoneOffsetMs).toISOString().slice(0, 10);
}

function groupBy(list, keyGetter) {
  return list.reduce((groups, item) => {
    const key = keyGetter(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function categoryClass(category) {
  if (!category) return "";
  return category.toLowerCase();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function init() {
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {
        console.warn("Service worker registration failed.");
      });
    }

    UI.renderUnitState();
    UI.initToggleGroup(elements.proteinLevel, "protein", "none");
    UI.initToggleGroup(elements.fatLevel, "fat", "none");

    await DB.init();
    const storedMeals = await DB.getAllMeals();
    const storedFasting = await DB.getAllFasting();
    AppState.meals = storedMeals
      .map((meal) => normalizeMealRecord(meal))
      .filter((meal) => Calc.validateMealInput(meal, "pre").concat(Calc.validateMealInput(meal, "post")).length === 0);

    AppState.fastingEntries = storedFasting
      .map((entry) => normalizeFastingEntry(entry))
      .filter((entry) => entry && Calc.validateFastingInput(entry.fastingGlucose).length === 0);
    AppState.fastingCollapsed = AppState.fastingEntries.some((entry) => entry.date === getTodayDateIso());

    await DB.bulkReplaceAll(AppState.meals, AppState.fastingEntries);

    setInputValue("fastingDate", getTodayDateIso());
    setInputValue("fastingGlucose", "");
    setInputValue("preGlucose", "");
    UI.renderMeals();
    UI.renderFastingEntries();
    bindEvents();
  } catch (error) {
    console.error("Failed to initialize app", error);
    alert("Failed to initialize app data storage. Please refresh the page.");
  }
}

init();
