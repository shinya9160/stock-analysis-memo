/* ===========================================
   株式分析メモ - メインスクリプト
   ----
   * データはブラウザの localStorage に保存します
   * 1ファイルにまとめ、上から下に読めば全体が理解できる構成です
   =========================================== */

// localStorage に保存するときのキー名
const STORAGE_KEY = "stock-analysis-memo:v1";

/* -------- データ操作(load / save) -------- */

// localStorage から銘柄リストを読み込む
function loadStocks() {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (!json) return [];
    const data = JSON.parse(json);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    // データが壊れていたら空で返す
    console.error("データ読み込みに失敗:", e);
    return [];
  }
}

// 銘柄リストを localStorage に保存する
function saveStocks(stocks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stocks));
}

/* -------- ロジック(損益率の計算) -------- */

// 損益率(%)を計算する
//   (現在価格 - 購入価格) / 購入価格 * 100
function calcProfitRate(buyPrice, currentPrice) {
  if (!buyPrice || buyPrice <= 0) return 0;
  return ((currentPrice - buyPrice) / buyPrice) * 100;
}

// 数字を「1,234」のような3桁区切りにする
function formatPrice(value) {
  return Number(value).toLocaleString("ja-JP", {
    maximumFractionDigits: 2,
  });
}

// HTMLに埋め込む文字列を安全にエスケープする(XSS対策)
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text == null ? "" : String(text);
  return div.innerHTML;
}

/* -------- DOM要素の取得 -------- */

const form = document.getElementById("stock-form");
const editIdInput = document.getElementById("edit-id");
const codeInput = document.getElementById("code");
const nameInput = document.getElementById("name");
const buyPriceInput = document.getElementById("buy-price");
const currentPriceInput = document.getElementById("current-price");
const memoInput = document.getElementById("memo");
const submitBtn = document.getElementById("submit-btn");
const cancelBtn = document.getElementById("cancel-btn");
const formTitle = document.getElementById("form-title");
const listEl = document.getElementById("stock-list");
const emptyMessageEl = document.getElementById("empty-message");

/* -------- 一覧の描画 -------- */

function render() {
  const stocks = loadStocks();

  // 空のとき
  if (stocks.length === 0) {
    listEl.innerHTML = "";
    emptyMessageEl.classList.remove("hidden");
    return;
  }
  emptyMessageEl.classList.add("hidden");

  // 銘柄ごとに<li>を作って組み立てる
  listEl.innerHTML = stocks.map((stock) => {
    const rate = calcProfitRate(stock.buyPrice, stock.currentPrice);
    // プラス・マイナス・変動なしで色を分ける
    let rateClass = "flat";
    let sign = "";
    if (rate > 0) { rateClass = "profit"; sign = "+"; }
    else if (rate < 0) { rateClass = "loss"; }

    const memoHtml = stock.memo
      ? `<p class="stock-memo">${escapeHtml(stock.memo)}</p>`
      : "";

    return `
      <li class="stock-item" data-id="${escapeHtml(stock.id)}">
        <div class="stock-head">
          <div class="stock-title">
            <span class="stock-code">${escapeHtml(stock.code)}</span>
            ${escapeHtml(stock.name)}
          </div>
          <div class="profit-rate ${rateClass}">
            ${sign}${rate.toFixed(2)}%
          </div>
        </div>
        <div class="stock-prices">
          <div class="price-block">
            <span class="price-label">購入価格</span>
            <span class="price-value">¥${formatPrice(stock.buyPrice)}</span>
          </div>
          <div class="price-block">
            <span class="price-label">現在価格</span>
            <span class="price-value">¥${formatPrice(stock.currentPrice)}</span>
          </div>
        </div>
        ${memoHtml}
        <div class="stock-actions">
          <button type="button" class="btn btn-small btn-edit" data-action="edit">編集</button>
          <button type="button" class="btn btn-small btn-delete" data-action="delete">削除</button>
        </div>
      </li>
    `;
  }).join("");
}

/* -------- フォームの操作 -------- */

// 新規追加モードに戻す
function resetForm() {
  form.reset();
  editIdInput.value = "";
  formTitle.textContent = "銘柄を追加";
  submitBtn.textContent = "追加する";
  cancelBtn.classList.add("hidden");
}

// 編集モードに切り替える
function startEdit(stock) {
  editIdInput.value = stock.id;
  codeInput.value = stock.code;
  nameInput.value = stock.name;
  buyPriceInput.value = stock.buyPrice;
  currentPriceInput.value = stock.currentPrice;
  memoInput.value = stock.memo || "";
  formTitle.textContent = "銘柄を編集";
  submitBtn.textContent = "更新する";
  cancelBtn.classList.remove("hidden");
  // フォームへスクロール
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

// フォーム送信(新規追加 or 更新)
form.addEventListener("submit", (event) => {
  event.preventDefault();

  // 入力値を取り出す
  const code = codeInput.value.trim();
  const name = nameInput.value.trim();
  const buyPrice = parseFloat(buyPriceInput.value);
  const currentPrice = parseFloat(currentPriceInput.value);
  const memo = memoInput.value.trim();

  // 簡単なバリデーション
  if (!code || !name) {
    alert("銘柄コードと銘柄名を入力してください。");
    return;
  }
  if (isNaN(buyPrice) || buyPrice < 0) {
    alert("購入価格を正しく入力してください。");
    return;
  }
  if (isNaN(currentPrice) || currentPrice < 0) {
    alert("現在価格を正しく入力してください。");
    return;
  }

  const stocks = loadStocks();
  const editingId = editIdInput.value;

  if (editingId) {
    // 更新
    const idx = stocks.findIndex((s) => s.id === editingId);
    if (idx >= 0) {
      stocks[idx] = {
        ...stocks[idx],
        code, name, buyPrice, currentPrice, memo,
        updatedAt: Date.now(),
      };
    }
  } else {
    // 新規追加(IDは現在時刻 + 乱数でユニークに)
    stocks.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      code, name, buyPrice, currentPrice, memo,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  saveStocks(stocks);
  resetForm();
  render();
});

// キャンセルボタン
cancelBtn.addEventListener("click", () => {
  resetForm();
});

// 一覧の編集/削除ボタンを処理(イベント委譲)
listEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = button.closest(".stock-item");
  if (!item) return;

  const id = item.dataset.id;
  const action = button.dataset.action;
  const stocks = loadStocks();

  if (action === "edit") {
    const stock = stocks.find((s) => s.id === id);
    if (stock) startEdit(stock);
  } else if (action === "delete") {
    const stock = stocks.find((s) => s.id === id);
    if (!stock) return;
    if (confirm(`「${stock.name}」を削除しますか?`)) {
      const next = stocks.filter((s) => s.id !== id);
      saveStocks(next);
      // 編集中の銘柄を削除した場合はフォームもリセット
      if (editIdInput.value === id) resetForm();
      render();
    }
  }
});

// 初期表示
render();
