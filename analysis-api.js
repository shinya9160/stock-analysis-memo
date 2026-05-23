/* ===========================================
   銘柄分析 - 株価API ラッパー
   ----
   このファイルは「株価データを取ってくる処理」だけを担当します。
   別のサービスに乗り換えたくなったら、この fetchStockQuote の
   中身だけを書き換えれば、画面側 (analysis.js) を触らずに済みます。

   現状は Twelve Data (https://twelvedata.com) を使用しています。
     - 無料プラン目安: 8 calls/分、800 calls/日
     - 日本株は「7203.T」のように .T を付けて指定
   =========================================== */

// localStorage に APIキーを保存するときのキー名
const API_KEY_STORAGE = "stock-analysis-memo:api-key";

// APIキー取得
function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || "";
}

// APIキー保存(空文字なら削除)
function setApiKey(key) {
  if (key) localStorage.setItem(API_KEY_STORAGE, key);
  else localStorage.removeItem(API_KEY_STORAGE);
}

/**
 * 銘柄コード(4桁)から株価情報を取得する
 *
 * @param {string} code  例: "7203"
 * @returns {Promise<{name:string, currentPrice:number, marketCap:number|null, currency:string}>}
 * @throws {Error}  APIキー未設定、ネットワークエラー、または取得失敗
 */
async function fetchStockQuote(code) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("APIキーが未設定です。画面上部の『API設定』から登録してください。");
  }

  // 日本株は東証(TYO)= ".T" サフィックス
  const symbol = `${code}.T`;
  const enc = encodeURIComponent;

  // 1) 価格・銘柄名 → /quote
  // 2) 時価総額         → /statistics
  // 並列で叩いて速くする。/statistics は無料プランで叩けない可能性があるため
  // 失敗してもアプリ全体は止めず、時価総額のみ「--」表示にする。
  const quoteUrl = `https://api.twelvedata.com/quote?symbol=${enc(symbol)}&apikey=${enc(apiKey)}`;
  const statUrl  = `https://api.twelvedata.com/statistics?symbol=${enc(symbol)}&apikey=${enc(apiKey)}`;

  const [quoteResult, statResult] = await Promise.allSettled([
    fetch(quoteUrl).then((r) => r.json()),
    fetch(statUrl).then((r) => r.json()),
  ]);

  // --- /quote の結果 ---
  if (quoteResult.status !== "fulfilled") {
    throw new Error("ネットワークエラー: 株価サーバーに接続できませんでした。");
  }
  const quote = quoteResult.value;
  // Twelve Data はエラー時 { status: "error", message: "..." } を返す
  if (quote && quote.status === "error") {
    throw new Error(`データ取得失敗: ${quote.message || "原因不明"}`);
  }
  const currentPrice = parseFloat(quote.close);
  if (!quote || isNaN(currentPrice)) {
    throw new Error(`銘柄コード ${code} のデータが見つかりませんでした。`);
  }

  // --- /statistics の結果(失敗しても続行) ---
  let marketCap = null;
  if (statResult.status === "fulfilled") {
    const stat = statResult.value;
    if (stat && stat.status !== "error") {
      const m = stat?.statistics?.valuations_metrics?.market_capitalization;
      const num = typeof m === "string" ? parseFloat(m) : m;
      if (typeof num === "number" && !isNaN(num)) marketCap = num;
    }
  }

  return {
    name: quote.name || `銘柄 ${code}`,
    currentPrice,
    marketCap,
    currency: quote.currency || "JPY",
  };
}
