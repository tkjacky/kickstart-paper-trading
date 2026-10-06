---
version: v1.1
effective: 2026-09-30 HKT
status: simulation (paper only)
source: mirrored from 幣少's rule file; routines follow this text
---

# Kickstart v1.1 — Trend + Pullback（只做多 / Long-only）

紙上交易模擬策略。**唔會下真實單。** / Paper simulation only. **Do NOT place real trades.**

## 概覽 Overview

| 項目 | 設定 |
|------|------|
| 策略名 Strategy | Kickstart v1.1 — Trend + Pullback |
| 交易對 Universe | **BTC/USDT**, **ETH/USDT** only |
| 起始資金 Equity | 10,000 USDT（虛擬） |
| 槓桿 Leverage | 無 / None |
| 方向 Direction | 只做多 / Long-only |
| 狀態 Status | `simulation` |
| 修訂 Revision | **v1.1**（2026-09-30）：加 anti-chop、最低 reclaim、雙幣熱度上限。**只影響新進場**；已開倉繼續原 SL/TP。 |

## 風險與倉位 Risk & Position Sizing

- **每筆風險 Risk per trade**：權益嘅 **1%**（1% of equity）
- **雙幣熱度 Correlation heat**：若已有另一對開倉，新進場風險改為權益嘅 **0.5%**（總熱度約 1–1.5%）。若兩對都已開倉，唔再開新倉。
- **最多同時持倉 Max open positions**：**2**（每個交易對最多一倉 / at most one per pair）
- **手續費／滑點 Fees/slippage（模擬）**：來回合計 **0.1%** round-trip，用於 P&L 追蹤
- **每日訊號上限**：每個交易對每個曆日（**香港時間 HK**）最多 **一個** 新進場訊號

## 偏多濾鏡 Bias Filter（4H）

只喺以下條件成立時先考慮做多：

- **4H 收盤價 > EMA50（4H）**
- English: Only consider longs when the 4H close is above the 4H EMA50.

## 趨勢質素／Anti-chop（v1.1）

偏多濾鏡通過後，進場前仲要同時滿足：

1. **ADX(14, 4H) ≥ 20**，而且 **高於 6 根已收盤 4H 前** 嘅 ADX（趨勢仲喺度、唔係死緊）
2. （並行）過去 **12** 根已收盤 4H，收盤價穿越 EMA20 嘅次數 **≤ 3**；否則視為震盪、唔開新倉

English: After bias ON, require ADX(14) ≥ 20 and rising vs 6 bars ago; and ≤ 3 closes crossing EMA20 over the last 12 closed 4H bars.

## 進場 Entry（4H）

喺偏多濾鏡 **同** anti-chop 通過之後：

1. 等價回調靠近 **EMA20（4H）**
2. 當一根 **4H K 線** 曾經觸及／跌破 EMA20（包括下影線觸及），之後 **收盤重新站上 EMA20**，且收盤至少高過 EMA20 **0.15%**（收盤 ≥ EMA20 × 1.0015）→ 觸發進場
3. English: In bullish bias + anti-chop, wait for pullback toward EMA20; enter when a 4H candle closes back above EMA20 by at least **0.15%** after touching/crossing below it (or wick into it).

## 止損 Stop Loss

- 放喺回調波段低點之下（below the pullback swing low），**或者**
- 入場價下方 **1.5 × ATR(14)**（4H）
- 兩者都有時，用 **較緊** 嗰個（距離入場價較近、止損較高嗰個）
- English: Stop below pullback swing low, or 1.5× ATR(14) below entry if swing low unclear — use the **tighter** of the two when both available.

## 止盈 Take Profit

- **2R**（風險距離嘅兩倍 / 2× risk distance）

## 明確唔做 What We Do NOT Do

- 唔開真實倉、唔用 API key 下單
- 唔加槓桿
- 唔交易 BTC/USDT、ETH/USDT 以外嘅幣對
- 唔發明本文件以外嘅進出場規則
- 唔用新規則事後改已開倉嘅 SL／TP

## 指標定義 Indicator Notes

- 時間框架 Timeframe：主要用 **4H**；日線 1D 僅作背景參考
- EMA20 / EMA50：標準指數移動平均（對 4H 收盤價）
- ATR(14)：Wilder 平滑 ATR，基於 4H high/low/close
- ADX(14)：Wilder ADX on 4H（與 ATR 同一套平滑）
- 「穿越 EMA20」：相鄰兩根已收盤 4H，`(close[i]-EMA20[i])` 與 `(close[i-1]-EMA20[i-1])` 異號計一次
- 訊號判斷以 **已收盤** 嘅 4H K 為準（避免用未收盤棒誤觸）

---
*檔案維護見 README.md · v1.1 2026-09-30*

## 其他帳簿

Donchian 20/10（只做多）係**獨立帳簿**，規則見 `STRATEGY-DONCHIAN.md`，狀態見 `status-donchian.md`，紀錄見 `journal-donchian.json`。唔好同本 Kickstart 權益、持倉或平倉混合。

## 新聞註記 News notes（2026-10-06 起）

每次**新**開倉同平倉，都要喺 journal 加 `entry_news_tags`／`entry_news_note`（開倉）同 `exit_news_tags`／`exit_news_note`（平倉；開倉嗰兩欄照抄落平倉記錄）。格式同允許嘅標籤見 `JOURNAL-FORMAT.md` 第 7 節（crypto：`fomc`、`cpi`、`nfp`、`etf_flow`、`exchange`、`regulation`、`hack`、`none`）。做法：快速搜一搜嗰個時段有冇大新聞，冇就填 `["none"]` 同 `""`。**新聞只作記錄，絕對唔可以影響入場或離場決定**；唔改舊單。

## 改動記錄 Changelog

- 2026-09-22：v1.0 開始紙上模擬。
- 2026-09-30：v1.1 加 anti-chop、最低 reclaim 0.15%、雙幣熱度上限（只影響新進場）。
- 2026-10-03：EMA50 用標準 2/(N+1)；ADX(14) ≥ 20 而且高過 6 根之前；檢查時間改為 08:00、12:00、16:00、20:00 HKT。
- 2026-10-06：加新聞註記（只記錄，唔影響買賣）。規則冇變。
