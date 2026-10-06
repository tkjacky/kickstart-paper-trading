---
version: v1.0
effective: 2026-10-04 HKT
status: simulation (paper only)
source: mirrored from 幣少's rule file; routines follow this text
---

# Donchian 20/10 — 簡化海龜 System 1（只做多 / Long-only）

紙上交易模擬策略。**唔會下真實單。** / Paper simulation only. **Do NOT place real trades.**

獨立帳簿，同 Kickstart v1.1 **唔好混合權益、持倉、平倉**。Kickstart 仍然只寫 `journal.json`。

## 概覽 Overview

| 項目 | 設定 |
|------|------|
| 策略名 Strategy | Donchian 20/10 (Long-only) |
| 帳簿 Book | `journal-donchian.json`（`book_id`: `donchian-20-10`） |
| 交易對 Universe | **BTC/USDT**, **ETH/USDT** only |
| 起始資金 Equity | 10,000 USDT（虛擬，只屬於呢本帳簿） |
| 槓桿 Leverage | 無 / None |
| 方向 Direction | 只做多 / Long-only。無短倉。 |
| 狀態 Status | `simulation` |
| 開始 Start | **2026-10-04 HKT**。唔好回填之前嘅歷史成交。 |
| 資料來源 | Binance public via `https://data-api.binance.vision` |

## 日線 Daily candles

- 一根日線 = **香港時間曆日**：當日 **00:00 HKT** 起到下一日 **00:00 HKT**（收盤時刻係 00:00 Asia/Hong_Kong）。
- **唔好**用 Binance `interval=1d`。嗰啲 K 喺 00:00 **UTC**（08:00 HKT）收，唔係本策略嘅日線。
- 用同一公開來源嘅 **4h** K 砌日線。Binance 4h 開盤對齊 00:00 / 04:00 / 08:00 / 12:00 / 16:00 / 20:00 **HKT**。一日六根：
  - open = 00:00 嗰根嘅 open
  - high = 六根最高
  - low = 六根最低
  - close = 20:00 嗰根嘅 close（該根喺下一日 00:00 HKT 先收完）
- 六根都收盤先算「已完成日線」。未收盤嘅當日 **唔好**用嚟進場。
- 歷史日線只可以用嚟計 20 日高、10 日低、ATR(20)。唔好因此開歷史倉。

## 風險與倉位 Risk & Position Sizing

- **每筆風險**：呢本帳簿 `equity`（已實現權益，唔好用 Kickstart 嘅數）嘅 **1%**。
- 若另一對已經開倉，新進場風險改為 **0.5%**。兩對都已開倉就唔再開。
- **最多同時持倉**：2。每個交易對最多一倉。唔加單位、唔金字塔。
- **每個交易對每個香港曆日最多一個新進場。** 進場時刻係日線收盤（00:00 HKT），呢個時刻計入新一日。
- **數量** = 風險金額 ÷ (fill − stop)。允許碎幣。
- **手續費**：來回合計 **0.1%**，處理同 Kickstart。
  - 開倉唔扣權益。
  - 平倉先計：`fees_usdt = entry_notional × 0.001`（一次過，唔係進出各 0.1%）。
  - `gross_pnl_usdt = (exit − entry) × qty`
  - `net_pnl_usdt = gross_pnl_usdt − fees_usdt`
  - `r_multiple = gross_pnl_usdt / risk_usdt`（止損價成交係 −1R，費用另計，唔計入 R）。
  - `equity` 只喺平倉後加 `net_pnl_usdt`。

## 進場 Entry

喺**已完成**日線收盤嗰刻：

- 若該收盤 **高於** 之前 **20** 根已完成日線嘅最高高（previous 20 completed daily highs，**唔包括**訊號當日），就做多。
- 成交價 = 該收盤價。
- 無 EMA、無 ADX、無回調濾鏡。
- 無短倉、無槓桿。
- 當日日線未收（收盤係當晚 00:00 HKT）就唔好進場。

## N 同初始止損 Stop

- **N** = Wilder **ATR(20)**，用已完成日線，**包括訊號當日**。
- TR = max(high−low, |high−前收|, |low−前收|)。
- 第一個 ATR = 頭 20 個 TR 嘅簡單平均；之後 `ATR = (前 ATR × 19 + 當日 TR) / 20`。
- **初始止損** = fill − **2N**。止損喺進場時定死，唔追蹤上移。
- 若價格**成交穿過**止損，喺止損價離場。
- 若**跳空穿過**（某根 K 開盤已經穿過止損），喺該根**開盤價**離場。

## 離場 Exit

- **無止賺。**
- 離場條件（邊個先到就邊個）：
  1. 價格成交到「之前 **10** 根已完成日線嘅最低低」（唔包括未收盤當日；新一日收盤後先更新呢條線），跳空規則同上；或者
  2. 上面嘅 2N 止損。
- 同一日內兩條線都可能被碰到：用更細嘅公開 K（1h，仍然分唔到先後就用 1m，同一 `data-api.binance.vision`）睇**先碰到**嗰條。唔好估。
- 無 55 日強制離場。無「贏完之後跳過下一訊號」。

## 明確唔做 What We Do NOT Do

- 唔開真實倉、唔用 API key 下單
- 唔加槓桿、唔做空
- 唔交易 BTC/USDT、ETH/USDT 以外
- 唔把 Donchian 成交寫入 Kickstart `journal.json`
- 唔用 Kickstart 權益計倉
- 唔回填 2026-10-04 之前嘅成交
- 唔加 EMA / ADX / 回調 / 加倉 / 55 日 failsafe / skip-after-winner

## 檔案

- 規則：本檔
- 紀錄：`journal-donchian.json`
- 狀態：`status-donchian.md`
- Dashboard 下拉標籤：`Donchian 20/10 (Long-only)`

---
*2026-10-04 HKT 開帳簿。當日日線未收，開倉數 = 0。*

## 新聞註記 News notes（2026-10-06 起）

每次**新**開倉同平倉，都要喺 journal 加 `entry_news_tags`／`entry_news_note`（開倉）同 `exit_news_tags`／`exit_news_note`（平倉；開倉嗰兩欄照抄落平倉記錄）。格式同允許嘅標籤見 `JOURNAL-FORMAT.md` 第 7 節（crypto：`fomc`、`cpi`、`nfp`、`etf_flow`、`exchange`、`regulation`、`hack`、`none`）。做法：快速搜一搜嗰個時段有冇大新聞，冇就填 `["none"]` 同 `""`。**新聞只作記錄，絕對唔可以影響入場或離場決定**；唔改舊單。

## 改動記錄 Changelog

- 2026-10-04：v1.0 開始紙上模擬，唔回填歷史。
- 2026-10-06：加新聞註記（只記錄，唔影響買賣）。規則冇變。
