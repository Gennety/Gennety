"use client";

import { useCallback, useEffect, useState } from "react";

type Stats = {
  config: { enabled: boolean; maxAgents: number; dailyBudgetUsd: number; model: string };
  agents: { total: number; active: number };
  matches: Record<string, number>;
  today: {
    events: number;
    errors: number;
    costUsd: number;
    tokensUsed: number;
    llmCalls: number;
    agentsPaused: number;
  };
  lastTickAt: string | null;
};

type LogRow = {
  id: string;
  createdAt: string;
  demoAgentId: string;
  event: string;
  mcpTool: string | null;
  targetId: string | null;
  targetType: string | null;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number | null;
  tokensInput: number | null;
  tokensOutput: number | null;
  costUsd: number | null;
};

export default function DemoAdminPage() {
  const [secret, setSecret] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("demo_admin_secret") : null;
    if (saved) setSecret(saved);
  }, []);

  const headers = useCallback(
    () => ({ Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }),
    [secret]
  );

  const load = useCallback(async () => {
    if (!secret) return;
    setBusy(true);
    setMessage(null);
    try {
      const [s, l] = await Promise.all([
        fetch("/api/admin/demo/stats", { headers: headers() }),
        fetch(`/api/admin/demo/logs?limit=100${onlyErrors ? "&onlyErrors=1" : ""}`, { headers: headers() }),
      ]);
      if (!s.ok) throw new Error(`stats: ${s.status}`);
      if (!l.ok) throw new Error(`logs: ${l.status}`);
      setStats(await s.json());
      const logsJson = (await l.json()) as { logs: LogRow[] };
      setLogs(logsJson.logs);
      sessionStorage.setItem("demo_admin_secret", secret);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [secret, headers, onlyErrors]);

  useEffect(() => {
    if (!secret) return;
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [secret, load]);

  const pause = async (demoAgentId: string, paused: boolean) => {
    const res = await fetch("/api/admin/demo/pause", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ demoAgentId, paused, reason: "admin toggle" }),
    });
    setMessage(res.ok ? `${paused ? "Paused" : "Unpaused"} ${demoAgentId}` : `Failed: ${res.status}`);
    await load();
  };

  const purge = async (apply: boolean) => {
    if (apply && !confirm("Really delete ALL demo data?")) return;
    const res = await fetch(`/api/admin/demo/purge${apply ? "?apply=1" : ""}`, {
      method: "POST",
      headers: headers(),
    });
    const j = await res.json();
    setMessage(res.ok ? JSON.stringify(j) : `Failed: ${res.status}`);
    if (apply) await load();
  };

  if (!secret) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", fontFamily: "system-ui", padding: 24 }}>
        <h1>Demo admin</h1>
        <p>Paste the DEMO_ADMIN_SECRET to access this panel.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const input = (e.currentTarget.elements.namedItem("s") as HTMLInputElement).value.trim();
            setSecret(input);
          }}
        >
          <input name="s" type="password" autoComplete="off" style={{ width: "100%", padding: 8, fontSize: 14 }} />
          <button type="submit" style={{ marginTop: 8, padding: "8px 16px" }}>
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "24px auto", fontFamily: "system-ui", padding: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Demo admin</h1>
        <div>
          <button onClick={load} disabled={busy} style={{ marginRight: 8 }}>
            Refresh
          </button>
          <button onClick={() => purge(false)} style={{ marginRight: 8 }}>
            Purge (dry-run)
          </button>
          <button onClick={() => purge(true)} style={{ background: "#b00020", color: "white" }}>
            Purge (apply)
          </button>
          <button
            onClick={() => {
              sessionStorage.removeItem("demo_admin_secret");
              setSecret("");
            }}
            style={{ marginLeft: 8 }}
          >
            Lock
          </button>
        </div>
      </header>

      {message && (
        <pre
          style={{
            background: "#fff3cd",
            padding: 10,
            border: "1px solid #ffeeba",
            marginTop: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </pre>
      )}

      {stats && (
        <section
          style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 16 }}
        >
          <Card
            title="Status"
            lines={[
              `Enabled: ${stats.config.enabled ? "yes" : "no"}`,
              `Model: ${stats.config.model}`,
              `Cap: ${stats.agents.total} / ${stats.config.maxAgents}`,
              `Active: ${stats.agents.active}`,
            ]}
          />
          <Card
            title="Matches"
            lines={Object.entries(stats.matches).map(([k, v]) => `${k}: ${v}`)}
          />
          <Card
            title="Today"
            lines={[
              `Events: ${stats.today.events}`,
              `Errors: ${stats.today.errors}`,
              `LLM calls: ${stats.today.llmCalls}`,
              `Tokens: ${stats.today.tokensUsed}`,
              `Spend: $${stats.today.costUsd.toFixed(4)} / $${stats.config.dailyBudgetUsd}`,
              `Paused agents: ${stats.today.agentsPaused}`,
            ]}
          />
          <Card
            title="Last tick"
            lines={[stats.lastTickAt ? new Date(stats.lastTickAt).toLocaleString() : "never"]}
          />
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0 }}>Recent events</h2>
          <label>
            <input
              type="checkbox"
              checked={onlyErrors}
              onChange={(e) => setOnlyErrors(e.target.checked)}
            />{" "}
            only errors
          </label>
        </div>
        <div style={{ overflowX: "auto", marginTop: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f0f0f0" }}>
                <th style={th}>When</th>
                <th style={th}>Agent</th>
                <th style={th}>Event</th>
                <th style={th}>Tool</th>
                <th style={th}>OK</th>
                <th style={th}>ms</th>
                <th style={th}>tok in/out</th>
                <th style={th}>$</th>
                <th style={th}>Error</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={td}>{new Date(l.createdAt).toLocaleTimeString()}</td>
                  <td style={td}>
                    <code>{l.demoAgentId.slice(0, 10)}…</code>
                  </td>
                  <td style={td}>{l.event}</td>
                  <td style={td}>{l.mcpTool ?? ""}</td>
                  <td style={{ ...td, color: l.success ? "#0a7d00" : "#b00020" }}>
                    {l.success ? "✓" : "✗"}
                  </td>
                  <td style={td}>{l.latencyMs ?? ""}</td>
                  <td style={td}>
                    {l.tokensInput ?? 0}/{l.tokensOutput ?? 0}
                  </td>
                  <td style={td}>{l.costUsd ? l.costUsd.toFixed(5) : ""}</td>
                  <td style={{ ...td, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {l.errorMessage ?? ""}
                  </td>
                  <td style={td}>
                    <button onClick={() => pause(l.demoAgentId, true)}>pause</button>
                    <button onClick={() => pause(l.demoAgentId, false)}>resume</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontWeight: 600 };
const td: React.CSSProperties = { padding: "4px 8px", verticalAlign: "top" };

function Card({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 14 }}>{title}</h3>
      {lines.map((l, i) => (
        <div key={i} style={{ fontSize: 13 }}>
          {l}
        </div>
      ))}
    </div>
  );
}
