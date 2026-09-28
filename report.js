// Meldformulier voor fouten in de data ("Report an error").
// Laden met <script type="module" src="report.js"></script>.
// - Elk element met data-report opent het formulier (bijv. de link in de footer).
//   Optioneel: data-report-club, data-report-season, data-report-coach vullen het formulier voor.
// - Vanuit app.js: window.reportError({ club, season, coach }) opent het formulier voor één seizoen.
// Meldingen gaan naar de Firestore-collectie 'meldingen' en zijn te lezen in het dashboard (Meldingen).
// Daarvoor moet de Firestore-regel voor 'meldingen' anoniem aanmaken toestaan (zie docs/MELDINGEN.md).

const ENDPOINT = "https://firestore.googleapis.com/v1/projects/voetbaltrainers/databases/(default)/documents/meldingen?key=AIzaSyDZckphHLQiTK2KZHPOyPDxgB6glBr4HpY";

const css = `
.rp-back { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; padding: 16px; }
.rp-box { width: 100%; max-width: 480px; max-height: calc(100vh - 32px); overflow-y: auto; background: var(--popover, #18221f); color: var(--text, #eef3ef); border: 1px solid var(--border, rgba(255,255,255,.07)); border-radius: 14px; padding: 22px; font-family: Inter, system-ui, sans-serif; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.rp-box h2 { margin: 0 0 4px; font-family: 'Bricolage Grotesque', Inter, sans-serif; font-size: 1.35rem; }
.rp-box p.rp-sub { margin: 0 0 16px; color: var(--secondary, #a9b6ae); font-size: .9rem; line-height: 1.4; }
.rp-box label { display: block; font-size: .8rem; color: var(--secondary, #a9b6ae); margin: 12px 0 4px; }
.rp-box input, .rp-box textarea, .rp-box select { width: 100%; box-sizing: border-box; background: var(--inset, #0d1513); color: inherit; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 9px 10px; font: inherit; font-size: .92rem; }
.rp-box textarea { min-height: 96px; resize: vertical; }
.rp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rp-row > div { min-width: 0; }
.rp-hp { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; }
.rp-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
.rp-actions button { border: 0; border-radius: 999px; padding: 9px 18px; font-weight: 600; cursor: pointer; }
.rp-cancel { background: transparent; color: var(--secondary, #a9b6ae); }
.rp-send { background: var(--accent, #66ff66); color: #0b1210; }
.rp-send[disabled] { opacity: .5; cursor: default; }
.rp-msg { margin-top: 12px; font-size: .88rem; }
.rp-msg.err { color: #ff8095; }
@media (max-width: 480px) { .rp-row { grid-template-columns: 1fr; } }
`;

let styled = false;
function ensureStyle() {
    if (styled) return;
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
    styled = true;
}

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function openReport(ctx = {}) {
    ensureStyle();
    const back = document.createElement("div");
    back.className = "rp-back";
    back.innerHTML = `
      <form class="rp-box" role="dialog" aria-modal="true" aria-labelledby="rp-title">
        <h2 id="rp-title">Report an error</h2>
        <p class="rp-sub">Wrong manager, missing trophy, wrong photo? Tell me what is wrong and, if you can, where you found the right information.</p>
        <label for="rp-kind">What is it about?</label>
        <select id="rp-kind">
          <option value="data">A season: manager or trophies</option>
          <option value="foto">A photo</option>
          <option value="overig">Something else</option>
        </select>
        <div class="rp-row">
          <div><label for="rp-club">Club</label><input id="rp-club" maxlength="80" value="${esc(ctx.club)}"></div>
          <div><label for="rp-season">Season</label><input id="rp-season" maxlength="20" placeholder="e.g. 1985/86" value="${esc(ctx.season)}"></div>
        </div>
        <label for="rp-coach">Manager</label>
        <input id="rp-coach" maxlength="80" value="${esc(ctx.coach)}">
        <label for="rp-text">What is wrong?</label>
        <textarea id="rp-text" maxlength="2000" required></textarea>
        <label for="rp-src">Source (link), optional</label>
        <input id="rp-src" type="url" maxlength="500" placeholder="https://">
        <label for="rp-mail">Your email, optional (only if you want an answer)</label>
        <input id="rp-mail" type="email" maxlength="200">
        <div class="rp-hp" aria-hidden="true"><label>Leave empty <input id="rp-hp" tabindex="-1" autocomplete="off"></label></div>
        <div class="rp-msg" id="rp-msg" role="status"></div>
        <div class="rp-actions">
          <button type="button" class="rp-cancel">Cancel</button>
          <button type="submit" class="rp-send">Send</button>
        </div>
      </form>`;
    if (ctx.kind) back.querySelector("#rp-kind").value = ctx.kind;
    document.body.appendChild(back);
    const form = back.querySelector("form");
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    back.addEventListener("click", e => { if (e.target === back) close(); });
    back.querySelector(".rp-cancel").addEventListener("click", close);
    back.querySelector("#rp-text").focus();

    form.addEventListener("submit", async e => {
        e.preventDefault();
        const v = id => back.querySelector(id).value.trim();
        const msg = back.querySelector("#rp-msg");
        if (v("#rp-hp")) { close(); return; }
        if (!v("#rp-text")) { msg.className = "rp-msg err"; msg.textContent = "Please describe what is wrong."; return; }
        const send = back.querySelector(".rp-send");
        send.disabled = true;
        msg.className = "rp-msg"; msg.textContent = "Sending…";
        const str = s => ({ stringValue: s });
        const body = { fields: {
            soort: str(v("#rp-kind")), club: str(v("#rp-club")), seizoen: str(v("#rp-season")), coach: str(v("#rp-coach")),
            bericht: str(v("#rp-text")), bron: str(v("#rp-src")), contact: str(v("#rp-mail")),
            pagina: str(location.pathname + location.hash), status: str("nieuw"),
            aangemaakt: { timestampValue: new Date().toISOString() },
        } };
        try {
            const r = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            if (!r.ok) throw new Error(String(r.status));
            form.innerHTML = `<h2>Thank you</h2><p class="rp-sub">Your report has been received. I check every report against the sources.</p><div class="rp-actions"><button type="button" class="rp-send">Close</button></div>`;
            form.querySelector("button").addEventListener("click", close);
        } catch {
            send.disabled = false;
            msg.className = "rp-msg err";
            msg.innerHTML = `Sending failed. You can also <a href="https://github.com/jasperkoningnl/voetbaltrainers/issues/new" target="_blank" rel="noopener">open an issue on GitHub</a>.`;
        }
    });
}

window.reportError = openReport;
document.addEventListener("click", e => {
    const a = e.target.closest("[data-report]");
    if (!a) return;
    e.preventDefault();
    openReport({ club: a.dataset.reportClub, season: a.dataset.reportSeason, coach: a.dataset.reportCoach, kind: a.dataset.reportKind });
});
