'use strict';

/**
 * Pure aggregation functions over persisted usage events
 * ({ type, name, timestamp, sessionId, projectPath, durationMs?, agentId? }).
 * No I/O, no Node APIs — loadable both via require() (main process, tests)
 * and via <script> in the settings renderer (window.usageAnalytics).
 */
(function () {
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DEFAULT_DORMANT_DAYS = 30;

  // Local Monday 00:00 of the week containing ts.
  function weekStartOf(ts) {
    const d = new Date(ts);
    const daysSinceMonday = (d.getDay() + 6) % 7;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysSinceMonday).getTime();
  }

  function summarizeByName(events, { type } = {}) {
    const byName = new Map();
    for (const e of events) {
      if (type && e.type !== type) continue;
      let s = byName.get(e.name);
      if (!s) {
        s = {
          name: e.name,
          type: e.type,
          count: 0,
          firstUsed: e.timestamp,
          lastUsed: e.timestamp,
          projects: new Set(),
          sessions: new Set(),
        };
        byName.set(e.name, s);
      }
      s.count += 1;
      if (e.timestamp < s.firstUsed) s.firstUsed = e.timestamp;
      if (e.timestamp > s.lastUsed) s.lastUsed = e.timestamp;
      if (e.projectPath) s.projects.add(e.projectPath);
      if (e.sessionId) s.sessions.add(e.sessionId);
    }
    return [...byName.values()]
      .map((s) => ({
        name: s.name,
        type: s.type,
        count: s.count,
        firstUsed: s.firstUsed,
        lastUsed: s.lastUsed,
        projects: [...s.projects].sort(),
        sessionCount: s.sessions.size,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  function topN(events, { type, n = 5 } = {}) {
    return summarizeByName(events, { type }).slice(0, n);
  }

  function weeklyTrend(events, { weeks = 12, now = Date.now(), name } = {}) {
    const currentWeek = weekStartOf(now);
    const buckets = [];
    const index = new Map();
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = currentWeek - i * WEEK_MS;
      index.set(weekStartOf(weekStart), buckets.length);
      buckets.push({ weekStart, count: 0 });
    }
    for (const e of events) {
      if (name && e.name !== name) continue;
      const i = index.get(weekStartOf(e.timestamp));
      if (i !== undefined) buckets[i].count += 1;
    }
    return buckets;
  }

  function dormant(events, { thresholdDays = DEFAULT_DORMANT_DAYS, now = Date.now() } = {}) {
    return summarizeByName(events)
      .filter((s) => now - s.lastUsed > thresholdDays * DAY_MS)
      .map((s) => ({
        name: s.name,
        type: s.type,
        lastUsed: s.lastUsed,
        daysSince: Math.floor((now - s.lastUsed) / DAY_MS),
      }))
      .sort((a, b) => b.daysSince - a.daysSince || a.name.localeCompare(b.name));
  }

  function groupBySession(events) {
    const sessions = new Map();
    for (const e of events) {
      if (!e.sessionId) continue;
      let list = sessions.get(e.sessionId);
      if (!list) {
        list = [];
        sessions.set(e.sessionId, list);
      }
      list.push(e);
    }
    return sessions;
  }

  // Unordered distinct-name pairs, counted once per session they co-occur in.
  function coOccurrence(events, { minSessions = 2 } = {}) {
    const pairCounts = new Map();
    for (const list of groupBySession(events).values()) {
      const names = [...new Set(list.map((e) => e.name))].sort();
      for (let i = 0; i < names.length; i++) {
        for (let j = i + 1; j < names.length; j++) {
          const key = `${names[i]}\u0000${names[j]}`;
          pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
        }
      }
    }
    return [...pairCounts.entries()]
      .filter(([, sessions]) => sessions >= minSessions)
      .map(([key, sessions]) => {
        const [a, b] = key.split('\u0000');
        return { a, b, sessions };
      })
      .sort((x, y) => y.sessions - x.sessions || x.a.localeCompare(y.a));
  }

  // Consecutive same-session transitions A→B (A≠B), timestamp order.
  // Only tracked events are visible, so "consecutive" means consecutive
  // *tracked* invocations — untracked tools in between are invisible.
  function sequences(events, { minCount = 2 } = {}) {
    const transitionCounts = new Map();
    for (const list of groupBySession(events).values()) {
      const ordered = [...list].sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 1; i < ordered.length; i++) {
        const from = ordered[i - 1].name;
        const to = ordered[i].name;
        if (from === to) continue;
        const key = `${from}\u0000${to}`;
        transitionCounts.set(key, (transitionCounts.get(key) || 0) + 1);
      }
    }
    return [...transitionCounts.entries()]
      .filter(([, count]) => count >= minCount)
      .map(([key, count]) => {
        const [from, to] = key.split('\u0000');
        return { from, to, count };
      })
      .sort((x, y) => y.count - x.count || x.from.localeCompare(y.from));
  }

  function durationStats(events) {
    const byName = new Map();
    for (const e of events) {
      if (typeof e.durationMs !== 'number' || !isFinite(e.durationMs)) continue;
      let s = byName.get(e.name);
      if (!s) {
        s = { name: e.name, count: 0, totalMs: 0, maxMs: 0 };
        byName.set(e.name, s);
      }
      s.count += 1;
      s.totalMs += e.durationMs;
      if (e.durationMs > s.maxMs) s.maxMs = e.durationMs;
    }
    return [...byName.values()]
      .map((s) => ({
        name: s.name,
        count: s.count,
        avgMs: Math.round(s.totalMs / s.count),
        maxMs: s.maxMs,
      }))
      .sort((a, b) => b.avgMs - a.avgMs || a.name.localeCompare(b.name));
  }

  function perProject(events, { topNames = 3 } = {}) {
    const byProject = new Map();
    for (const e of events) {
      const key = e.projectPath || '(unknown)';
      let p = byProject.get(key);
      if (!p) {
        p = { projectPath: key, count: 0, events: [] };
        byProject.set(key, p);
      }
      p.count += 1;
      p.events.push(e);
    }
    return [...byProject.values()]
      .map((p) => ({
        projectPath: p.projectPath,
        count: p.count,
        topNames: topN(p.events, { n: topNames }).map((s) => s.name),
      }))
      .sort((a, b) => b.count - a.count || a.projectPath.localeCompare(b.projectPath));
  }

  function buildReport(events, { now = Date.now(), dormantDays = DEFAULT_DORMANT_DAYS } = {}) {
    const sessions = new Set();
    const projects = new Set();
    let firstEvent = null;
    let lastEvent = null;
    for (const e of events) {
      if (e.sessionId) sessions.add(e.sessionId);
      if (e.projectPath) projects.add(e.projectPath);
      if (firstEvent === null || e.timestamp < firstEvent) firstEvent = e.timestamp;
      if (lastEvent === null || e.timestamp > lastEvent) lastEvent = e.timestamp;
    }
    return {
      generatedAt: now,
      totals: {
        events: events.length,
        skills: events.filter((e) => e.type === 'skill').length,
        mcpTools: events.filter((e) => e.type === 'mcp_tool').length,
        sessions: sessions.size,
        projects: projects.size,
        firstEvent,
        lastEvent,
      },
      topSkills: topN(events, { type: 'skill', n: 10 }),
      topMcp: topN(events, { type: 'mcp_tool', n: 10 }),
      dormant: dormant(events, { thresholdDays: dormantDays, now }),
      dormantDays,
      coUsed: coOccurrence(events),
      sequences: sequences(events),
      perProject: perProject(events),
      weekly: weeklyTrend(events, { now }),
      durations: durationStats(events),
    };
  }

  function formatMs(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const min = Math.floor(ms / 60000);
    const sec = Math.round((ms % 60000) / 1000);
    return `${min}m ${sec}s`;
  }

  function formatDate(ts) {
    if (ts == null) return 'n/a';
    const d = new Date(ts);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function projectLabel(projectPath) {
    if (!projectPath || projectPath === '(unknown)') return '(unknown)';
    const parts = projectPath.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || projectPath;
  }

  function renderMarkdownReport(report) {
    const t = report.totals;
    const lines = [];
    lines.push('# Code Pet — Skill Usage Report');
    lines.push('');
    lines.push(`Generated: ${formatDate(report.generatedAt)}`);
    lines.push(
      `Events: ${t.events} (${t.skills} skill, ${t.mcpTools} MCP) across ` +
        `${t.sessions} sessions and ${t.projects} projects` +
        (t.firstEvent != null ? `, from ${formatDate(t.firstEvent)} to ${formatDate(t.lastEvent)}` : '')
    );
    lines.push('');

    lines.push('## Top Skills');
    lines.push('');
    if (report.topSkills.length === 0) {
      lines.push('_No skill usage recorded._');
    } else {
      lines.push('| Skill | Uses | Sessions | Last used |');
      lines.push('|---|---|---|---|');
      for (const s of report.topSkills) {
        lines.push(`| ${s.name} | ${s.count} | ${s.sessionCount} | ${formatDate(s.lastUsed)} |`);
      }
    }
    lines.push('');

    lines.push('## Top MCP Tools');
    lines.push('');
    if (report.topMcp.length === 0) {
      lines.push('_No MCP tool usage recorded._');
    } else {
      lines.push('| Tool | Uses | Sessions | Last used |');
      lines.push('|---|---|---|---|');
      for (const s of report.topMcp) {
        lines.push(`| ${s.name} | ${s.count} | ${s.sessionCount} | ${formatDate(s.lastUsed)} |`);
      }
    }
    lines.push('');

    lines.push(`## Dormant (not used in ${report.dormantDays}+ days)`);
    lines.push('');
    lines.push('Candidates to prune, update, or re-surface.');
    lines.push('');
    if (report.dormant.length === 0) {
      lines.push('_Nothing dormant — everything logged was used recently._');
    } else {
      for (const d of report.dormant) {
        lines.push(`- ${d.name} (${d.type}) — last used ${d.daysSince} days ago (${formatDate(d.lastUsed)})`);
      }
    }
    lines.push('');

    lines.push('## Often Used Together');
    lines.push('');
    lines.push('Pairs invoked in the same session — candidates for chaining or combining into one flow.');
    lines.push('');
    if (report.coUsed.length === 0) {
      lines.push('_No recurring pairs yet._');
    } else {
      for (const p of report.coUsed.slice(0, 15)) {
        lines.push(`- ${p.a} + ${p.b} — ${p.sessions} sessions`);
      }
    }
    lines.push('');

    lines.push('## Common Sequences');
    lines.push('');
    lines.push('Consecutive tracked invocations within a session (untracked tools in between are invisible).');
    lines.push('');
    if (report.sequences.length === 0) {
      lines.push('_No recurring sequences yet._');
    } else {
      for (const s of report.sequences.slice(0, 15)) {
        lines.push(`- ${s.from} → ${s.to} — ${s.count}×`);
      }
    }
    lines.push('');

    lines.push('## Per-Project Breakdown');
    lines.push('');
    if (report.perProject.length === 0) {
      lines.push('_No events._');
    } else {
      for (const p of report.perProject) {
        lines.push(`- ${projectLabel(p.projectPath)} — ${p.count} events (top: ${p.topNames.join(', ')})`);
      }
    }
    lines.push('');

    lines.push('## Slowest Skills / Tools');
    lines.push('');
    if (report.durations.length === 0) {
      lines.push('_No duration data yet — durations are recorded for new invocations once duration tracking is active._');
    } else {
      lines.push('| Name | Runs timed | Avg | Max |');
      lines.push('|---|---|---|---|');
      for (const d of report.durations) {
        lines.push(`| ${d.name} | ${d.count} | ${formatMs(d.avgMs)} | ${formatMs(d.maxMs)} |`);
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // Vertical bar with only the top corners rounded (data-end), flat at the baseline.
  function svgBarPath(x, y, w, h, baseline) {
    const r = Math.min(4, w / 2, h);
    return `M${x},${baseline} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${baseline} Z`;
  }

  function weeklySvg(weekly) {
    const W = 640;
    const H = 120;
    const PAD = 2;
    const max = Math.max(...weekly.map((b) => b.count), 1);
    const slot = W / weekly.length;
    const barW = Math.min(28, slot - 6);
    const bars = weekly.map((b, i) => {
      const h = Math.round((b.count / max) * (H - 8));
      const x = Math.round(i * slot + (slot - barW) / 2);
      const y = H - h;
      const label = `Week of ${formatDate(b.weekStart)}: ${b.count} event${b.count === 1 ? '' : 's'}`;
      if (b.count === 0) {
        return `<rect x="${x}" y="${H - 2}" width="${barW}" height="2" class="bar-empty"><title>${escapeHtml(label)}</title></rect>`;
      }
      return `<path d="${svgBarPath(x, y, barW, h, H)}" class="bar"><title>${escapeHtml(label)}</title></path>`;
    }).join('');
    const first = weekly.length ? formatDate(weekly[0].weekStart) : '';
    const last = weekly.length ? formatDate(weekly[weekly.length - 1].weekStart) : '';
    return (
      `<svg viewBox="0 0 ${W} ${H + PAD}" role="img" aria-label="Events per week">${bars}` +
      `<line x1="0" y1="${H}" x2="${W}" y2="${H}" class="baseline"/></svg>` +
      `<div class="axis-row"><span>${escapeHtml(first)}</span><span>${escapeHtml(last)}</span></div>`
    );
  }

  function barListHtml(rows) {
    // rows: [{ name, value, valueLabel, title }] — a bar-table: label | bar | value.
    const max = Math.max(...rows.map((r) => r.value), 1);
    return `<div class="bar-list">${rows.map((r) => {
      const pct = Math.max(Math.round((r.value / max) * 100), 2);
      return (
        `<div class="bar-row" title="${escapeHtml(r.title || r.name)}">` +
        `<span class="bar-label">${escapeHtml(r.name)}</span>` +
        `<span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>` +
        `<span class="bar-value">${escapeHtml(r.valueLabel)}</span></div>`
      );
    }).join('')}</div>`;
  }

  function tableHtml(headers, rows) {
    const head = `<tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>`;
    const body = rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
    return `<table>${head}${body}</table>`;
  }

  function emptyHtml(text) {
    return `<p class="empty">${escapeHtml(text)}</p>`;
  }

  function renderHtmlReport(report) {
    const t = report.totals;
    const sections = [];

    sections.push(`<section><h2>Weekly Activity</h2>${weeklySvg(report.weekly)}</section>`);

    sections.push(`<section><h2>Top Skills</h2>${
      report.topSkills.length === 0
        ? emptyHtml('No skill usage recorded.')
        : barListHtml(report.topSkills.map((s) => ({
            name: s.name,
            value: s.count,
            valueLabel: `${s.count}`,
            title: `${s.name} — ${s.count} uses in ${s.sessionCount} sessions, last used ${formatDate(s.lastUsed)}`,
          })))
    }</section>`);

    sections.push(`<section><h2>Top MCP Tools</h2>${
      report.topMcp.length === 0
        ? emptyHtml('No MCP tool usage recorded.')
        : barListHtml(report.topMcp.map((s) => ({
            name: s.name,
            value: s.count,
            valueLabel: `${s.count}`,
            title: `${s.name} — ${s.count} uses in ${s.sessionCount} sessions, last used ${formatDate(s.lastUsed)}`,
          })))
    }</section>`);

    sections.push(`<section><h2>Dormant <span class="h-note">(not used in ${report.dormantDays}+ days)</span></h2>` +
      `<p class="note">Candidates to prune, update, or re-surface.</p>${
      report.dormant.length === 0
        ? emptyHtml('Nothing dormant — everything logged was used recently.')
        : `<div class="dormant-list">${report.dormant.map((d) =>
            `<div class="dormant-row"><span>${escapeHtml(d.name)} <span class="h-note">(${escapeHtml(d.type)})</span></span>` +
            `<span class="days-badge">${d.daysSince}d ago</span></div>`
          ).join('')}</div>`
    }</section>`);

    sections.push(`<section><h2>Often Used Together</h2>` +
      `<p class="note">Pairs invoked in the same session — candidates for chaining or combining into one flow.</p>${
      report.coUsed.length === 0
        ? emptyHtml('No recurring pairs yet.')
        : tableHtml(['Pair', 'Sessions'], report.coUsed.slice(0, 15).map((p) => [`${p.a} + ${p.b}`, `${p.sessions}`]))
    }</section>`);

    sections.push(`<section><h2>Common Sequences</h2>` +
      `<p class="note">Consecutive tracked invocations within a session (untracked tools in between are invisible).</p>${
      report.sequences.length === 0
        ? emptyHtml('No recurring sequences yet.')
        : tableHtml(['From', 'To', 'Count'], report.sequences.slice(0, 15).map((s) => [s.from, s.to, `${s.count}×`]))
    }</section>`);

    sections.push(`<section><h2>Per-Project Breakdown</h2>${
      report.perProject.length === 0
        ? emptyHtml('No events.')
        : tableHtml(['Project', 'Events', 'Top usage'], report.perProject.map((p) =>
            [projectLabel(p.projectPath), `${p.count}`, p.topNames.join(', ')]))
    }</section>`);

    sections.push(`<section><h2>Slowest Skills / Tools</h2>${
      report.durations.length === 0
        ? emptyHtml('No duration data yet — durations are recorded for new invocations once duration tracking is active.')
        : barListHtml(report.durations.map((d) => ({
            name: d.name,
            value: d.avgMs,
            valueLabel: formatMs(d.avgMs),
            title: `${d.name} — avg ${formatMs(d.avgMs)} over ${d.count} timed runs (max ${formatMs(d.maxMs)})`,
          })))
    }</section>`);

    const subtitle =
      `${t.events} events (${t.skills} skill, ${t.mcpTools} MCP) · ${t.sessions} sessions · ${t.projects} projects` +
      (t.firstEvent != null ? ` · ${formatDate(t.firstEvent)} — ${formatDate(t.lastEvent)}` : '');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Code Pet — Skill Usage Report</title>
<style>
:root {
  --surface: #fcfcfb; --page: #f9f9f7;
  --ink: #0b0b0b; --ink-2: #52514e; --muted: #898781;
  --grid: #e1e0d9; --baseline: #c3c2b7; --series: #2a78d6;
  --border: rgba(11,11,11,0.10);
}
@media (prefers-color-scheme: dark) {
  :root {
    --surface: #1a1a19; --page: #0d0d0d;
    --ink: #ffffff; --ink-2: #c3c2b7; --muted: #898781;
    --grid: #2c2c2a; --baseline: #383835; --series: #3987e5;
    --border: rgba(255,255,255,0.10);
  }
}
* { box-sizing: border-box; margin: 0; }
body { background: var(--page); color: var(--ink); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 32px 16px; }
main { max-width: 720px; margin: 0 auto; }
h1 { font-size: 20px; }
.subtitle { color: var(--ink-2); font-size: 13px; margin: 4px 0 24px; }
section { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px 20px; margin-bottom: 16px; }
h2 { font-size: 14px; margin-bottom: 10px; }
.h-note { color: var(--muted); font-weight: 400; font-size: 12px; }
.note { color: var(--ink-2); font-size: 12px; margin-bottom: 10px; }
.empty { color: var(--muted); font-size: 13px; }
svg { display: block; width: 100%; height: auto; }
.bar { fill: var(--series); }
.bar-empty { fill: var(--grid); }
.baseline { stroke: var(--baseline); stroke-width: 1; }
.axis-row { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 4px; }
.bar-list { display: grid; gap: 8px; }
.bar-row { display: grid; grid-template-columns: minmax(120px, 38%) 1fr auto; gap: 10px; align-items: center; }
.bar-label { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { display: block; height: 10px; }
.bar-fill { display: block; height: 100%; background: var(--series); border-radius: 0 4px 4px 0; min-width: 2px; }
.bar-value { font-size: 12px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th { text-align: left; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; font-weight: 600; padding: 4px 8px 4px 0; }
td { padding: 5px 8px 5px 0; border-top: 1px solid var(--grid); color: var(--ink-2); }
td:first-child { color: var(--ink); }
.dormant-list { display: grid; gap: 6px; }
.dormant-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
.days-badge { color: var(--ink-2); font-size: 12px; font-variant-numeric: tabular-nums; background: var(--page); border: 1px solid var(--grid); border-radius: 10px; padding: 1px 8px; }
footer { color: var(--muted); font-size: 11px; text-align: center; margin-top: 24px; }
</style>
</head>
<body>
<main>
<h1>Code Pet — Skill Usage Report</h1>
<p class="subtitle">${escapeHtml(subtitle)}</p>
${sections.join('\n')}
<footer>Generated ${escapeHtml(formatDate(report.generatedAt))} by Code Pet · data from ~/.code-pet/usage.log · never leaves this machine</footer>
</main>
</body>
</html>
`;
  }

  const api = {
    summarizeByName,
    topN,
    weeklyTrend,
    dormant,
    coOccurrence,
    sequences,
    durationStats,
    perProject,
    buildReport,
    renderMarkdownReport,
    renderHtmlReport,
    formatMs,
    DEFAULT_DORMANT_DAYS,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof window !== 'undefined') {
    window.usageAnalytics = api;
  }
})();
