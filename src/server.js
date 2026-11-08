import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { configured } from "./paypal/client.js";
import { ensureWebhook } from "./paypal/webhooks.js";
import { receive, recentUnmatched } from "./relay.js";
import { chaiCorner, PLANTED_BUGS } from "./shop/chai.js";
import { validate } from "./runner/plan.js";
import { getRun, listRuns, startRun } from "./runner/run.js";
import { STARTER } from "./scenarios.js";
import { spike } from "./spike.js";
import { aiConfigured, compile, diagnose } from "./ai.js";

const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;
const publicUrl = (req) => process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;

app.set("trust proxy", true);
app.post("/hooks/paypal", express.text({ type: "*/*", limit: "1mb" }), receive);
app.use("/shop/buggy", chaiCorner("buggy"));
app.use("/shop/fixed", chaiCorner("fixed"));
app.use(express.static(path.join(dir, "..", "public")));
app.use(express.json({ limit: "200kb" }));

app.get("/api/health", (req, res) => res.json({
  paypal: configured(), webhook: Boolean(process.env.PAYPAL_WEBHOOK_ID), ai: aiConfigured(), unmatched: recentUnmatched(),
}));
app.get("/api/scenarios", (req, res) => res.json(STARTER));
app.get("/api/bugs", (req, res) => res.json(PLANTED_BUGS));
app.get("/api/runs", (req, res) => res.json(listRuns()));
app.get("/api/runs/:id", (req, res) => {
  const r = getRun(req.params.id);
  return r ? res.json({ id: r.id, title: r.plan.title, plan: r.plan, target: r.target.label, status: r.status, timeline: r.timeline, startedAt: r.startedAt, endedAt: r.endedAt })
    : res.status(404).json({ error: "not found" });
});

let compiling = 0;
app.post("/api/compile", async (req, res) => {
  const english = String(req.body?.english || "").trim();
  if (english.length < 8) return res.status(400).json({ error: "Describe the payment scenario in a sentence or two" });
  if (!aiConfigured()) return res.status(503).json({ error: "AI is not configured on this server" });
  if (compiling >= 3) return res.status(429).json({ error: "Busy, try again in a moment" });
  compiling += 1;
  try {
    const out = await compile(english);
    if (!out.plan) return res.status(422).json({ error: "Could not turn that into a valid plan", details: out.errors });
    res.json({ english, plan: out.plan, attempts: out.attempts });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
  finally { compiling -= 1; }
});

app.post("/api/runs/:id/diagnose", async (req, res) => {
  const r = getRun(req.params.id);
  if (!r) return res.status(404).json({ error: "not found" });
  if (!r.endedAt) return res.status(409).json({ error: "run still in progress" });
  if (!aiConfigured()) return res.status(503).json({ error: "AI is not configured on this server" });
  try { r.diagnosis = r.diagnosis || await diagnose(r); res.json(r.diagnosis); }
  catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

let active = 0;
app.post("/api/runs", (req, res) => {
  if (!configured()) return res.status(503).json({ error: "PayPal sandbox credentials are not configured on this server" });
  if (active >= 3) return res.status(429).json({ error: "Too many runs at once; try again in a minute" });
  const v = validate(req.body.plan);
  if (!v.ok) return res.status(400).json({ error: "invalid plan", details: v.errors });
  const base = publicUrl(req);
  const which = req.body.target === "fixed" ? "fixed" : "buggy";
  const shop = `${base}/shop/${which}`;
  const target = { label: `Chai Corner (${which})`, createUrl: `${shop}/api/orders`, stateUrl: (id) => `${shop}/api/orders/${id}`, webhookUrl: `${shop}/webhooks/paypal` };
  const run = startRun(v.plan, target);
  active += 1;
  const done = setInterval(() => { if (run.endedAt) { active -= 1; clearInterval(done); } }, 1000);
  res.status(202).json({ id: run.id });
});

app.listen(PORT, async () => {
  console.log(`rehearsal listening on ${PORT}`);
  if (configured() && process.env.PUBLIC_URL) {
    try {
      const w = await ensureWebhook(`${process.env.PUBLIC_URL}/hooks/paypal`);
      process.env.PAYPAL_WEBHOOK_ID = w.id;
      console.log(`webhook ${w.created ? "created" : "reused"}: ${w.id}`);
    } catch (e) { console.error("webhook setup failed:", e.message); }
  }
  if (process.env.SPIKE_ON_START === "1" && configured()) spike().then((r) => console.log("SPIKE " + JSON.stringify(r))).catch((e) => console.error("SPIKE failed", e));
});
