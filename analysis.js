/* ===========================================
   銘柄分析メモ - メインスクリプト
   ----
   * 上から下に読めば全体が理解できる順で書いています
   * 保存先はブラウザの localStorage(キー名: stock-analysis-memo:analyses:v1)
   =========================================== */

const ANALYSES_KEY = "stock-analysis-memo:analyses:v1";

/* -------- データ操作(load / save) -------- */

function loadAnalyses() {
  try {
    const json = localStorage.getItem(ANALYSES_KEY);
    if (!json) return [];
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("分析データ読み込み失敗:", e);
    return [];
  }
}

function saveAnalyses(items) {
  localStorage.setItem(ANALYSES_KEY, JSON.stringify(items));
}

/* -------- ロジック(計算) -------- */

// 将来株価 = 予想PER × 予想EPS
function calcFuturePrice(per, eps) {
  if (!per || !eps) return null;
  return per * eps;
}

// 上昇率 = (将来 - 現在) / 現在 × 100
function calcRate(currentPrice, futurePrice) {
  if (!currentPrice || !futurePrice) return null;
  return ((futurePrice - currentPrice) / currentPrice) * 100;
}

/* -------- ロジック(表示用フォーマット) -------- */

function formatPrice(value) {
  if (value == null || isNaN(value)) return "--";
  return "¥" + Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 2 });
}

// 時価総額(円)を「兆 / 億」付きで人間に読みやすくする
function formatMarketCap(value) {
  if (value == null || isNaN(value)) return "--";
  const v = Number(value);
  if (v >= 1e12) return (v / 1e12).toFixed(2) + " 兆円";
  if (v >= 1e8)  return (v / 1e8).toFixed(2) + " 億円";
  return v.toLocaleString("ja-JP") + " 円";
}

