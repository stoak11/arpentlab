// Arpent Autodiag · web tool (vanilla ES module, no build step).
// The diagnosis is computed in the browser by the shared engine (engine.mjs, mirror of
// the Python reference). Nothing leaves the device until the user asks for the summary.
import { evaluer, evaluerCondition } from "./engine.mjs";

const STORE = "arpent.autodiag.v1";
const $app = document.getElementById("app");
const qs = new URLSearchParams(location.search);

const DEPTS = ("01 Ain|02 Aisne|03 Allier|04 Alpes-de-Haute-Provence|05 Hautes-Alpes|06 Alpes-Maritimes|07 Ardèche|08 Ardennes|09 Ariège|10 Aube|11 Aude|12 Aveyron|13 Bouches-du-Rhône|14 Calvados|15 Cantal|16 Charente|17 Charente-Maritime|18 Cher|19 Corrèze|2A Corse-du-Sud|2B Haute-Corse|21 Côte-d'Or|22 Côtes-d'Armor|23 Creuse|24 Dordogne|25 Doubs|26 Drôme|27 Eure|28 Eure-et-Loir|29 Finistère|30 Gard|31 Haute-Garonne|32 Gers|33 Gironde|34 Hérault|35 Ille-et-Vilaine|36 Indre|37 Indre-et-Loire|38 Isère|39 Jura|40 Landes|41 Loir-et-Cher|42 Loire|43 Haute-Loire|44 Loire-Atlantique|45 Loiret|46 Lot|47 Lot-et-Garonne|48 Lozère|49 Maine-et-Loire|50 Manche|51 Marne|52 Haute-Marne|53 Mayenne|54 Meurthe-et-Moselle|55 Meuse|56 Morbihan|57 Moselle|58 Nièvre|59 Nord|60 Oise|61 Orne|62 Pas-de-Calais|63 Puy-de-Dôme|64 Pyrénées-Atlantiques|65 Hautes-Pyrénées|66 Pyrénées-Orientales|67 Bas-Rhin|68 Haut-Rhin|69 Rhône|70 Haute-Saône|71 Saône-et-Loire|72 Sarthe|73 Savoie|74 Haute-Savoie|75 Paris|76 Seine-Maritime|77 Seine-et-Marne|78 Yvelines|79 Deux-Sèvres|80 Somme|81 Tarn|82 Tarn-et-Garonne|83 Var|84 Vaucluse|85 Vendée|86 Vienne|87 Haute-Vienne|88 Vosges|89 Yonne|90 Territoire de Belfort|91 Essonne|92 Hauts-de-Seine|93 Seine-Saint-Denis|94 Val-de-Marne|95 Val-d'Oise|971 Guadeloupe|972 Martinique|973 Guyane|974 La Réunion|976 Mayotte")
  .split("|").map((s) => [s.slice(0, s.indexOf(" ")), s.slice(s.indexOf(" ") + 1)]);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_COURT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const STATUTS = { applicable: "Vous concerne", a_venir: "Vous concernera", a_surveiller: "À surveiller", a_verifier: "À vérifier", non_applicable: "Non concerné" };
const STATUT_RANG = { applicable: 0, a_venir: 0, a_verifier: 1, a_surveiller: 2, non_applicable: 3 };
const DOMAINES = { phyto: "Phytosanitaire", pac: "PAC", environnement: "Environnement", eau: "Eau", social: "Social et emploi", fiscal: "Fiscal et facturation", energie: "Énergie", elevage: "Élevage", sanitaire: "Sanitaire", "vente-directe": "Vente directe", bio: "Bio", filieres: "Filières", cooperative: "Coopérative" };
const DOMAINE_RANG = Object.fromEntries(Object.keys(DOMAINES).map((d, i) => [d, i]));
const FREQ = { continue: "en continu", ponctuelle: "une fois", mensuelle: "chaque mois", trimestrielle: "chaque trimestre", annuelle: "chaque année", pluriannuelle: "périodiquement", "à chaque événement": "à chaque événement" };
const INTERETS = [["maintenant", "Oui, tout de suite"], ["semaines", "Dans quelques semaines"], ["mois", "Dans quelques mois"], ["non", "Pas pour l'instant"]];
const MODE_COULEUR_CLASS = { vert: "m-vert", orange: "m-orange", rouge: "m-rouge" };

const S = {
  bundle: null, api: null, profil: {}, modes: {}, view: "intro", step: 0, domaine: null,
  valeurHoraire: null, contact: {}, sent: null, res: null,
};

