(function () {
  const L = window.LISTINGS || [];
  const byId = Object.fromEntries(L.map((x) => [x.id, x]));
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const STATUSES = ["Interested", "Applied", "Interview", "Offer"];
  const DAY = 86400000;

  // ---------- storage (per-browser; fails soft) ----------
  const KEY = "firstrung.saved.v1";
  function loadSaved() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function writeSaved(s) {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: keep in memory */ }
    saved = s;
    updateCount();
  }
  let saved = loadSaved();

  function toggleSave(id) {
    const s = { ...saved };
    if (s[id]) delete s[id];
    else s[id] = { status: "Interested", note: "", added: Date.now() };
    writeSaved(s);
    return !!s[id];
  }

  function updateCount() {
    const n = Object.keys(saved).filter((id) => byId[id]).length;
    document.querySelectorAll("[data-saved-count]").forEach((el) => { el.textContent = n ? n : ""; });
  }

  // ---------- helpers ----------
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function parseDate(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); }
  function daysLeft(x) { return Math.round((parseDate(x.deadline) - today()) / DAY); }
  function deadlineState(x) {
    const d = daysLeft(x);
    if (d < 0) return { cls: "closed", text: "Closed" };
    if (d === 0) return { cls: "soon", text: "Due today" };
    if (d <= 30) return { cls: "soon", text: `${d} day${d === 1 ? "" : "s"} left` };
    if (d <= 70) return { cls: "", text: `${Math.round(d / 7)} wks left` };
    return { cls: "", text: `${Math.round(d / 30)} mo left` };
  }
  function payLabel(x) {
    if (x.pay.kind === "Paid") return `$${x.pay.amount}/hr`;
    if (x.pay.kind === "Stipend") return `$${x.pay.amount.toLocaleString()} stipend`;
    return x.pay.credit ? "Unpaid · school credit" : "Unpaid";
  }
  function gradeLabel(g) {
    if (g.length === 1) return `Grade ${g[0]}`;
    return `Grades ${g[0]}–${g[g.length - 1]}`;
  }
  function calBlock(x) {
    const d = parseDate(x.deadline);
    const st = deadlineState(x);
    return `<div><div class="cal" aria-label="Deadline ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}">
      <div class="m">${MONTHS[d.getMonth()]}</div><div class="d">${d.getDate()}</div><div class="y">${d.getFullYear()}</div></div>
      <div class="cal-cap ${st.cls}">${st.text}</div></div>`;
  }
  const BOOKMARK = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg>`;

  function listingCard(x) {
    const st = deadlineState(x);
    const isSaved = !!saved[x.id];
    return `<article class="listing ${st.cls === "closed" ? "is-closed" : ""}">
      ${calBlock(x)}
      <div style="min-width:0">
        <h3><a href="listing.html?id=${encodeURIComponent(x.id)}">${esc(x.title)}</a></h3>
        <div class="org">${esc(x.org)} · ${esc(x.location)}</div>
        <p>${esc(x.summary)}</p>
        <div class="chips">
          <span class="chip ${x.pay.kind === "Unpaid" ? "unpaid" : "pay"}">${payLabel(x)}</span>
          <span class="chip">${esc(x.field)}</span>
          <span class="chip">${esc(x.mode)}</span>
          <span class="chip">${gradeLabel(x.grades)}</span>
          <span class="chip">${x.hours} hrs/wk · ${x.weeks} wks</span>
        </div>
      </div>
      <button class="save" type="button" data-save="${esc(x.id)}" aria-pressed="${isSaved}" aria-label="${isSaved ? "Remove from" : "Save to"} my list: ${esc(x.title)}" title="${isSaved ? "Saved" : "Save"}">${BOOKMARK}</button>
    </article>`;
  }

  function bindSaveButtons(root) {
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-save]");
      if (!b) return;
      const on = toggleSave(b.dataset.save);
      b.setAttribute("aria-pressed", on);
      b.title = on ? "Saved" : "Save";
      if (b.dataset.label !== undefined) b.querySelector("span").textContent = on ? "Saved to my list" : "Save to my list";
    });
  }

  // ---------- browse page ----------
  function initBrowse() {
    const form = document.getElementById("filters");
    const list = document.getElementById("list");
    const q = document.getElementById("q");
    const sort = document.getElementById("sort");
    const countEl = document.getElementById("result-count");

    // build field checkboxes from the data
    const fields = [...new Set(L.map((x) => x.field))].sort();
    document.getElementById("field-opts").innerHTML = fields
      .map((f) => `<label><input type="checkbox" name="field" value="${esc(f)}"> ${esc(f)}</label>`).join("");

    const open = L.filter((x) => daysLeft(x) >= 0);
    document.getElementById("stat-open").textContent = open.length;
    document.getElementById("stat-paid").textContent = open.filter((x) => x.pay.kind !== "Unpaid").length;
    document.getElementById("stat-soon").textContent = open.filter((x) => daysLeft(x) <= 30).length;

    function render() {
      const fd = new FormData(form);
      const term = q.value.trim().toLowerCase();
      const fieldSel = fd.getAll("field");
      const modeSel = fd.getAll("mode");
      const grade = Number(fd.get("grade")) || 0;
      const season = fd.get("season");
      const paidOnly = fd.get("paid") === "on";
      const hideClosed = fd.get("hideClosed") === "on";

      let rows = L.filter((x) => {
        if (term) {
          const hay = [x.title, x.org, x.field, x.location, x.summary, ...x.skills].join(" ").toLowerCase();
          if (!term.split(/\s+/).every((t) => hay.includes(t))) return false;
        }
        if (fieldSel.length && !fieldSel.includes(x.field)) return false;
        if (modeSel.length && !modeSel.includes(x.mode)) return false;
        if (grade && !x.grades.includes(grade)) return false;
        if (season && season !== "any" && x.season !== season) return false;
        if (paidOnly && x.pay.kind === "Unpaid") return false;
        if (hideClosed && daysLeft(x) < 0) return false;
        return true;
      });

      const s = sort.value;
      rows.sort((a, b) => {
        if (s === "pay") return hourly(b) - hourly(a);
        if (s === "hours") return a.hours - b.hours;
        // deadline: open soonest first, closed last
        const da = daysLeft(a), db = daysLeft(b);
        if ((da < 0) !== (db < 0)) return da < 0 ? 1 : -1;
        return da - db;
      });

      countEl.textContent = `${rows.length} internship${rows.length === 1 ? "" : "s"}`;
      list.innerHTML = rows.length
        ? rows.map(listingCard).join("")
        : `<div class="empty"><h3>Nothing matches yet</h3><p>Try removing a filter or searching a broader word like “lab” or “paid”.</p><button class="btn ghost" type="button" id="reset2">Clear filters</button></div>`;
      const r2 = document.getElementById("reset2");
      if (r2) r2.addEventListener("click", reset);
    }
    function hourly(x) {
      if (x.pay.kind === "Paid") return x.pay.amount;
      if (x.pay.kind === "Stipend") return x.pay.amount / (x.hours * x.weeks);
      return 0;
    }
    function reset() { form.reset(); q.value = ""; render(); }

    form.addEventListener("input", render);
    form.addEventListener("change", render);
    q.addEventListener("input", render);
    sort.addEventListener("change", render);
    document.getElementById("search-form").addEventListener("submit", (e) => {
      e.preventDefault();
      document.getElementById("results").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.getElementById("clear").addEventListener("click", reset);

    const tog = document.getElementById("toggle-filters");
    tog.addEventListener("click", () => {
      const collapsed = form.dataset.collapsed === "true";
      form.dataset.collapsed = String(!collapsed);
      tog.setAttribute("aria-expanded", String(collapsed));
      tog.textContent = collapsed ? "Hide filters" : "Show filters";
    });

    bindSaveButtons(list);
    render();
  }

  // ---------- detail page ----------
  function initDetail() {
    const id = new URLSearchParams(location.search).get("id");
    const x = byId[id];
    const root = document.getElementById("detail");
    if (!x) {
      root.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>We couldn’t find that internship</h3><p>It may have been removed. <a href="index.html">Browse all internships</a>.</p></div>`;
      return;
    }
    document.title = `${x.title} · First Rung`;
    const st = deadlineState(x);
    const d = parseDate(x.deadline);
    const isSaved = !!saved[x.id];
    const ckKey = `firstrung.check.${x.id}`;
    let checks = {};
    try { checks = JSON.parse(localStorage.getItem(ckKey)) || {}; } catch { /* ignore */ }

    root.innerHTML = `
      <div style="min-width:0">
        <h1>${esc(x.title)}</h1>
        <div class="org">${esc(x.org)} · ${esc(x.location)}</div>
        <div class="chips">
          <span class="chip ${x.pay.kind === "Unpaid" ? "unpaid" : "pay"}">${payLabel(x)}</span>
          <span class="chip">${esc(x.field)}</span><span class="chip">${esc(x.mode)}</span><span class="chip">${esc(x.season)}</span>
        </div>
        <p class="lede">${esc(x.summary)}</p>

        <div class="section">
          <h2>What you’ll practice</h2>
          <div class="chips">${x.skills.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div>
        </div>

        <div class="section">
          <h2>Your application checklist</h2>
          <p style="margin:0 0 12px;color:var(--ink-2);font-size:.95rem">Tick items off as you gather them. Your progress stays in this browser.</p>
          <ul class="checklist">
            ${[...x.requires, "Resume (one page)", "Parent or guardian contact info"].map((r, i) => `
              <li><input type="checkbox" id="ck-${i}" data-ck="${i}" ${checks[i] ? "checked" : ""}><label for="ck-${i}">${esc(r)}</label></li>`).join("")}
          </ul>
        </div>

        <div class="section">
          <h2>Before you apply</h2>
          <p style="margin:0">Read the <a href="guide.html">application guide</a> for a resume template that works with no job history and a cold-email script for asking questions.</p>
        </div>
      </div>

      <aside class="side">
        <div style="display:flex;gap:14px;align-items:center">
          ${calBlock(x).replace("<div><div", '<div style="width:78px;flex:none"><div')}
          <div><div class="label" style="margin:0">Applications close</div>
          <strong style="font-family:var(--display);font-size:1.2rem">${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}</strong></div>
        </div>
        <dl class="facts">
          <dt>Pay</dt><dd>${payLabel(x)}</dd>
          <dt>Hours</dt><dd>${x.hours} per week</dd>
          <dt>Length</dt><dd>${x.weeks} weeks · ${esc(x.season)}</dd>
          <dt>Grades</dt><dd>${x.grades.join(", ")}</dd>
          <dt>Min age</dt><dd>${x.minAge}</dd>
          <dt>Format</dt><dd>${esc(x.mode)}</dd>
        </dl>
        <div class="eligible">
          <label for="my-grade">I’m in grade</label>
          <select id="my-grade"><option value="">—</option>${[9, 10, 11, 12].map((g) => `<option>${g}</option>`).join("")}</select>
          <div class="verdict" id="verdict" aria-live="polite"></div>
        </div>
        ${st.cls === "closed"
          ? `<button class="btn" type="button" disabled style="opacity:.5;cursor:not-allowed">Applications closed</button>`
          : `<a class="btn hl" href="guide.html#apply">Start application</a>`}
        <button class="btn ghost" type="button" data-save="${esc(x.id)}" data-label aria-pressed="${isSaved}">${BOOKMARK}<span>${isSaved ? "Saved to my list" : "Save to my list"}</span></button>
      </aside>`;

    root.addEventListener("change", (e) => {
      if (e.target.dataset.ck !== undefined) {
        checks[e.target.dataset.ck] = e.target.checked;
        try { localStorage.setItem(ckKey, JSON.stringify(checks)); } catch { /* ignore */ }
      }
    });
    const g = document.getElementById("my-grade");
    const v = document.getElementById("verdict");
    g.addEventListener("change", () => {
      const n = Number(g.value);
      if (!n) { v.textContent = ""; v.className = "verdict"; return; }
      const ok = x.grades.includes(n);
      v.className = `verdict ${ok ? "yes" : "no"}`;
      v.textContent = ok ? "You’re eligible by grade." : `Open to grade ${x.grades.join(", ")} only. Save it for later.`;
    });
    bindSaveButtons(root);
  }

  // ---------- tracker page ----------
  function initTracker() {
    const board = document.getElementById("tracker");
    const empty = document.getElementById("tracker-empty");
    function render() {
      const items = Object.entries(saved).filter(([id]) => byId[id]);
      empty.hidden = items.length > 0;
      board.hidden = items.length === 0;
      board.innerHTML = STATUSES.map((s) => {
        const cards = items.filter(([, v]) => v.status === s)
          .sort((a, b) => daysLeft(byId[a[0]]) - daysLeft(byId[b[0]]));
        return `<section class="col" aria-label="${s}">
          <h2>${s}<span>${cards.length}</span></h2>
          ${cards.length ? cards.map(([id, v]) => {
            const x = byId[id], st = deadlineState(x);
            return `<div class="tcard">
              <a href="listing.html?id=${encodeURIComponent(id)}">${esc(x.title)}</a>
              <div class="meta ${st.cls}">${esc(x.org)} · ${st.text}</div>
              <select data-status="${esc(id)}" aria-label="Status for ${esc(x.title)}">${STATUSES.map((o) => `<option ${o === v.status ? "selected" : ""}>${o}</option>`).join("")}</select>
              <textarea data-note="${esc(id)}" rows="1" placeholder="Notes: who you emailed, interview date…" aria-label="Notes for ${esc(x.title)}">${esc(v.note || "")}</textarea>
              <button class="rm" type="button" data-rm="${esc(id)}">Remove</button>
            </div>`;
          }).join("") : `<div class="col-empty">Nothing here yet.</div>`}
        </section>`;
      }).join("");
    }
    board.addEventListener("change", (e) => {
      const id = e.target.dataset.status;
      if (id) { writeSaved({ ...saved, [id]: { ...saved[id], status: e.target.value } }); render(); }
    });
    board.addEventListener("input", (e) => {
      const id = e.target.dataset.note;
      if (id) writeSaved({ ...saved, [id]: { ...saved[id], note: e.target.value } });
    });
    board.addEventListener("click", (e) => {
      const id = e.target.dataset.rm;
      if (id) { const s = { ...saved }; delete s[id]; writeSaved(s); render(); }
    });
    render();
  }

  // ---------- guide page ----------
  function initGuide() {
    document.querySelectorAll("[data-copy]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const el = document.getElementById(btn.dataset.copy);
        const text = el.innerText;
        try {
          await navigator.clipboard.writeText(text);
          btn.textContent = "Copied";
        } catch {
          const r = document.createRange(); r.selectNodeContents(el);
          const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
          btn.textContent = "Selected — press ⌘/Ctrl+C";
        }
        setTimeout(() => (btn.textContent = "Copy email"), 2200);
      });
    });
    // highlight the timeline step that matches the current month
    const m = new Date().getMonth();
    document.querySelectorAll(".timeline li[data-months]").forEach((li) => {
      if (li.dataset.months.split(",").map(Number).includes(m)) {
        li.classList.add("now");
        li.querySelector(".when").insertAdjacentHTML("beforeend", " · <span class=\"mark\">you are here</span>");
      }
    });
  }

  updateCount();
  const page = document.body.dataset.page;
  if (page === "browse") initBrowse();
  if (page === "detail") initDetail();
  if (page === "tracker") initTracker();
  if (page === "guide") initGuide();
})();
