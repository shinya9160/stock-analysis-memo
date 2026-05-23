/* ===========================================
   銘柄分析 - 株価API ラッパー
   ----
   このファイルは「株価データを取ってくる処理」だけを担当します。
   別のサービスに乗り換えたくなったら、この fetchStockQuote の
   中身だけを書き換えれば、画面側 (analysis.js) を触らずに済みます。

   現状: Yahoo Finance の chart エンドポイントを使用
     - ブラウザから直接叩くと CORS で弾かれるため、公開プロキシ
       (allorigins.win) を経由する
     - APIキー不要・無料・日本株対応(.T サフィックス)
   =========================================== */

// CORSプロキシ。Yahoo Finance はブラウザ直接アクセスを許可していないため、
// 公開プロキシ経由でJSONを取得する。
// 万一 allorigins.win が落ちた場合は、以下の代替プロキシに差し替え可能:
//   - "https://corsproxy.io/?"
//   - "https://cors.eu.org/"
const CORS_PROXY = "https://api.allorigins.win/raw?url=";

/**
 * 銘柄コード(4桁)から株価情報を取得する
 *
 * @param {string} code  例: "7203"
 * @returns {Promise<{name:string, currentPrice:number, marketCap:number|null, currency:string}>}
 * @throws {Error}  ネットワーク・パース失敗・銘柄不存在のいずれか
 */
async function fetchStockQuote(code) {
  // 日本株は東証 = ".T" サフィックス
  const symbol = `${code}.T`;

  // Yahoo Finance の "chart" エンドポイントは認証不要で価格と銘柄名を返す
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const proxiedUrl = CORS_PROXY + encodeURIComponent(yahooUrl);

  let res;
  try {
    res = await fetch(proxiedUrl);
  } catch (e) {
    throw new Error("ネットワークエラー: サーバーに接続できませんでした。");
  }
  if (!res.ok) {
    throw new Error(`サーバーエラー (HTTP ${res.status})。少し時間をおいて再試行してください。`);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error("レスポンスを解釈できませんでした(プロキシ応答異常の可能性)。");
  }

  // Yahoo はエラー時に chart.error にメッセージを入れる
  const errInfo = data?.chart?.error;
  if (errInfo) {
    if (errInfo.code === "Not Found") {
      throw new Error(`銘柄コード ${code} が見つかりません。コードが正しいか確認してください。`);
    }
    throw new Error(`データ取得失敗: ${errInfo.description || errInfo.code || "原因不明"}`);
  }

  const result = data?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta) {
    throw new Error(`銘柄コード ${code} のデータが見つかりませんでした。`);
  }

  const price = parseFloat(meta.regularMarketPrice);
  if (isNaN(price)) {
    throw new Error(`銘柄コード ${code} の価格情報が取得できませんでした。`);
  }

  return {
    // longName が無ければ shortName、それも無ければコードを表示用に使う
    name:         meta.longName || meta.shortName || `銘柄 ${code}`,
    currentPrice: price,
    // chart エンドポイントは時価総額を返さない。Yahoo の time-cap情報は
    // 認証付きエンドポイントが必要なので、ここでは null としておく。
    // 必要であれば手入力欄を analysis.html に追加して補完してください。
    marketCap:    null,
    currency:     meta.currency || "JPY",
  };
}