// ---------------------------------------------------------------- helpers
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => (qs.get("date") && /^\d{4}-\d{2}-\d{2}$/.test(qs.get("date")) ? qs.get("date") : new Date().toISOString().slice(0, 10));
function frDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d === 1 ? "1er" : d} ${MOIS[m - 1]} ${y}`;
}
const h1 = (x) => Math.round(Number(x) || 0);
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
function parseNum(str) {
  const s = String(str).replace(/[\s\u00a0\u202f]/g, "").replace(/,/g, ".");
  if (s === "") return null;
  return /^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s) ? Number(s) : null;
}
function cleanProfil(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k] = v === "nsp" ? null : v;
  return out;
}
function save() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ profil: S.profil, modes: S.modes, view: S.view, step: S.step,
      valeurHoraire: S.valeurHoraire, contact: S.contact, sent: S.sent, saved: Date.now() }));
  } catch (_) { /* private mode: no persistence */ }
}
function restore() {
  try {
    const d = JSON.parse(localStorage.getItem(STORE) || "null");
    if (!d) return null;
    if (Date.now() - (d.saved || 0) > 1000 * 3600 * 24 * 60) return null;
    return d;
  } catch (_) { return null; }
}
const typ = () => S.profil.type_repondant || "exploitant";
const questions = () => Object.fromEntries(S.bundle.questionnaire.etapes.flatMap((e) => e.champs.map((c) => [c.cle, c])));
const obligations = () => Object.fromEntries(S.bundle.obligations.map((o) => [o.id, o]));
const modesParId = () => Object.fromEntries(S.bundle.parametres.modes.map((m) => [m.id, m]));

function etapesVisibles() {
  return S.bundle.questionnaire.etapes.filter((e) => (e.public || [typ()]).includes(typ()));
}
function champVisible(ch) {
  if (!(ch.public || [typ()]).includes(typ())) return false;
  if (!ch.afficher_si) return true;
  return evaluerCondition(ch.afficher_si, cleanProfil(S.profil))[0] === true;
}
function compute() {
  const opts = { date_reference: today() };
  if (S.valeurHoraire) opts.valeur_horaire = S.valeurHoraire;
  S.res = evaluer(S.bundle, S.profil, S.modes, opts);
  return S.res;
}

// -------------------------------------------------------------- fields
function same(v, o) {
  if (v === undefined || v === null) return false;
  return String(v) === String(o);
}
function renderField(ch, ctx) {
  const id = `f-${ctx}-${ch.cle}`;
  const v = S.profil[ch.cle];
  const aide = ch.aide ? `<span class="aide">${esc(ch.aide)}</span>` : "";
  if (ch.type === "choix" || ch.type === "booleen") {
    const base = ch.type === "booleen" ? [{ valeur: true, libelle: "Oui" }, { valeur: false, libelle: "Non" }] : ch.options;
    const all = ch.obligatoire ? base : [...base, { valeur: "nsp", libelle: "Je ne sais pas", nsp: true }];
    return `<fieldset class="field"><legend>${esc(ch.question)}</legend>${aide}<div class="options">${all.map((o) =>
      `<label class="opt${o.nsp ? " nsp" : ""}"><input type="radio" name="${id}" data-cle="${esc(ch.cle)}" data-kind="${ch.type}" value="${esc(String(o.valeur))}"${same(v, o.valeur) ? " checked" : ""}><span>${esc(o.libelle)}</span></label>`).join("")}</div></fieldset>`;
  }
  if (ch.type === "multi") {
    const arr = Array.isArray(v) ? v : [];
    return `<fieldset class="field"><legend>${esc(ch.question)}</legend>${aide || '<span class="aide">Plusieurs réponses possibles.</span>'}<div class="options">${ch.options.map((o) =>
      `<label class="opt multi"><input type="checkbox" name="${id}" data-cle="${esc(ch.cle)}" data-kind="multi" value="${esc(o.valeur)}"${arr.includes(o.valeur) ? " checked" : ""}><span>${esc(o.libelle)}</span></label>`).join("")}</div></fieldset>`;
  }
  if (ch.type === "departement") {
    return `<div class="field"><label class="q" for="${id}">${esc(ch.question)}</label>${aide}<select class="input" id="${id}" data-cle="${esc(ch.cle)}" data-kind="departement"><option value="">Choisir un département</option>${DEPTS.map(([c, n]) =>
      `<option value="${c}"${v === c ? " selected" : ""}>${c} · ${esc(n)}</option>`).join("")}<option value="nsp"${v === "nsp" ? " selected" : ""}>Je préfère ne pas le dire</option></select></div>`;
  }
  if (ch.type === "nombre") {
    const shown = v === "nsp" || v === null || v === undefined ? "" : String(v).replace(".", ",");
    return `<div class="field"><label class="q" for="${id}">${esc(ch.question)}</label>${aide}<div class="num"><input class="input" id="${id}" data-cle="${esc(ch.cle)}" data-kind="nombre" inputmode="decimal" autocomplete="off" value="${esc(shown)}"${v === "nsp" ? ' placeholder="Je ne sais pas"' : ""}>${ch.unite ? `<span class="unit">${esc(ch.unite)}</span>` : ""}<button type="button" class="btn-link" data-nsp="${esc(ch.cle)}">${v === "nsp" ? "Réponse : je ne sais pas" : "Je ne sais pas"}</button></div></div>`;
  }
  return `<div class="field"><label class="q" for="${id}">${esc(ch.question)}</label>${aide}<input class="input" id="${id}" data-cle="${esc(ch.cle)}" data-kind="texte" autocomplete="off" value="${esc(v && v !== "nsp" ? v : "")}"></div>`;
}

function readInput(el) {
  const cle = el.dataset.cle;
  const kind = el.dataset.kind;
  if (kind === "booleen") S.profil[cle] = el.value === "true" ? true : el.value === "false" ? false : "nsp";
  else if (kind === "choix") S.profil[cle] = el.value;
  else if (kind === "multi") {
    S.profil[cle] = [...document.querySelectorAll(`input[data-cle="${cle}"][data-kind="multi"]:checked`)].map((x) => x.value);
  } else if (kind === "nombre") S.profil[cle] = parseNum(el.value);
  else if (kind === "departement") S.profil[cle] = el.value || null;
  else S.profil[cle] = el.value.trim() || null;
}

// ------------------------------------------------------------------ views
function render() {
  if (S.view === "intro") renderIntro();
  else if (S.view === "wizard") renderWizard();
  else renderResults();
  save();
}

function renderIntro() {
  const saved = restore();
  const n = S.bundle.obligations.length;
  const enCours = saved && saved.profil && Object.keys(saved.profil).length > 1;
  $app.innerHTML = `
  <section class="hero"><div class="wrap hero-grid">
    <div>
      <p class="eyebrow">Outil gratuit · environ 5 minutes</p>
      <h1>Le mille-feuille administratif, <em>enfin lisible.</em></h1>
      <p class="lead">Agriculteur ou coopérative, vous ne savez plus quelles obligations vous concernent ? Décrivez votre exploitation et obtenez votre feuille de route réglementaire, établie à partir des textes officiels.</p>
      <ul class="promise">
        <li>Une carte par obligation : origine (UE, nationale, locale), date d'application, déclarations, données à tenir, pièces à garder.</li>
        <li>Votre calendrier des douze prochains mois, échéances proches en rouge.</li>
        <li>Votre synthèse : ce qui est couvert, à sécuriser ou non couvert, et les seuils à surveiller.</li>
        <li>Le temps que cela vous prend, et celui que vous pourriez récupérer.</li>
      </ul>
      <div class="btn-row">
        <button class="btn btn-primary" data-action="start">Afficher ma feuille de route réglementaire</button>
        <button class="btn btn-ghost" data-action="start-coop">Je représente une coopérative</button>
      </div>
      ${enCours ? `<div class="resume-box"><b>Vous avez un diagnostic en cours.</b><div class="btn-row" style="margin-top:8px"><button class="btn btn-primary" data-action="resume">Reprendre</button><button class="btn-link" data-action="reset">Recommencer à zéro</button></div></div>` : ""}
      <p class="small muted" style="margin-top:18px">Calculé dans votre navigateur : rien n'est envoyé sans votre accord. ${plural(n, "obligation analysée", "obligations analysées")}.</p>
    </div>
    <aside class="hero-card" aria-label="Exemple de feuille de route">
      <h2>Exemple de synthèse</h2>
      <div class="mini-card o"><b>Registre phytosanitaire</b>Tenu à la main : à sécuriser avant le passage au format électronique.</div>
      <div class="mini-card v"><b>Déclaration PAC</b>Faite avec la coopérative : couverte.</div>
      <div class="mini-card"><b>Document unique d'évaluation des risques</b>Rien en place : non couvert.</div>
      <p class="small muted">Exemple fictif. Votre feuille de route dépend de vos réponses.</p>
    </aside>
  </div></section>`;
}

function liveCounter() {
  const r = compute();
  const s = r.synthese;
  return `<span class="counter" aria-live="polite"><b>${s.concernees}</b> ${s.concernees > 1 ? "obligations vous concernent" : "obligation vous concerne"} · ${s.a_verifier.length} à vérifier</span>`;
}

function renderWizard() {
  const etapes = etapesVisibles();
  S.step = Math.min(Math.max(0, S.step), etapes.length - 1);
  const e = etapes[S.step];
  const champs = e.champs.filter(champVisible);
  const last = S.step === etapes.length - 1;
  $app.innerHTML = `
  <section class="wizard"><div class="wrap">
    <div class="progress" aria-hidden="true">${etapes.map((_, i) => `<span class="${i < S.step ? "done" : i === S.step ? "current" : ""}"></span>`).join("")}</div>
    <div class="step-meta"><span class="small muted">Étape ${S.step + 1} sur ${etapes.length}</span><span id="counter">${liveCounter()}</span></div>
    <form class="step-card" id="step-form" novalidate>
      <h2 tabindex="-1" id="step-title">${esc(e.titre)}</h2>
      <p>${esc(e.intro || "")}</p>
      ${champs.map((c) => renderField(c, "w")).join("")}
      <p class="form-msg err hidden" id="step-err" role="alert"></p>
      <div class="wizard-nav">
        <button type="button" class="btn btn-ghost" data-action="${S.step === 0 ? "intro" : "prev"}">${S.step === 0 ? "Retour" : "Étape précédente"}</button>
        <button type="submit" class="btn btn-primary">${last ? "Afficher ma feuille de route" : "Étape suivante"}</button>
      </div>
    </form>
  </div></section>`;
}

function stableCards(r) {
  return [...r.obligations].sort((a, b) =>
    (STATUT_RANG[a.statut] - STATUT_RANG[b.statut]) || ((DOMAINE_RANG[a.domaine] ?? 99) - (DOMAINE_RANG[b.domaine] ?? 99)) || a.titre.localeCompare(b.titre, "fr"));
}

function renderResults() {
  compute();
  if (!document.getElementById("res-root")) {
    $app.innerHTML = `
    <section class="results"><div class="wrap" id="res-root">
      <div class="toolbar">
        <button class="btn btn-ghost" data-action="edit">Modifier mes réponses</button>
        <button class="btn btn-ghost" data-action="print">Imprimer ou enregistrer en PDF</button>
        <button class="btn-link" data-action="reset">Recommencer</button>
      </div>
      <p class="eyebrow">Arpent Lab · Feuille de route réglementaire</p>
      <h1 tabindex="-1" id="res-title" style="font-size:clamp(1.8rem,4vw,2.6rem);margin:0 0 6px">Votre feuille de route réglementaire</h1>
      <p class="muted" id="res-date"></p>
      <div id="res-kpis"></div>
      <div id="res-complete"></div>
      <h2 class="section">Vos obligations, une par carte</h2>
      <p class="section-intro">Pour chaque obligation qui vous concerne, indiquez comment vous la gérez aujourd'hui : votre synthèse, votre temps et votre calendrier se mettent à jour.</p>
      <div id="res-cards"></div>
      <h2 class="section">Le temps que cela vous prend</h2>
      <div id="res-time"></div>
      <h2 class="section">Votre calendrier des douze prochains mois</h2>
      <div id="res-cal"></div>
      <h2 class="section">Votre synthèse</h2>
      <div id="res-synth"></div>
      <h2 class="section">Ce que Ceres ferait pour vous</h2>
      <p class="section-intro">Ceres est le co-pilote administratif développé par Arpent Lab. Il tient vos registres à partir des documents que vous avez déjà, vous rappelle vos échéances et prépare vos déclarations. Vous gardez la main sur ce qui est envoyé.</p>
      <div id="res-modules"></div>
      <div id="res-send"></div>
    </div></section>`;
    renderSend();
  }
  const r = S.res;
  document.getElementById("res-date").textContent = `Établie le ${frDate(r.meta.date_reference)} · ${typ() === "cooperative" ? "coopérative ou négoce" : "exploitation agricole"} · référentiel ${r.meta.referentiel}`;
  renderKpis(r);
  renderComplete(r);
  renderCards(r);
  renderTime(r);
  renderCalendar(r);
  renderSynth(r);
  renderModules(r);
}

function renderKpis(r) {
  const s = r.synthese;
  // The bar covers ONLY the obligations that concern you (its legend sums to s.concernees);
  // "à vérifier" (applicability unknown) and "à surveiller" are counted apart.
  const conc = r.obligations.filter((c) => c.statut === "applicable" || c.statut === "a_venir");
  const parts = [["vert", "Couvert"], ["orange", "À sécuriser"], ["rouge", "Non couvert"], ["bleu", "Mode de gestion à préciser"]]
    .map(([c, l]) => [c, l, conc.filter((x) => x.couleur === c).length]);
  const totalBar = conc.length || 1;
  document.getElementById("res-kpis").innerHTML = `
    <div class="kpis">
      <div class="kpi accent"><span class="v">${s.concernees}</span><span class="l">${s.concernees > 1 ? "obligations vous concernent" : "obligation vous concerne"}</span></div>
      <div class="kpi"><span class="v">${s.taux_couverture === null ? "-" : s.taux_couverture + " %"}</span><span class="l">couvertes${s.concernees ? ` : ${s.couvertes} sur ${s.concernees}` : ""}</span></div>
      <div class="kpi"><span class="v">${s.a_verifier.length}</span><span class="l">à vérifier · ${s.a_surveiller.length} à surveiller</span></div>
      <div class="kpi"><span class="v">${h1(r.temps.heures_actuelles)} h</span><span class="l">par an, selon votre organisation</span></div>
    </div>
    ${conc.length ? `<div class="bar" role="img" aria-label="Répartition des ${conc.length} obligations qui vous concernent">${parts.map(([c, , n]) => n ? `<i style="width:${(100 * n) / totalBar}%;background:var(--${c})"></i>` : "").join("")}</div>
    <div class="legend">${parts.map(([c, l, n]) => `<span><i class="dot ${c}"></i>${l} (${n})</span>`).join("")}</div>` : ""}
    ${s.modes_a_preciser ? `<div class="callout"><b>${plural(s.modes_a_preciser, "obligation attend", "obligations attendent")} votre mode de gestion.</b> Indiquez-le sur chaque carte : c'est ce qui colore votre synthèse en vert, orange ou rouge.</div>` : ""}`;
}

function renderComplete(r) {
  const box = document.getElementById("res-complete");
  const q = questions();
  const champs = r.champs_manquants.map((m) => q[m.champ]).filter(Boolean).slice(0, 6);
  if (!champs.length) { box.innerHTML = ""; return; }
  box.innerHTML = `<details class="fold" open><summary>Affiner : ${plural(r.synthese.a_verifier.length, "obligation reste", "obligations restent")} à vérifier</summary>
    <p class="small muted">Répondez si vous le pouvez : chaque réponse précise votre feuille de route.</p>
    <div class="complete">${champs.map((c) => renderField(c, "c")).join("")}</div></details>`;
}

function nextEventFor(r, id) {
  return r.calendrier.evenements.find((e) => e.obligation === id);
}

function cardHTML(c, r) {
  const ob = obligations()[c.id];
  const q = questions();
  const concernee = c.statut === "applicable" || c.statut === "a_venir";
  const app = ob.date_application_label || (ob.date_application ? `À partir du ${frDate(ob.date_application)}` : "En vigueur");
  const decl = (ob.declarations || []).slice(0, 2).map((d) => `${esc(d.intitule)} <span class="muted">(${esc(d.organisme)}, ${esc(FREQ[d.frequence] || d.frequence)})</span>`).join("<br>");
  const ev = concernee ? nextEventFor(r, c.id) : null;
  const statutColor = { applicable: "var(--terra-dark)", a_venir: "var(--terra-dark)", a_surveiller: "var(--violet)", a_verifier: "var(--bleu)", non_applicable: "var(--gris)" }[c.statut];
  const modeOpts = S.bundle.parametres.modes.map((m) =>
    `<label class="opt ${MODE_COULEUR_CLASS[m.couleur] || ""}"><input type="radio" name="mode-${esc(c.id)}" data-mode="${esc(c.id)}" value="${esc(m.id)}"${S.modes[c.id] === m.id ? " checked" : ""}><span>${esc(m.libelle)}</span></label>`).join("");
  const textes = (ob.origine.textes || []).map((t) => `<li><a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.ref)}</a></li>`).join("");
  const liens = (ob.liens_utiles || []).map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.libelle)}</a></li>`).join("");
  const mod = S.bundle.modules.find((m) => m.id === ob.ceres.module);
  return `<article class="ob c-${c.couleur}" id="ob-${esc(c.id)}">
    <div class="ob-head"><span class="badge niveau">${esc(ob.origine.niveau)}</span><span class="badge">${esc(DOMAINES[ob.domaine] || ob.domaine)}</span><span class="badge statut" style="color:${statutColor}">${esc(STATUTS[c.statut])}</span>${ob.verification.statut !== "verifie" ? '<span class="badge ac" title="Certaines informations de cette carte sont en cours de vérification">En vérification</span>' : ""}</div>
    <h3>${esc(ob.titre)}</h3>
    <p class="resume">${esc(ob.resume)}</p>
    <ul class="facts">
      <li><b>Application :</b> ${esc(app)}</li>
      <li><b>Qui est concerné :</b> ${esc(ob.applicabilite.explication)}</li>
      ${decl ? `<li><b>À déclarer :</b> ${decl}</li>` : ""}
      ${ev ? `<li><b>Prochaine échéance :</b> ${esc(frDate(ev.date))}${ev.approx ? " (date indicative)" : ""}, ${esc(ev.libelle.toLowerCase())}</li>` : ""}
    </ul>
    ${c.alertes.map((a) => `<p class="alert"><b>À surveiller :</b> ${esc(a)}</p>`).join("")}
    ${c.statut === "a_verifier" ? `<p class="alert" style="background:#eaf1f9;color:#23446b"><b>Pour savoir si elle vous concerne :</b> ${c.manquants.map((m) => esc((q[m] || {}).question || m)).join(" · ")} <button class="btn-link" data-action="goto-complete">Répondre</button></p>` : ""}
    <details><summary>Tout savoir sur cette obligation</summary>
      ${(ob.donnees_a_tracer || []).length ? `<h4>Données à tenir à jour</h4><ul>${ob.donnees_a_tracer.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
      ${(ob.pieces_a_conserver || []).length ? `<h4>Pièces à conserver</h4><ul>${ob.pieces_a_conserver.map((p) => `<li>${esc(p.piece)}${p.duree ? ` <span class="muted">(${esc(p.duree)})</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${(ob.echeances || []).length ? `<h4>Échéances</h4><ul>${ob.echeances.map((e) => `<li>${esc(e.libelle)}${e.date ? ` : ${esc(frDate(e.date))}` : e.mois ? ` : ${e.jour ? e.jour + " " : "fin "}${MOIS[e.mois - 1]}` : ""}${e.note ? ` <span class="muted">(${esc(e.note)})</span>` : ""}</li>`).join("")}</ul>` : ""}
      ${ob.sanctions ? `<h4>En cas de manquement</h4><p>${esc(ob.sanctions)}</p>` : ""}
      <h4>Textes de référence</h4><ul>${textes}</ul>
      ${liens ? `<h4>Liens utiles</h4><ul>${liens}</ul>` : ""}
      ${ob.ceres.couverture !== "aucune" ? `<h4>Avec Ceres</h4><p>${esc(ob.ceres.argument)}${mod ? ` <span class="muted">(module ${esc(mod.nom)}${mod.statut !== "disponible" ? ", en préparation" : ""})</span>` : ""}</p>` : ""}
      ${ob.verification.note && ob.verification.statut !== "verifie" ? `<h4>En cours de vérification</h4><p class="muted">${esc(ob.verification.note)}</p>` : ""}
    </details>
    ${concernee ? `<fieldset class="modes"><legend>Comment la gérez-vous aujourd'hui ?</legend><div class="options">${modeOpts}</div></fieldset>` : ""}
    <div class="ob-foot"><span>${concernee ? `≈ ${h1(c.heures_manuel)} h/an si faite à la main` : ""}</span><span>Vérifiée le ${esc(frDate(ob.verification.date))}</span></div>
  </article>`;
}

function renderCards(r) {
  const all = stableCards(r);
  const doms = [...new Set(all.filter((c) => c.statut !== "non_applicable").map((c) => c.domaine))];
  const keep = (c) => !S.domaine || c.domaine === S.domaine;
  const groups = [
    ["Vous concernent", all.filter((c) => (c.statut === "applicable" || c.statut === "a_venir") && keep(c))],
    ["À vérifier", all.filter((c) => c.statut === "a_verifier" && keep(c))],
    ["À surveiller", all.filter((c) => c.statut === "a_surveiller" && keep(c))],
  ];
  const nonc = all.filter((c) => c.statut === "non_applicable" && keep(c));
  document.getElementById("res-cards").innerHTML = `
    <div class="filters" role="group" aria-label="Filtrer par domaine">
      <button data-domaine="" aria-pressed="${!S.domaine}">Tous les domaines</button>
      ${doms.map((d) => `<button data-domaine="${esc(d)}" aria-pressed="${S.domaine === d}">${esc(DOMAINES[d] || d)}</button>`).join("")}
    </div>
    ${groups.filter(([, l]) => l.length).map(([t, l]) => `<h3 style="margin:22px 0 10px">${t} (${l.length})</h3><div class="cards">${l.map((c) => cardHTML(c, r)).join("")}</div>`).join("")}
    ${nonc.length ? `<details class="fold"><summary>Non concernées (${nonc.length})</summary><div class="cards" style="margin-top:12px">${nonc.map((c) => cardHTML(c, r)).join("")}</div></details>` : ""}`;
}

function renderTime(r) {
  const t = r.temps;
  const hyp = S.bundle.parametres.temps.hypothese;
  const mods = r.modules.filter((m) => m.gain_immediat + m.gain_a_venir >= 0.5);
  document.getElementById("res-time").innerHTML = `<div class="time-grid">
    <div class="panel">
      <h3>Aujourd'hui</h3>
      <p><span class="big">${h1(t.heures_actuelles)} h</span> par an consacrées à vos obligations, selon l'organisation que vous avez indiquée.</p>
      ${t.heures_non_couvertes >= 1 ? `<p>Et environ <b>${h1(t.heures_non_couvertes)} h</b> par an qu'il faudrait y consacrer pour les obligations aujourd'hui non couvertes.</p>` : ""}
      ${r.synthese.modes_a_preciser ? `<p class="small muted">Les obligations sans mode de gestion sont comptées comme faites à la main.</p>` : ""}
    </div>
    <div class="panel">
      <h3>Avec Ceres</h3>
      <p><span class="big" style="color:var(--terra)">${h1(t.gain_immediat)} h</span> par an récupérables dès aujourd'hui${t.gain_a_venir >= 1 ? `, et ${h1(t.gain_a_venir)} h de plus avec les modules en préparation` : ""}.</p>
      <p>Soit environ <b>${Math.round(t.valeur_gain_total_eur).toLocaleString("fr-FR")} €</b> par an, au taux de
        <label class="sr-only" for="vh">Valeur d'une heure de votre temps, en euros</label>
        <input class="input" id="vh" data-action="vh" inputmode="numeric" style="display:inline-block;width:76px;min-height:34px;padding:4px 8px" value="${esc(t.valeur_horaire)}"> € de l'heure.</p>
      ${mods.length ? `<ul class="plain-list small">${mods.map((m) => `<li>${esc(m.nom)} : ${h1(m.gain_immediat + m.gain_a_venir)} h/an${m.statut !== "disponible" ? " (en préparation)" : ""}</li>`).join("")}</ul>` : ""}
    </div>
  </div><p class="hyp">${esc(hyp)}</p>`;
}

function renderCalendar(r) {
  const [y0, m0] = r.meta.date_reference.split("-").map(Number);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const k = m0 - 1 + i;
    months.push({ y: y0 + Math.floor(k / 12), m: (k % 12) + 1, items: [] });
  }
  for (const e of r.calendrier.evenements) {
    const [y, m, d] = e.date.split("-").map(Number);
    const slot = months.find((x) => x.y === y && x.m === m);
    if (slot) slot.items.push({ ...e, d });
  }
  const obs = obligations();
  document.getElementById("res-cal").innerHTML = `
    <div class="calendar">${months.map((mo) => `<div class="month${mo.items.length ? "" : " empty"}"><h4>${MOIS_COURT[mo.m - 1]} ${mo.y}</h4><ul>${mo.items.map((e) =>
      `<li class="${e.urgence}"><span class="d">${e.approx ? "≈" : ""}${e.d}</span>${esc(e.titre)} : ${esc(e.libelle.toLowerCase())}</li>`).join("")}</ul></div>`).join("")}</div>
    ${r.calendrier.continues.length ? `<p class="small" style="margin-top:12px"><b>À tenir en continu :</b> ${r.calendrier.continues.map((id) => esc(obs[id].titre)).join(" · ")}</p>` : ""}
    <div class="legend" style="margin-top:8px"><span><i class="dot rouge"></i>Dans moins de 30 jours</span><span><i class="dot orange"></i>Dans moins de 90 jours</span><span>≈ date indicative</span></div>
    ${r.calendrier.evenements.length ? `<p style="margin-top:12px"><button class="btn btn-ghost" data-action="ics">Ajouter ces échéances à mon agenda (.ics)</button></p>` : ""}`;
}

function renderSynth(r) {
  const cards = stableCards(r);
  const conc = cards.filter((c) => c.statut === "applicable" || c.statut === "a_venir");
  const col = (cls, titre, list, empty) => `<div class="col ${cls}"><h3>${titre} (${list.length})</h3>${list.length ? `<ul>${list.map((c) => `<li><a href="#ob-${esc(c.id)}">${esc(c.titre)}</a></li>`).join("")}</ul>` : `<p class="small muted">${empty}</p>`}</div>`;
  const aVerif = cards.filter((c) => c.statut === "a_verifier" || (c.couleur === "bleu" && (c.statut === "applicable" || c.statut === "a_venir")));
  const surv = cards.filter((c) => c.statut === "a_surveiller");
  const prio = r.synthese.priorites.map((id) => obligations()[id].titre);
  document.getElementById("res-synth").innerHTML = `
    ${prio.length ? `<div class="callout warn"><b>Vos priorités :</b> ${prio.slice(0, 4).map(esc).join(" · ")}</div>` : ""}
    <div class="synth">
      ${col("vert", "Couvert", conc.filter((c) => c.couleur === "vert"), "Rien pour l'instant.")}
      ${col("orange", "À sécuriser", conc.filter((c) => c.couleur === "orange"), "Rien à sécuriser.")}
      ${col("rouge", "Non couvert", conc.filter((c) => c.couleur === "rouge"), "Aucune obligation non couverte.")}
    </div>
    <div class="synth-extra">
      <div class="panel"><h3><i class="dot bleu"></i>À vérifier ou à préciser (${aVerif.length})</h3>${aVerif.length ? `<ul class="plain-list small">${aVerif.map((c) => `<li><a href="#ob-${esc(c.id)}">${esc(c.titre)}</a>${c.statut === "a_verifier" ? " : réponse manquante" : " : mode de gestion à indiquer"}</li>`).join("")}</ul>` : '<p class="small muted">Rien à vérifier.</p>'}</div>
      <div class="panel"><h3><i class="dot violet"></i>À surveiller (${surv.length})</h3>${surv.length ? `<ul class="plain-list small">${surv.map((c) => `<li><b>${esc(c.titre)}</b> : ${esc(c.alertes[0] || "")}</li>`).join("")}</ul>` : '<p class="small muted">Aucun seuil proche.</p>'}</div>
    </div>
    <p class="small muted" style="margin-top:10px">${plural(cards.filter((c) => c.statut === "non_applicable").length, "obligation ne vous concerne", "obligations ne vous concernent")} pas aujourd'hui.</p>`;
}

function renderModules(r) {
  const mods = r.modules;
  const meta = Object.fromEntries(S.bundle.modules.map((m) => [m.id, m]));
  document.getElementById("res-modules").innerHTML = mods.length ? `<div class="modules">${mods.map((m) => `
    <div class="module"><span class="st ${m.statut === "disponible" ? "ok" : "wip"}">${m.statut === "disponible" ? "Disponible" : `En préparation${meta[m.id].horizon ? " · " + esc(meta[m.id].horizon) : ""}`}</span>
      <h3>${esc(m.nom)}</h3><p>${esc(meta[m.id].description)}</p>
      <p class="small muted">${plural(m.obligations.length, "obligation", "obligations")} de votre feuille de route${m.gain_immediat + m.gain_a_venir >= 0.5 ? ` · ≈ ${h1(m.gain_immediat + m.gain_a_venir)} h/an` : ""}</p></div>`).join("")}</div>` : '<p class="muted">Aucun module ne correspond encore à votre profil.</p>';
}

function renderSend() {
  const box = document.getElementById("res-send");
  if (S.sent) {
    box.innerHTML = `<section class="send" id="envoi"><div class="done-panel" role="status"><h3>C'est envoyé.</h3>
      <p>Votre synthèse part à <b>${esc(S.sent.email)}</b>, avec le fichier agenda de vos échéances${S.sent.essai ? " et le lien vers votre session d'essai Ceres, déjà paramétrée avec votre exploitation" : ""}. Pensez à vérifier vos courriers indésirables.</p>
      <p class="small muted">Une question ? Écrivez-nous à <a href="mailto:contact@arpent-lab.ai">contact@arpent-lab.ai</a>.</p></div></section>`;
    return;
  }
  const c = S.contact;
  box.innerHTML = `<section class="send" id="envoi" aria-labelledby="send-title">
    <h2 id="send-title">Recevoir ma synthèse par e-mail</h2>
    <p class="intro">Vous recevez votre feuille de route complète, le fichier agenda de vos échéances et l'accès à une session d'essai Ceres déjà paramétrée avec votre exploitation et les modules qui vous sont utiles.</p>
    <form id="send-form" novalidate>
      <div class="grid">
        <div><label for="s-prenom">Prénom</label><input class="input" id="s-prenom" name="prenom" autocomplete="given-name" value="${esc(c.prenom || "")}"></div>
        <div><label for="s-nom">Nom</label><input class="input" id="s-nom" name="nom" autocomplete="family-name" value="${esc(c.nom || "")}"></div>
        <div><label for="s-email">E-mail (obligatoire)</label><input class="input" id="s-email" name="email" type="email" autocomplete="email" required value="${esc(c.email || "")}"></div>
        <div><label for="s-org">${typ() === "cooperative" ? "Coopérative ou entreprise" : "Exploitation (facultatif)"}</label><input class="input" id="s-org" name="organisation" autocomplete="organization" value="${esc(c.organisation || "")}"></div>
        <div><label for="s-tel">Téléphone (facultatif)</label><input class="input" id="s-tel" name="telephone" type="tel" autocomplete="tel" value="${esc(c.telephone || "")}"></div>
        <fieldset class="full" style="border:0;padding:0;margin:0"><legend style="font-weight:600;font-size:.92rem;margin-bottom:8px">Ceres, notre co-pilote administratif, vous intéresse ?</legend>
          <div class="options">${INTERETS.map(([v, l]) => `<label class="opt"><input type="radio" name="interet" value="${v}"${(c.interet || "semaines") === v ? " checked" : ""}><span>${l}</span></label>`).join("")}</div></fieldset>
        <div class="full"><label for="s-msg">Un message, une question, une demande (facultatif)</label><textarea class="input" id="s-msg" name="message" rows="3">${esc(c.message || "")}</textarea></div>
        <div class="full">
          <label class="check"><input type="checkbox" name="envoi" checked required> Je souhaite recevoir ma synthèse par e-mail.</label>
          <label class="check"><input type="checkbox" name="recontact"${c.recontact ? " checked" : ""}> J'accepte qu'Arpent Lab me recontacte au sujet de ma feuille de route et de Ceres.</label>
          <label class="check"><input type="checkbox" name="produit"${c.produit ? " checked" : ""}> J'accepte que mes réponses, sans mon nom ni mes coordonnées, servent à améliorer les outils d'Arpent Lab.</label>
        </div>
        <div class="hp" aria-hidden="true"><label for="s-web">Site web</label><input id="s-web" name="website" tabindex="-1" autocomplete="off"></div>
      </div>
      <div class="btn-row" style="margin-top:18px"><button type="submit" class="btn btn-primary" id="send-btn">Recevoir ma synthèse</button></div>
      <div id="send-msg" role="alert"></div>
      <p class="legal">Vos données servent uniquement aux finalités cochées. Elles sont conservées au plus trois ans après notre dernier échange et ne sont jamais revendues. Accès, rectification ou suppression : <a href="mailto:contact@arpent-lab.ai">contact@arpent-lab.ai</a>.</p>
    </form></section>`;
}

// ------------------------------------------------------------------ actions
function ics(r) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const t = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Arpent Lab//Autodiag//FR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Feuille de route réglementaire"];
  for (const e of r.calendrier.evenements) {
    const d = e.date.replace(/-/g, "");
    const n = new Date(e.date + "T00:00:00Z");
    n.setUTCDate(n.getUTCDate() + 1);
    L.push("BEGIN:VEVENT", `UID:${e.obligation}-${e.date}@arpent-lab.ai`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`,
      `DTEND;VALUE=DATE:${n.toISOString().slice(0, 10).replace(/-/g, "")}`, `SUMMARY:${t(`${e.titre} : ${e.libelle}`)}`,
      `DESCRIPTION:${t("Échéance de votre feuille de route réglementaire (Arpent Lab)." + (e.approx ? " Date indicative." : ""))}`,
      "BEGIN:VALARM", "TRIGGER:-P7D", "ACTION:DISPLAY", "DESCRIPTION:Échéance dans 7 jours", "END:VALARM", "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  const blob = new Blob([L.join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "feuille-de-route-echeances.ics";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function mailtoFallback(c, r) {
  const s = r.synthese;
  const obs = obligations();
  const body = [
    "Bonjour,", "", "Voici ma feuille de route réglementaire (l'envoi automatique n'a pas abouti).", "",
    `Nom : ${[c.prenom, c.nom].filter(Boolean).join(" ")}`, `E-mail : ${c.email || ""}`, `Organisation : ${c.organisation || ""}`,
    `Téléphone : ${c.telephone || ""}`, `Intérêt pour Ceres : ${(INTERETS.find(([v]) => v === c.interet) || ["", ""])[1]}`, "",
    `Obligations qui me concernent : ${s.concernees} (couvertes : ${s.taux_couverture ?? "-"} %)`,
    `Priorités : ${s.priorites.map((id) => obs[id].titre).join(", ") || "aucune"}`,
    `Département : ${S.profil.departement || ""} · Type : ${typ()}`, "", c.message ? `Message : ${c.message}` : "",
  ].join("\n").slice(0, 1800);
  return `mailto:contact@arpent-lab.ai?subject=${encodeURIComponent("Ma feuille de route réglementaire")}&body=${encodeURIComponent(body)}`;
}

async function submitSend(form) {
  const f = new FormData(form);
  const c = {
    prenom: (f.get("prenom") || "").trim(), nom: (f.get("nom") || "").trim(), email: (f.get("email") || "").trim(),
    organisation: (f.get("organisation") || "").trim(), telephone: (f.get("telephone") || "").trim(),
    interet: f.get("interet") || "semaines", message: (f.get("message") || "").trim(),
    recontact: !!f.get("recontact"), produit: !!f.get("produit"),
  };
  S.contact = c;
  save();
  const msg = document.getElementById("send-msg");
  const btn = document.getElementById("send-btn");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email)) {
    msg.innerHTML = '<p class="form-msg err">Indiquez une adresse e-mail valide.</p>';
    form.email.focus();
    return;
  }
  if (!f.get("envoi")) {
    msg.innerHTML = '<p class="form-msg err">Cochez « Je souhaite recevoir ma synthèse par e-mail » pour l\'envoi.</p>';
    return;
  }
  const r = compute();
  const utm = {};
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content"]) if (qs.get(k)) utm[k] = qs.get(k).slice(0, 80);
  const body = {
    respondent: { email: c.email, prenom: c.prenom || null, nom: c.nom || null, telephone: c.telephone || null, organisation: c.organisation || null },
    profil: S.profil, modes: S.modes, interet_ceres: c.interet, message: c.message || null,
    consentements: { envoi_synthese: true, recontact: c.recontact, usage_produit: c.produit },
    source: (qs.get("source") || qs.get("utm_source") || (document.referrer ? new URL(document.referrer).hostname : "direct")).slice(0, 60),
    utm: Object.keys(utm).length ? utm : null, referentiel_version: S.bundle.version, website: f.get("website") || null,
  };
  if (!S.api) {
    msg.innerHTML = `<p class="form-msg err">L'envoi automatique est momentanément indisponible. Votre feuille de route reste affichée. <a href="${mailtoFallback(c, r)}">Nous l'envoyer par e-mail</a></p>`;
    return;
  }
  btn.disabled = true;
  btn.textContent = "Envoi en cours…";
  msg.innerHTML = "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const resp = await fetch(`${S.api.replace(/\/+$/, "")}/api/v1/diagnostics`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
    if (resp.status === 201) {
      S.sent = { email: c.email, essai: true, at: Date.now() };
      save();
      renderSend();
      document.getElementById("envoi").scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const detail = resp.status === 429 ? "Trop d'envois depuis votre connexion, réessayez dans quelques minutes." : "L'envoi automatique n'a pas abouti.";
    throw new Error(detail);
  } catch (e) {
    const txt = e.name === "AbortError" ? "Le serveur ne répond pas pour l'instant." : e.message || "L'envoi automatique n'a pas abouti.";
    msg.innerHTML = `<p class="form-msg err">${esc(txt)} Votre feuille de route reste affichée. <a href="${mailtoFallback(c, r)}">Nous l'envoyer par e-mail</a> ou réessayez.</p>`;
  } finally {
    clearTimeout(timer);
    btn.disabled = false;
    btn.textContent = "Recevoir ma synthèse";
  }
}

function refreshResultsKeepFocus() {
  const a = document.activeElement;
  const key = a && (a.dataset.mode ? `[data-mode="${a.dataset.mode}"][value="${a.value}"]` : a.dataset.cle ? `[data-cle="${a.dataset.cle}"]${a.type === "radio" || a.type === "checkbox" ? `[value="${a.value}"]` : ""}` : null);
  renderResults();
  save();
  if (key) {
    const el = document.querySelector(key);
    if (el) el.focus({ preventScroll: true });
  }
}

function refreshWizardKeepFocus() {
  const a = document.activeElement;
  const key = a && a.dataset.cle ? `[data-cle="${a.dataset.cle}"]${a.type === "radio" || a.type === "checkbox" ? `[value="${CSS.escape(a.value)}"]` : ""}` : null;
  renderWizard();
  save();
  if (key) {
    const el = document.querySelector(key);
    if (el) el.focus({ preventScroll: true });
  }
}

function go(view, focusId) {
  S.view = view;
  render();
  window.scrollTo({ top: 0 });
  const el = document.getElementById(focusId);
  if (el) el.focus({ preventScroll: true });
}

$app.addEventListener("click", (ev) => {
  const t = ev.target.closest("[data-action],[data-nsp],[data-domaine]");
  if (!t) return;
  if (t.dataset.nsp) {
    S.profil[t.dataset.nsp] = "nsp";
    S.view === "wizard" ? refreshWizardKeepFocus() : refreshResultsKeepFocus();
    return;
  }
  if (t.dataset.domaine !== undefined && !t.dataset.action) {
    S.domaine = t.dataset.domaine || null;
    refreshResultsKeepFocus();
    return;
  }
  const a = t.dataset.action;
  if (a === "start" || a === "start-coop") {
    const saved = restore();
    S.profil = {};
    S.modes = {};
    S.sent = null;
    S.contact = saved ? saved.contact || {} : {};
    S.profil.type_repondant = a === "start-coop" || qs.get("type") === "cooperative" ? "cooperative" : "exploitant";
    S.step = 0;
    go("wizard", "step-title");
  } else if (a === "resume") {
    const d = restore();
    Object.assign(S, { profil: d.profil || {}, modes: d.modes || {}, step: d.step || 0, valeurHoraire: d.valeurHoraire || null, contact: d.contact || {}, sent: d.sent || null });
    go(d.view === "results" ? "results" : "wizard", d.view === "results" ? "res-title" : "step-title");
  } else if (a === "reset") {
    try { localStorage.removeItem(STORE); } catch (_) { /* ignore */ }
    Object.assign(S, { profil: {}, modes: {}, step: 0, contact: {}, sent: null, valeurHoraire: null, domaine: null });
    go("intro");
  } else if (a === "intro") {
    go("intro");
  } else if (a === "prev") {
    S.step -= 1;
    go("wizard", "step-title");
  } else if (a === "edit") {
    S.step = 0;
    go("wizard", "step-title");
  } else if (a === "print") {
    for (const d of document.querySelectorAll(".ob details")) d.open = true;
    window.print();
  } else if (a === "ics") {
    ics(compute());
  } else if (a === "goto-complete") {
    const box = document.getElementById("res-complete");
    if (box) { box.scrollIntoView({ behavior: "smooth", block: "start" }); const f = box.querySelector("input,select"); if (f) f.focus({ preventScroll: true }); }
  }
});

$app.addEventListener("change", (ev) => {
  const el = ev.target;
  if (el.dataset.mode) {
    S.modes[el.dataset.mode] = el.value;
    refreshResultsKeepFocus();
    return;
  }
  if (el.dataset.action === "vh") {
    const v = parseNum(el.value);
    S.valeurHoraire = v && v > 0 && v < 1000 ? v : null;
    refreshResultsKeepFocus();
    return;
  }
  if (!el.dataset.cle) return;
  readInput(el);
  if (S.view === "wizard") refreshWizardKeepFocus();
  else refreshResultsKeepFocus();
});

$app.addEventListener("input", (ev) => {
  const el = ev.target;
  if (!el.dataset.cle || !["nombre", "texte"].includes(el.dataset.kind)) return;
  readInput(el);
  save();
  const c = document.getElementById("counter");
  if (c) c.innerHTML = liveCounter();
});

$app.addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (ev.target.id === "step-form") {
    const etapes = etapesVisibles();
    const e = etapes[S.step];
    const manquant = e.champs.filter(champVisible).find((ch) => ch.obligatoire && (S.profil[ch.cle] === undefined || S.profil[ch.cle] === null));
    if (manquant) {
      const err = document.getElementById("step-err");
      err.textContent = `Merci de répondre à : ${manquant.question}`;
      err.classList.remove("hidden");
      return;
    }
    if (S.step < etapes.length - 1) {
      S.step += 1;
      go("wizard", "step-title");
    } else {
      go("results", "res-title");
    }
  } else if (ev.target.id === "send-form") {
    submitSend(ev.target);
  }
});

