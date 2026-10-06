/* Paper-trading dashboard — one page, one book per strategy.
   Local /dashboard/ reads journals from the project root.
   GitHub Pages reads them beside index.html. */
(() => {
  const REFRESH_MS = 30000;
  const BOOKS = {
    "kickstart-v1.1": {
      file: "journal.json",
      buy: "買  收盤高過 EMA50，ADX ≥ 20 而且升緊，12 根穿越 EMA20 ≤ 3，回調後站上 0.15%。",
      sell: "賣  止蝕（回調低點或 1.5×ATR，用較近）或者止賺 2R，邊個先到就賣。",
    },
    "donchian-20-10": {
      file: "journal-donchian.json",
      buy: "日線收盤突破過去 20 日最高就買。",
      sell: "跌破過去 10 日最低，或者離入場價 2 倍平均波幅，邊個先到就賣。無止賺。",
    },
    "us-stocks-trend-20-50": {
      file: "journal-us-stocks.json",
      stock: true,
      currency: "USD",
      buy: "買  收盤高過 20 日線，20 日線高過 50 日線；回調到 20 日線 1.5% 內或者突破 20 日高就買。離線超過 3% 或大升日唔追。",
      sell: "賣  硬止蝕；收市跌穿 20 日線翌日開市平；賺 5% 平一半；賺 8% 止蝕移到成本；其餘跟 10 日線。紙上手續費計 0。",
    },
    "hk-stocks-trend-20-50": {
      file: "journal-hk-stocks.json",
      stock: true,
      currency: "HKD",
      buy: "買  收盤高過 20 日線，20 日線高過 50 日線；回調到 20 日線 1.5% 內或者突破 20 日高就買。離線超過 3% 或大升日唔追。",
      sell: "賣  硬止蝕；收市跌穿 20 日線翌日開市平；賺 5% 平一半；賺 8% 止蝕移到成本；其餘跟 10 日線。紙上手續費計 0。",
    },
  };

  // Money fields: stock books use neutral names (net_pnl, notional, ...);
  // crypto books keep the legacy *_usdt names. Read either.
  function val(o, base) {
    if (!o) return null;
    return o[base] ?? o[base + "_usdt"] ?? null;
  }
  let unit = "USDT";

  function journalUrl(file) {
    const path = location.pathname.replace(/\/index\.html$/i, "");
    const inDashboard = /\/dashboard\/?$/.test(path);
    return (inDashboard ? "../" : "./") + file;
  }

  let equityChart, cumPnlChart, pnlBarChart;
  let autoTimer = null;
  let autoOn = false;

  const $ = (id) => document.getElementById(id);

  function fmtNum(n, dig = 2) {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: dig,
      maximumFractionDigits: dig,
    });
  }

  function fmtPrice(n) {
    if (n == null) return "—";
    const abs = Math.abs(n);
    const dig = abs >= 1000 ? 2 : abs >= 1 ? 2 : 4;
    return fmtNum(n, dig);
  }

  function pnlClass(n) {
    if (n == null) return "";
    if (n > 0) return "pos";
    if (n < 0) return "neg";
    return "";
  }

  function fmtTime(ts) {
    return String(ts ?? "").replace(/\s+(?:HKT|UTC|GMT)$/, "");
  }

    function sizeOf(pos) {
    if (pos.quantity != null) return `${fmtNum(pos.quantity, 0)} 股`;
    if (pos.size_btc != null) return `${fmtNum(pos.size_btc, 8)} BTC`;
    if (pos.size_eth != null) return `${fmtNum(pos.size_eth, 8)} ETH`;
    return "—";
  }

  function showErr(msg) {
    const box = $("errBox");
    if (!msg) {
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.style.display = "block";
    box.textContent = msg;
  }

  function sortClosed(trades) {
    return [...trades].sort((a, b) => {
      const ta = a.closed_at_iso || a.closed_at || "";
      const tb = b.closed_at_iso || b.closed_at || "";
      return ta.localeCompare(tb);
    });
  }

  function buildEquitySeries(j, closed) {
    const labels = ["Start"];
    const data = [j.starting_equity];
    for (const t of closed) {
      labels.push(shortLabel(t.closed_at || t.closed_at_iso, t.pair));
      data.push(t.equity_after);
    }
    // If journal equity differs (open positions don't change equity until close),
    // still show journal equity as a marker only when no open unrealized in equity field.
    return { labels, data };
  }

  function shortLabel(ts, pair) {
    // "2026-09-24 20:10:35 HKT" → "09-24 BTC"
    const m = String(ts).match(/(\d{4})-(\d{2})-(\d{2})/);
    const d = m ? `${m[2]}-${m[3]}` : String(ts).slice(0, 10);
    const p = (pair || "").replace("/USDT", "");
    return `${d} ${p}`;
  }

  function chartDefaults() {
    Chart.defaults.color = "#93a0b8";
    Chart.defaults.borderColor = "#243049";
    Chart.defaults.font.family =
      '"SF Pro Text","Segoe UI","PingFang HK","Noto Sans TC",system-ui,sans-serif';
  }

  function upsertLine(chartRef, canvasId, labels, data, opts) {
    const ctx = $(canvasId).getContext("2d");
    const color = opts.color || "#5b8cff";
    const cfg = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: opts.label,
            data,
            borderColor: color,
            backgroundColor: color + "33",
            fill: true,
            tension: 0.25,
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `${opts.label}: ${fmtNum(c.parsed.y)} ${unit}`,
            },
          },
        },
        scales: {
          x: { grid: { color: "#1c2740" } },
          y: {
            grid: { color: "#1c2740" },
            ticks: {
              callback: (v) => fmtNum(v, 0),
            },
          },
        },
      },
    };
    if (chartRef) {
      chartRef.data.labels = labels;
      chartRef.data.datasets[0].data = data;
      chartRef.data.datasets[0].borderColor = color;
      chartRef.data.datasets[0].backgroundColor = color + "33";
      chartRef.update();
      return chartRef;
    }
    return new Chart(ctx, cfg);
  }

  function upsertBar(chartRef, canvasId, labels, data) {
    const ctx = $(canvasId).getContext("2d");
    const colors = data.map((v) => (v >= 0 ? "#2dd4a8" : "#f07178"));
    const cfg = {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Net PnL",
            data,
            backgroundColor: colors,
            borderRadius: 6,
            maxBarThickness: 48,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) => `Net PnL: ${fmtNum(c.parsed.y)} ${unit}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: "#1c2740" },
            ticks: { callback: (v) => fmtNum(v, 0) },
          },
        },
      },
    };
    if (chartRef) {
      chartRef.data.labels = labels;
      chartRef.data.datasets[0].data = data;
      chartRef.data.datasets[0].backgroundColor = colors;
      chartRef.update();
      return chartRef;
    }
    return new Chart(ctx, cfg);
  }

  function renderKpis(j, closed) {
    const start = j.starting_equity;
    const eq = j.equity_current ?? j.equity;
    const realized = closed.reduce((s, t) => s + (val(t, "net_pnl") || 0), 0);
    const ret = start ? ((eq - start) / start) * 100 : 0;
    const wins = closed.filter((t) => (val(t, "net_pnl") || 0) > 0).length;
    const wr = closed.length ? (wins / closed.length) * 100 : null;

    $("kpiEquity").textContent = `${fmtNum(eq)} ${unit}`;
    if (j.equity_current != null) {
      $("kpiEquityHint").textContent = `起始 ${fmtNum(start)} ${unit}｜含未實現 marked-to-market（會計 ${fmtNum(j.equity)}）`;
    } else {
      $("kpiEquityHint").textContent = `起始 ${fmtNum(start)} ${unit}`;
    }

    const pnlEl = $("kpiPnl");
    pnlEl.textContent = `${realized >= 0 ? "+" : ""}${fmtNum(realized)}`;
    pnlEl.className = `value ${pnlClass(realized)}`;

    $("kpiOpen").textContent = String((j.open_positions || []).length);
    $("kpiClosed").textContent = String(closed.length);
    $("kpiWinHint").textContent =
      wr == null ? "勝率 —" : `勝率 ${fmtNum(wr, 0)}%（${wins}/${closed.length}）`;

    const retEl = $("kpiRet");
    retEl.textContent = `${ret >= 0 ? "+" : ""}${fmtNum(ret)}%`;
    retEl.className = `value ${pnlClass(ret)}`;
  }

  function renderOpen(positions) {
    const body = $("openBody");
    body.innerHTML = "";
    $("openCount").textContent = `${positions.length} 倉`;
    if (!positions.length) {
      $("openEmpty").style.display = "block";
      return;
    }
    $("openEmpty").style.display = "none";
    for (const p of positions) {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(p.pair)}</td>
        <td>${esc(p.side)}</td>
        <td>${esc(fmtTime(p.opened_at || p.opened_at_iso))}</td>
        <td>${fmtPrice(p.entry_price)}</td>
        <td>${fmtPrice(p.stop_price)}</td>
        <td>${fmtPrice(p.take_profit_price)}</td>
        <td>${fmtPrice(p.last_mark_price)}</td>
        <td class="${pnlClass(val(p, "unrealized_net"))}">${fmtNum(val(p, "unrealized_net"))}</td>
        <td>${sizeOf(p)}</td>
        <td>${fmtNum(val(p, "notional"))}</td>
        <td>${fmtNum(p.risk_amount ?? p.risk_usdt)}</td>`;
      body.appendChild(tr);
    }
  }

  function renderClosed(closed) {
    const body = $("closedBody");
    body.innerHTML = "";
    // newest first for table readability
    const rows = [...closed].reverse();
    $("closedCount").textContent = `${closed.length} 筆`;
    if (!rows.length) {
      $("closedEmpty").style.display = "block";
      return;
    }
    $("closedEmpty").style.display = "none";
    for (const t of rows) {
      const tr = document.createElement("tr");
      const net = val(t, "net_pnl");
      tr.innerHTML = `
        <td>${esc(t.pair)}</td>
        <td>${esc(fmtTime(t.opened_at || ""))}</td>
        <td>${esc(fmtTime(t.closed_at || ""))}</td>
        <td>${fmtPrice(t.entry_price)}</td>
        <td>${fmtPrice(t.exit_price)}</td>
        <td>${sizeOf(t)}</td>
        <td>${fmtNum(t.risk_amount ?? t.risk_usdt)}</td>
        <td>${esc(t.exit_reason || "")}</td>
        <td class="${pnlClass(val(t, "gross_pnl"))}">${fmtNum(val(t, "gross_pnl"))}</td>
        <td>${fmtNum(val(t, "fees"))}</td>
        <td class="${pnlClass(net)}">${fmtNum(net)}</td>
        <td class="td-end-2 ${pnlClass(t.r_multiple)}">${fmtNum(t.r_multiple, 2)}R</td>
        <td class="td-end">${fmtNum(t.equity_after)}</td>`;
      body.appendChild(tr);
    }
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderCharts(j, closed) {
    const eq = buildEquitySeries(j, closed);
    equityChart = upsertLine(equityChart, "equityChart", eq.labels, eq.data, {
      label: "Equity",
      color: "#5b8cff",
    });

    const cumLabels = ["Start"];
    const cumData = [0];
    let run = 0;
    for (const t of closed) {
      run += val(t, "net_pnl") || 0;
      cumLabels.push(shortLabel(t.closed_at || t.closed_at_iso, t.pair));
      cumData.push(run);
    }
    cumPnlChart = upsertLine(cumPnlChart, "cumPnlChart", cumLabels, cumData, {
      label: "Cumulative PnL",
      color: run >= 0 ? "#2dd4a8" : "#f07178",
    });

    const barLabels = closed.map((t) => shortLabel(t.closed_at || t.closed_at_iso, t.pair));
    const barData = closed.map((t) => val(t, "net_pnl") || 0);
    pnlBarChart = upsertBar(pnlBarChart, "pnlBarChart", barLabels, barData);
  }

  let loadSeq = 0;

  function applyStrategyCopy(book) {
    const buy = document.getElementById("strategyBuy");
    const sell = document.getElementById("strategySell");
    if (buy) buy.textContent = book.buy;
    if (sell) sell.textContent = book.sell;
  }

  function applyBookLabels(book) {
    document.querySelectorAll(".thPair").forEach((th) => (th.textContent = book.stock ? "Ticker" : "Pair"));
    $("thTp").textContent = book.stock ? "TP" : "TP (2R)";
    $("thRisk").textContent = `Risk ${unit}`;
    const thu = $("thUnreal");
    if (thu) thu.textContent = `未實現 ${unit}`;
    const thr = $("thClosedRisk");
    if (thr) thr.textContent = `Risk ${unit}`;
    $("cumPnlUnit").textContent = `淨利 ${unit}`;
    $("barUnit").textContent = book.stock ? "bar = net_pnl" : "bar = net_pnl_usdt";
  }

  let fetchAbort = null;
  async function loadJournal() {
    showErr("");
    const seq = ++loadSeq;
    if (fetchAbort) fetchAbort.abort();
    fetchAbort = typeof AbortController !== "undefined" ? new AbortController() : null;
    const selected = ($("strategySelect") && $("strategySelect").value) || "kickstart-v1.1";
    const book = BOOKS[selected] || BOOKS["kickstart-v1.1"];
    applyStrategyCopy(book);
    $("metaLine").textContent = `載入中… · Asia/Hong_Kong`;
    $("kpiEquity").textContent = "—";
    $("kpiPnl").textContent = "—";
    $("kpiOpen").textContent = "—";
    $("kpiClosed").textContent = "—";
    $("kpiRet").textContent = "—";
    try {
      const res = await fetch(`${journalUrl(book.file)}?t=${Date.now()}`, {
        cache: "no-store",
        signal: fetchAbort ? fetchAbort.signal : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} loading ${book.file}`);
      const j = await res.json();
      if (seq !== loadSeq) return;
      unit = j.currency || book.currency || "USDT";
      applyBookLabels(book);
      const closed = sortClosed(j.closed_trades || []);
      const open = j.open_positions || [];

      $("statusBadge").textContent = "Simulation";
      const updated = String(j.last_updated || "—").replace(/\s+(?:HKT|UTC|GMT)$/, "");
      $("metaLine").textContent = `更新 ${updated} · Asia/Hong_Kong`;

      renderKpis(j, closed);
      renderOpen(open);
      renderClosed(closed);
      renderCharts(j, closed);
    } catch (e) {
      if (e && (e.name === "AbortError" || seq !== loadSeq)) return;
      console.error(e);
      showErr(
        `無法載入 ${book.file}：${e.message}。請喺專案根目錄用 python3 -m http.server 8765 開啟本頁（唔好直接用 file://）。`
      );
    }
  }

  function setAuto(on) {
    autoOn = on;
    $("btnAuto").textContent = `Auto: ${on ? "On" : "Off"}`;
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    if (on) autoTimer = setInterval(loadJournal, REFRESH_MS);
  }

  document.addEventListener("DOMContentLoaded", () => {
    chartDefaults();
    $("btnRefresh").addEventListener("click", () => loadJournal());
    $("btnAuto").addEventListener("click", () => setAuto(!autoOn));
    const sel = $("strategySelect");
    const mkt = $("marketSelect");
    const allOpts = sel ? Array.from(sel.options).map((o) => o.cloneNode(true)) : [];
    function filterStrategies() {
      if (!sel || !mkt) return;
      const m = mkt.value;
      sel.innerHTML = "";
      allOpts.filter((o) => o.dataset.market === m).forEach((o) => sel.appendChild(o.cloneNode(true)));
      sel.selectedIndex = 0;
    }
    if (mkt) {
      mkt.addEventListener("change", () => { filterStrategies(); loadJournal(); });
      filterStrategies();
    }
    if (sel) {
      sel.addEventListener("change", () => loadJournal());
    }
    loadJournal();
  });
})();
