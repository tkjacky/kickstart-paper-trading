---
version: v1.0
effective: 2026-09-30 HKT
status: simulation (paper only)
source: canonical; routines follow this text
---

# US Stocks: Trend 20/50（只做多 / Long-only）

紙上交易模擬策略。**唔會下真實單。** / Paper simulation only. **Do NOT place real trades.**

獨立帳簿，同 HK 股票簿、crypto 簿**唔好混合**權益、持倉、平倉。Journal：`journal-us-stocks.json`（`book_id`: `us-stocks-trend-20-50`）。

## 概覽 Overview

| 項目 | 設定 |
|------|------|
| 策略名 Strategy | US Stocks: Trend 20/50 (Long-only) |
| 帳簿 Book | `journal-us-stocks.json` |
| 市場 Market | US equities |
| Universe | **SPY**, **QQQ**, **AAPL**, **MSFT**, **NVDA** |
| 起始資金 Equity | 10,000 USD（虛擬） |
| 槓桿 Leverage | 無 / None |
| 方向 Direction | 只做多 / Long-only。無短倉。 |
| 狀態 Status | `simulation` |
| 開始 Start | **2026-09-30 HKT** |
| 手續費 Fees | 紙上 **0** |
| 股數 Shares | 整數股 only（`whole_shares_only`） |

## 趨勢濾鏡 Trend filter（硬條件）

只喺以下同時成立先考慮做多：

- 日線收盤價 **> 20DMA**
- **20DMA > 50DMA**
- 否則：空手／唔開新多倉

## 入場 Entry（二選一）

**A) Pullback：** 上升趨勢日之後，收盤喺 20DMA 上方 **1.5% 以內**。

**B) Breakout：** 收盤破 20 日高，且前一日未已經伸延至 20DMA 上方 **>5%**。

**跳過 Skip if：**

- 當日高開／跳空向上 **>2%**，或
- 距離 20DMA **>3%**，或
- 已接近 20 日高，且前一日係 **>2%** 綠柱（唔追）

## 風險與倉位 Risk & Position Sizing

- **每筆風險**：該帳戶權益嘅 **1.5%**
- **止損 Stop**：放喺近期波段低／約 20DMA 低區；若止損令風險 **>1.5%**，減股數直至 ≤1.5%
- **最多同時持倉**：每帳戶 **2**
- **單一標的**：最多用該帳戶現金嘅 **60%**
- **每 session 最多一個新進場**（除非只係處理離場）
- 數量：`quantity = floor(risk_amount / (fill − stop))`（整數股）

## 離場 Exit

1. **Hard stop** 觸及 → 全平（`exit_reason`: `stop_loss`）
2. 平均成本 **+8%** → 止損移至成本（breakeven）
3. 日線收盤 **< 20DMA** → 下一個 session 開盤紙上平倉（`below_20dma`）
4. 先 **+5% 減半**：賣 50%（`scale_50`）；剩餘用 **10DMA** 下方 trail（`trail_10dma`）
5. `take_profit_price` 一律 `null`（呢套規則冇固定價止盈）

## 掃描節奏 Scan cadence

- 平日 **22:12 HKT**（美股 session 掃描）
- 美股收市標記：**Tue–Sat 04:40 HKT**（`us-stocks-close-mark`）
- 股神寫本地 journal；**只由 幣少 push** 去公開 GitHub Pages

## 明確唔做 What We Do NOT Do

- 唔開真實倉、唔用券商 API 下單
- 唔加槓桿、唔做空
- 唔交易本文件 Universe 以外嘅標的（改 Universe = 新版本 + 平行新帳）
- 未滿 **20–30** 筆已平倉單之前，唔改入場／離場／倉位規則（除非風控違規）
- 唔用新聞決定買賣（見下）
- 唔把真實戶口／銀行／身份／實盤金額寫入任何檔

## 新聞註記 News notes（2026-10-06 起）

每次**新**開倉同平倉，喺 journal 填：

- 開倉：`entry_news_tags`／`entry_news_note`
- 平倉：`exit_news_tags`／`exit_news_note`（並帶上開倉嗰兩欄）

允許標籤（小寫）：`fomc`｜`cpi`｜`nfp`｜`etf_flow`｜`exchange`｜`regulation`｜`hack`｜`earnings`｜`sector`｜`none`。冇大事就 `["none"]` 同 `""`。只記公開標題級內容；**絕對唔影響入場或離場**；唔補舊單。詳見 `JOURNAL-FORMAT.md` §7。

## 改動記錄 Changelog

- 2026-09-30：v1.0 開始紙上模擬（20/50 趨勢、1.5% 風險、最多 2 倉、pullback／breakout 入場）。
- 2026-10-06：加新聞註記（只記錄，唔影響買賣）。規則本身冇變。加本 canonical 檔。