// ------------------------------------------------------------------- boot
async function loadEndpoints() {
  if (qs.get("api")) return qs.get("api");
  for (const u of ["../endpoints.json", "./endpoints.json"]) {
    try {
      const r = await fetch(u, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (j.autodiag_api) return j.autodiag_api;
      }
    } catch (_) { /* try next */ }
  }
  return null;
}

async function boot() {
  try {
    const [bundle, api] = await Promise.all([fetch("data/referentiel.json", { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`référentiel ${r.status}`);
      return r.json();
    }), loadEndpoints()]);
    S.bundle = bundle;
    S.api = api;
  } catch (e) {
    $app.innerHTML = `<div class="wrap loading">Le référentiel n'a pas pu être chargé. Réessayez dans un instant ou écrivez-nous à <a href="mailto:contact@arpent-lab.ai">contact@arpent-lab.ai</a>.</div>`;
    return;
  }
  document.getElementById("disclaimer").textContent = S.bundle.parametres.avertissement;
  const dates = S.bundle.obligations.map((o) => o.verification.date).sort();
  document.getElementById("version").textContent = `Référentiel ${S.bundle.version} · ${S.bundle.obligations.length} obligations · textes vérifiés jusqu'au ${dates.length ? frDate(dates[dates.length - 1]) : "-"}.`;
  const d = restore();
  if (d && d.view === "results" && qs.get("reprendre") !== null) {
    Object.assign(S, { profil: d.profil || {}, modes: d.modes || {}, contact: d.contact || {}, sent: d.sent || null, valeurHoraire: d.valeurHoraire || null });
    S.view = "results";
  }
  render();
}

boot();
