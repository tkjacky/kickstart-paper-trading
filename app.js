/* Kickstart paper-trading dashboard — reads ../journal.json via local HTTP */
(() => {
  const JOURNAL_URL = "./journal.json";
  const REFRESH_MS = 30000;

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

  function sizeOf(pos) {
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
              label: (c) => `${opts.label}: ${fmtNum(c.parsed.y)} USDT`,
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
              label: (c) => `Net PnL: ${fmtNum(c.parsed.y)} USDT`,
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
    const realized = closed.reduce((s, t) => s + (t.net_pnl_usdt || 0), 0);
    const ret = start ? ((eq - start) / start) * 100 : 0;
    const wins = closed.filter((t) => (t.net_pnl_usdt || 0) > 0).length;
    const wr = closed.length ? (wins / closed.length) * 100 : null;

    $("kpiEquity").textContent = `${fmtNum(eq)} ${j.currency || "USDT"}`;
    if (j.equity_current != null) {
      $("kpiEquityHint").textContent = `起始 ${fmtNum(start)}｜含未實現 marked-to-market（會計 ${fmtNum(j.equity)}）`;
    } else {
      $("kpiEquityHint").textContent = `起始 ${fmtNum(start)} ${j.currency || "USDT"}`;
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
        <td>${esc(p.opened_at || p.opened_at_iso)}</td>
        <td>${fmtPrice(p.entry_price)}</td>
        <td>${fmtPrice(p.stop_price)}</td>
        <td>${fmtPrice(p.take_profit_price)}</td>
        <td>${sizeOf(p)}</td>
        <td>${fmtNum(p.notional_usdt)}</td>
        <td>${fmtNum(p.risk_usdt)}</td>`;
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
      const net = t.net_pnl_usdt;
      tr.innerHTML = `
        <td>${esc(t.pair)}</td>
        <td>${esc(t.opened_at || "")}</td>
        <td>${esc(t.closed_at || "")}</td>
        <td>${fmtPrice(t.entry_price)}</td>
        <td>${fmtPrice(t.exit_price)}</td>
        <td>${esc(t.exit_reason || "")}</td>
        <td class="${pnlClass(t.gross_pnl_usdt)}">${fmtNum(t.gross_pnl_usdt)}</td>
        <td>${fmtNum(t.fees_usdt)}</td>
        <td class="${pnlClass(net)}">${fmtNum(net)}</td>
        <td class="${pnlClass(t.r_multiple)}">${fmtNum(t.r_multiple, 2)}R</td>
        <td>${fmtNum(t.equity_after)}</td>`;
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
      run += t.net_pnl_usdt || 0;
      cumLabels.push(shortLabel(t.closed_at || t.closed_at_iso, t.pair));
      cumData.push(run);
    }
    cumPnlChart = upsertLine(cumPnlChart, "cumPnlChart", cumLabels, cumData, {
      label: "Cumulative PnL",
      color: run >= 0 ? "#2dd4a8" : "#f07178",
    });

    const barLabels = closed.map((t) => shortLabel(t.closed_at || t.closed_at_iso, t.pair));
    const barData = closed.map((t) => t.net_pnl_usdt || 0);
    pnlBarChart = upsertBar(pnlBarChart, "pnlBarChart", barLabels, barData);
  }

  async function loadJournal() {
    showErr("");
    try {
      const res = await fetch(`${JOURNAL_URL}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} loading journal.json`);
      const j = await res.json();
      const closed = sortClosed(j.closed_trades || []);
      const open = j.open_positions || [];

      $("statusBadge").textContent = "Simulation";
      const updated = String(j.last_updated || "—").replace(/\s+(?:HKT|UTC|GMT)$/, "");
      $("metaLine").textContent = `更新 ${updated} HKT`;

      renderKpis(j, closed);
      renderOpen(open);
      renderClosed(closed);
      renderCharts(j, closed);
    } catch (e) {
      console.error(e);
      showErr(
        `無法載入 journal.json：${e.message}。請喺專案根目錄用 python3 -m http.server 8765 開啟本頁（唔好直接用 file://）。`
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
    loadJournal();
  });
})();