function formatRate(rate) {
  if (rate == null || isNaN(rate)) return "--";
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)}%`;
}

function rateClass(rate) {
  if (rate == null || isNaN(rate)) return "flat";
  if (rate > 0) return "profit";
  if (rate < 0) return "loss";
  return "flat";
}

// XSS対策: HTML埋め込み前に必ず通す
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

/* -------- DOM要素の取り出し -------- */

// API設定パネル
const apiSettings  = document.getElementById("api-settings");
const apiKeyInput  = document.getElementById("api-key");
const saveKeyBtn   = document.getElementById("save-key-btn");
const clearKeyBtn  = document.getElementById("clear-key-btn");
const keyStatusEl  = document.getElementById("key-status");

// 銘柄検索フォーム
const fetchForm   = document.getElementById("fetch-form");
const codeInput   = document.getElementById("code");
const fetchBtn    = document.getElementById("fetch-btn");
const fetchStatus = document.getElementById("fetch-status");

// 結果カード(右側)
const resultCard      = document.getElementById("result-card");
const resultTitle     = document.getElementById("result-title");
const resultCode      = document.getElementById("result-code");
const resultCurrency  = document.getElementById("result-currency");
const currentPriceEl  = document.getElementById("current-price");
const marketCapEl     = document.getElementById("market-cap");
const price1yEl       = document.getElementById("price-1y");
const price2yEl       = document.getElementById("price-2y");
const rate1yEl        = document.getElementById("rate-1y");
const rate2yEl        = document.getElementById("rate-2y");
const forecastFormula = document.getElementById("forecast-formula");

// 将来予想の入力カード
const forecastCard  = document.getElementById("forecast-card");
const perInput      = document.getElementById("forecast-per");
const eps1yInput    = document.getElementById("eps-1y");
const eps2yInput    = document.getElementById("eps-2y");
const memoInput     = document.getElementById("memo");
const saveBtn       = document.getElementById("save-btn");
const cancelBtn     = document.getElementById("cancel-btn");

// 保存済み一覧
const savedListEl    = document.getElementById("saved-list");
const emptyMessageEl = document.getElementById("empty-message");

/* -------- 状態(現在取得済みの銘柄) --------
   API取得直後の現在価格・銘柄名などを一時的に保持しておく
*/
let currentQuote = null; // { code, name, currentPrice, marketCap, currency }

/* -------- API設定(キーの保存・クリア) -------- */

function initApiSettingsUI() {
  const existing = getApiKey();
  if (existing) {
    apiKeyInput.value = existing;
    keyStatusEl.textContent = "✓ APIキーは保存済みです";
    keyStatusEl.className = "status status-ok";
  } else {
    // 未設定なら最初から開いておく
    apiSettings.open = true;
  }
}

saveKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    keyStatusEl.textContent = "APIキーを入力してください。";
    keyStatusEl.className = "status status-error";
    return;
  }
  setApiKey(key);
  keyStatusEl.textContent = "✓ APIキーを保存しました";
  keyStatusEl.className = "status status-ok";
});

clearKeyBtn.addEventListener("click", () => {
  setApiKey("");
  apiKeyInput.value = "";
  keyStatusEl.textContent = "APIキーを削除しました";
  keyStatusEl.className = "status";
});

/* -------- 銘柄データの取得 -------- */

fetchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!/^\d{4,5}$/.test(code)) {
    fetchStatus.textContent = "銘柄コードは4〜5桁の数字で入力してください。";
    fetchStatus.className = "status status-error";
    return;
  }

  fetchStatus.textContent = "取得中…";
  fetchStatus.className = "status";
  fetchBtn.disabled = true;

  try {
    const quote = await fetchStockQuote(code);
    currentQuote = { code, ...quote };

    // 結果カードを表示
    resultTitle.textContent = quote.name;
    resultCode.textContent = `(${code}.T)`;
    resultCurrency.textContent = quote.currency || "";
    currentPriceEl.textContent = formatPrice(quote.currentPrice);
    marketCapEl.textContent = formatMarketCap(quote.marketCap);
    resultCard.classList.remove("hidden");
    forecastCard.classList.remove("hidden");

    // 同じ銘柄を以前に分析していたら、保存値を入力欄に復元
    const prev = loadAnalyses().find((a) => a.code === code);
    if (prev) {
      perInput.value   = prev.forecastPer ?? "";
      eps1yInput.value = prev.eps1y ?? "";
      eps2yInput.value = prev.eps2y ?? "";
      memoInput.value  = prev.memo ?? "";
    } else {
      perInput.value = eps1yInput.value = eps2yInput.value = memoInput.value = "";
    }
    recomputeForecast();

    fetchStatus.textContent = "";
  } catch (err) {
    console.error(err);
    fetchStatus.textContent = err.message || "取得に失敗しました";
    fetchStatus.className = "status status-error";
  } finally {
    fetchBtn.disabled = false;
  }
});

/* -------- 将来株価の再計算(入力が変わるたび) -------- */

function recomputeForecast() {
  if (!currentQuote) return;
  const per   = parseFloat(perInput.value);
  const eps1  = parseFloat(eps1yInput.value);
  const eps2  = parseFloat(eps2yInput.value);

  const p1 = calcFuturePrice(per, eps1);
  const p2 = calcFuturePrice(per, eps2);
  const r1 = calcRate(currentQuote.currentPrice, p1);
  const r2 = calcRate(currentQuote.currentPrice, p2);

  price1yEl.textContent = formatPrice(p1);
  price2yEl.textContent = formatPrice(p2);
  rate1yEl.textContent  = formatRate(r1);
  rate2yEl.textContent  = formatRate(r2);
  rate1yEl.className = "stat-sub " + rateClass(r1);
  rate2yEl.className = "stat-sub " + rateClass(r2);

  // 式の説明文(初心者向け)
  if (per && (eps1 || eps2)) {
    forecastFormula.textContent =
      `計算式: 予想株価 = 予想PER(${per}) × 予想EPS`;
  } else {
    forecastFormula.textContent =
      "予想PERと予想EPSを入力すると、将来株価が計算されます。";
  }
}

// 入力が変わるたびに再計算
[perInput, eps1yInput, eps2yInput].forEach((el) => {
  el.addEventListener("input", recomputeForecast);
});

/* -------- 保存 -------- */

saveBtn.addEventListener("click", () => {
  if (!currentQuote) return;

  const item = {
    code:         currentQuote.code,
    name:         currentQuote.name,
    currentPrice: currentQuote.currentPrice,
    marketCap:    currentQuote.marketCap,
    currency:     currentQuote.currency,
    forecastPer:  parseFloat(perInput.value)   || null,
    eps1y:        parseFloat(eps1yInput.value) || null,
    eps2y:        parseFloat(eps2yInput.value) || null,
    memo:         memoInput.value.trim(),
    savedAt:      Date.now(),
  };

  const all = loadAnalyses();
  // 同じコードがあれば置き換え、なければ先頭に追加
  const idx = all.findIndex((a) => a.code === item.code);
  if (idx >= 0) all[idx] = item;
  else all.unshift(item);

  saveAnalyses(all);
  renderList();

  fetchStatus.textContent = `✓ ${item.name} を保存しました`;
  fetchStatus.className = "status status-ok";
});

cancelBtn.addEventListener("click", () => {
  perInput.value = eps1yInput.value = eps2yInput.value = memoInput.value = "";
  recomputeForecast();
});

/* -------- 保存済み一覧 -------- */

function renderList() {
  const items = loadAnalyses();

  if (items.length === 0) {
    savedListEl.innerHTML = "";
    emptyMessageEl.classList.remove("hidden");
    return;
  }
  emptyMessageEl.classList.add("hidden");

  savedListEl.innerHTML = items.map((a) => {
    const p1 = calcFuturePrice(a.forecastPer, a.eps1y);
    const p2 = calcFuturePrice(a.forecastPer, a.eps2y);
    const r1 = calcRate(a.currentPrice, p1);
    const r2 = calcRate(a.currentPrice, p2);

    const memoHtml = a.memo
      ? `<p class="stock-memo">${escapeHtml(a.memo)}</p>`
      : "";

    return `
      <li class="stock-item" data-code="${escapeHtml(a.code)}">
        <div class="stock-head">
          <div class="stock-title">
            <span class="stock-code">${escapeHtml(a.code)}</span>
            ${escapeHtml(a.name)}
          </div>
        </div>
        <div class="stat-grid stat-grid-compact">
          <div class="stat">
            <span class="stat-label">現在</span>
            <span class="stat-value">${formatPrice(a.currentPrice)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">時価総額</span>
            <span class="stat-value">${formatMarketCap(a.marketCap)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">1年後</span>
            <span class="stat-value">${formatPrice(p1)}</span>
            <span class="stat-sub ${rateClass(r1)}">${formatRate(r1)}</span>
          </div>
          <div class="stat">
            <span class="stat-label">2年後</span>
            <span class="stat-value">${formatPrice(p2)}</span>
            <span class="stat-sub ${rateClass(r2)}">${formatRate(r2)}</span>
          </div>
        </div>
        ${memoHtml}
        <div class="stock-actions">
          <button type="button" class="btn btn-small btn-edit"   data-action="reload">再取得・編集</button>
          <button type="button" class="btn btn-small btn-delete" data-action="delete">削除</button>
        </div>
      </li>
    `;
  }).join("");
}

// 一覧上の「再取得・編集」「削除」(イベント委譲)
savedListEl.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const item = button.closest(".stock-item");
  if (!item) return;
  const code = item.dataset.code;
  const action = button.dataset.action;

  if (action === "delete") {
    const target = loadAnalyses().find((a) => a.code === code);
    if (!target) return;
    if (!confirm(`「${target.name}」(${code})を削除しますか?`)) return;
    saveAnalyses(loadAnalyses().filter((a) => a.code !== code));
    renderList();
    return;
  }

  if (action === "reload") {
    codeInput.value = code;
    fetchForm.requestSubmit();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

/* -------- 初期表示 -------- */

initApiSettingsUI();
renderList();
