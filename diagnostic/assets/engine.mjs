// Arpent Autodiag engine: browser / Node implementation (ES module, no dependency).
//
// Mirror of engine/python/arpent_autodiag_engine/engine.py, operation by operation.
// The shared vectors in engine/vectors/cases.json must give identical results in
// both engines (`node --test engine/js` and `python -m pytest engine/python`).

export const ENGINE_VERSION = "1.0.0";

const STATUT_ORDRE = { applicable: 0, a_venir: 1, a_verifier: 2, a_surveiller: 3, non_applicable: 4 };
const COULEUR_ORDRE = { rouge: 0, orange: 1, bleu: 2, violet: 3, vert: 4, gris: 5 };
const SANS_OBJET = "sans_objet";
const DEFAUT_MASQUE = { booleen: false, nombre: 0, multi: [], choix: SANS_OBJET, texte: SANS_OBJET, departement: SANS_OBJET };
const MODES_SANS_ACTION = ["reflexion", "rien"];
const VIDES = ["", "nsp", "je_ne_sais_pas", "inconnu"];
const NOMBRE = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

// ------------------------------------------------------------------ utils
export function arrondi(x, n = 1) {
  const f = 10 ** n;
  return Math.floor(x * f + 0.5) / f;
}

function clean(v) {
  if (v === undefined) return null;
  if (typeof v === "string" && VIDES.includes(v.trim().toLowerCase())) return null;
  return v;
}

function toBool(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["oui", "vrai", "true", "1", "yes"].includes(s)) return true;
    if (["non", "faux", "false", "0", "no"].includes(s)) return false;
  }
  return null;
}

function toNum(v) {
  if (v === null || v === undefined || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.replace(/ /g, "").replace(/\u202f/g, "").replace(/\u00a0/g, "").replace(/,/g, ".");
    if (!NOMBRE.test(s)) return null;
    const x = Number(s);
    return Number.isFinite(x) ? x : null;
  }
  return null;
}

function equal(v, val) {
  if (typeof val === "boolean") {
    const b = toBool(v);
    return b === null ? null : b === val;
  }
  if (typeof val === "number") {
    const x = toNum(v);
    return x === null ? null : x === val;
  }
  return v === val;
}

function union(lists) {
  const out = [];
  for (const lst of lists) for (const x of lst) if (!out.includes(x)) out.push(x);
  return out;
}

function cmpKeys(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

function sortBy(arr, key) {
  return arr.sort((x, y) => cmpKeys(key(x), key(y)));
}

// ------------------------------------------------------------- conditions
export function evaluerCondition(cond, profil) {
  if ("toujours" in cond) return [true, []];
  if ("tous" in cond) {
    const res = cond.tous.map((c) => evaluerCondition(c, profil));
    if (res.some(([r]) => r === false)) return [false, []];
    if (res.some(([r]) => r === null)) return [null, union(res.filter(([r]) => r === null).map(([, m]) => m))];
    return [true, []];
  }
  if ("au_moins_un" in cond) {
    const res = cond.au_moins_un.map((c) => evaluerCondition(c, profil));
    if (res.some(([r]) => r === true)) return [true, []];
    if (res.some(([r]) => r === null)) return [null, union(res.filter(([r]) => r === null).map(([, m]) => m))];
    return [false, []];
  }
  if ("non" in cond) {
    const [r, m] = evaluerCondition(cond.non, profil);
    return r === null ? [null, m] : [!r, []];
  }
  return feuille(cond, profil);
}

function feuille(cond, profil) {
  const { champ, op } = cond;
  const v = profil[champ] === undefined ? null : profil[champ];
  if (op === "renseigne") return [v !== null && v !== SANS_OBJET, []];
  if (v === null) return [null, [champ]];
  const val = cond.valeur;
  if (op === "vrai" || op === "faux") {
    const b = toBool(v);
    if (b === null) return [null, [champ]];
    return [op === "vrai" ? b : !b, []];
  }
  if (op === "=" || op === "!=") {
    const eq = equal(v, val);
    if (eq === null) return [null, [champ]];
    return [op === "=" ? eq : !eq, []];
  }
  if ([">=", ">", "<=", "<"].includes(op)) {
    const x = toNum(v);
    if (x === null) return [null, [champ]];
    const y = Number(val);
    if (op === ">=") return [x >= y, []];
    if (op === ">") return [x > y, []];
    if (op === "<=") return [x <= y, []];
    return [x < y, []];
  }
  if (op === "entre") {
    const x = toNum(v);
    if (x === null) return [null, [champ]];
    return [Number(val[0]) <= x && x <= Number(val[1]), []];
  }
  if (op === "dans" || op === "hors") {
    const inside = val.includes(v);
    return [op === "dans" ? inside : !inside, []];
  }
  if (op === "contient") {
    const lst = Array.isArray(v) ? v : [v];
    return [lst.includes(val), []];
  }
  if (op === "contient_un") {
    const lst = Array.isArray(v) ? v : [v];
    return [val.some((x) => lst.includes(x)), []];
  }
  throw new Error(`opérateur inconnu : ${op}`);
}

// ---------------------------------------------------------------- profile
function copie(v) {
  return Array.isArray(v) ? [...v] : v;
}

export function normaliserProfil(bundle, profil) {
  const p = {};
  for (const [k, v] of Object.entries(profil || {})) p[k] = clean(v);
  const typ = p.type_repondant || "exploitant";
  p.type_repondant = typ;
  for (const etape of bundle.questionnaire.etapes) {
    const etapeVisible = (etape.public || [typ]).includes(typ);
    for (const champ of etape.champs) {
      const cle = champ.cle;
      let visible = etapeVisible && (champ.public || [typ]).includes(typ);
      if (visible && champ.afficher_si) [visible] = evaluerCondition(champ.afficher_si, p);
      if (visible === false) p[cle] = copie(DEFAUT_MASQUE[champ.type] === undefined ? null : DEFAUT_MASQUE[champ.type]);
      else if (!(cle in p)) p[cle] = null;
    }
  }
  return p;
}

// ------------------------------------------------------------------ dates
function parseISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}
function iso({ y, m, d }) {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function dernierJour(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function ajoutMois(date, n) {
  const k = date.m - 1 + n;
  const y = date.y + Math.floor(k / 12);
  const m = (((k % 12) + 12) % 12) + 1;
  return { y, m, d: Math.min(date.d, dernierJour(y, m)) };
}
function joursEntre(a, b) {
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}
function aujourdhui() {
  const t = new Date();
  return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
}
function prochaineAnnuelle(ref, mois, jour) {
  for (const y of [ref.y, ref.y + 1]) {
    const dernier = dernierJour(y, mois);
    const d = { y, m: mois, d: Math.min(jour ? jour : dernier, dernier) };
    if (iso(d) >= iso(ref)) return d;
  }
  throw new Error("inaccessible");
}
function prochaineMensuelle(ref, jour) {
  for (const n of [0, 1]) {
    const base = ajoutMois({ y: ref.y, m: ref.m, d: 1 }, n);
    const dernier = dernierJour(base.y, base.m);
    const d = { y: base.y, m: base.m, d: Math.min(jour ? jour : dernier, dernier) };
    if (iso(d) >= iso(ref)) return d;
  }
  throw new Error("inaccessible");
}

// ----------------------------------------------------------------- engine
function heuresManuel(ob, profil) {
  const t = ob.temps || {};
  let h = Number(t.heures_base ?? 0);
  const v = t.variable;
  if (v) {
    const x = toNum(profil[v.champ]);
    if (x !== null && x > 0) h = h + Number(v.heures_par_unite) * x;
    if (v.plafond !== undefined && v.plafond !== null) h = Math.min(h, Number(v.plafond));
  }
  return h;
}

export function evaluer(bundle, profil, modes, options) {
  options = options || {};
  const modesPropres = {};
  for (const [k, v] of Object.entries(modes || {})) if (v) modesPropres[k] = v;
  const params = bundle.parametres;
  const modeParId = Object.fromEntries(params.modes.map((m) => [m.id, m]));
  const modules = Object.fromEntries(bundle.modules.map((m) => [m.id, m]));
  const gains = params.temps.gain_ceres_par_couverture;
  const gainND = Number(params.temps.gain_ceres_modules_non_disponibles);
  const facteurInconnu = Number(params.temps.facteur_temps_mode_inconnu);
  const valeurHoraire = Number(options.valeur_horaire || params.temps.valeur_horaire_defaut_eur);
  const ref = options.date_reference ? parseISO(options.date_reference) : aujourdhui();
  const cal = params.calendrier;
  const fin = ajoutMois(ref, Number(cal.horizon_mois));

  const p = normaliserProfil(bundle, profil);
  const typ = p.type_repondant;

  const cartes = [];
  const tot = { actuelles: 0, nonCouvertes: 0, imm: 0, avenir: 0 };
  let horsPerimetre = 0;
  for (const ob of bundle.obligations) {
    if (!ob.public.includes(typ)) {
      horsPerimetre += 1;
      continue;
    }
    const [applique, manquants] = evaluerCondition(ob.applicabilite.condition, p);
    const alertes = [];
    for (const vg of ob.vigilance || []) {
      const [r] = evaluerCondition(vg.condition, p);
      if (r === true) alertes.push(vg.message);
    }
    const da = ob.date_application || null;
    let statut;
    if (applique === true) statut = da && da > iso(ref) ? "a_venir" : "applicable";
    else if (applique === false) statut = alertes.length ? "a_surveiller" : "non_applicable";
    else statut = "a_verifier";

    let mode = modesPropres[ob.id];
    if (!(mode in modeParId)) mode = null;
    const concernee = statut === "applicable" || statut === "a_venir";
    let couleur;
    if (concernee) couleur = mode ? modeParId[mode].couleur : "bleu";
    else if (statut === "a_verifier") couleur = "bleu";
    else if (statut === "a_surveiller") couleur = "violet";
    else couleur = "gris";

    let hMan = 0, hAct = 0, gImm = 0, gAvn = 0;
    const ceres = ob.ceres;
    if (concernee) {
      hMan = heuresManuel(ob, p);
      const facteur = mode ? Number(modeParId[mode].facteur_temps) : facteurInconnu;
      hAct = hMan * facteur;
      const base = MODES_SANS_ACTION.includes(mode) ? hMan : hAct;
      const gTot = Number(gains[ceres.couverture] ?? 0);
      const module = modules[ceres.module];
      if (module !== undefined && module.statut === "disponible") {
        gImm = base * gTot;
      } else {
        gImm = base * Math.min(gTot, gainND);
        gAvn = base * gTot - gImm;
      }
      tot.actuelles += hAct;
      if (MODES_SANS_ACTION.includes(mode)) tot.nonCouvertes += hMan;
      tot.imm += gImm;
      tot.avenir += gAvn;
    }

    cartes.push({
      id: ob.id,
      titre: ob.titre,
      domaine: ob.domaine,
      niveau: ob.origine.niveau,
      statut,
      couleur,
      mode,
      applicable: applique,
      manquants: statut === "a_verifier" ? manquants : [],
      alertes,
      date_application: da,
      module: ceres.module,
      couverture: ceres.couverture,
      heures_manuel: arrondi(hMan),
      heures_actuelles: arrondi(hAct),
      gain_immediat: arrondi(gImm),
      gain_a_venir: arrondi(gAvn),
    });
  }

  const calendrier = construireCalendrier(bundle, cartes, ref, fin, cal);
  sortBy(cartes, (c) => [STATUT_ORDRE[c.statut], COULEUR_ORDRE[c.couleur], c.id]);

  const compte = Object.fromEntries(Object.keys(COULEUR_ORDRE).map((k) => [k, 0]));
  for (const c of cartes) compte[c.couleur] += 1;
  const concernees = cartes.filter((c) => c.statut === "applicable" || c.statut === "a_venir");
  const couvertes = concernees.filter((c) => c.couleur === "vert");
  const priorites = sortBy(concernees.filter((c) => c.couleur === "rouge"), (c) => [-c.heures_manuel, c.id]);

  return {
    meta: {
      engine: ENGINE_VERSION,
      referentiel: bundle.version ?? null,
      date_reference: iso(ref),
      type_repondant: typ,
      hors_perimetre: horsPerimetre,
    },
    obligations: cartes,
    synthese: {
      compte,
      concernees: concernees.length,
      couvertes: couvertes.length,
      taux_couverture: concernees.length ? Math.floor((100 * couvertes.length) / concernees.length + 0.5) : null,
      modes_a_preciser: concernees.filter((c) => c.mode === null).length,
      priorites: priorites.map((c) => c.id),
      a_surveiller: cartes.filter((c) => c.statut === "a_surveiller").map((c) => c.id),
      a_verifier: cartes.filter((c) => c.statut === "a_verifier").map((c) => c.id),
    },
    temps: {
      heures_actuelles: arrondi(tot.actuelles),
      heures_non_couvertes: arrondi(tot.nonCouvertes),
      gain_immediat: arrondi(tot.imm),
      gain_a_venir: arrondi(tot.avenir),
      valeur_horaire: valeurHoraire,
      valeur_gain_immediat_eur: arrondi(tot.imm * valeurHoraire, 0),
      valeur_gain_total_eur: arrondi((tot.imm + tot.avenir) * valeurHoraire, 0),
    },
    calendrier,
    modules: listerModules(bundle, cartes),
    modules_essai: modulesEssai(bundle, cartes),
    champs_manquants: champsManquants(bundle, cartes),
  };
}

function construireCalendrier(bundle, cartes, ref, fin, cal) {
  const obligations = Object.fromEntries(bundle.obligations.map((ob) => [ob.id, ob]));
  const evenements = [];
  const continues = [];
  for (const c of cartes) {
    if (c.statut !== "applicable" && c.statut !== "a_venir") continue;
    const ob = obligations[c.id];
    const datesPonctuelles = new Set();
    let aUnEvenement = false;
    for (const ech of ob.echeances || []) {
      const rec = ech.recurrence;
      let approx = false;
      let d;
      if (rec === "annuelle" && ech.mois) {
        d = prochaineAnnuelle(ref, Number(ech.mois), ech.jour);
        approx = !ech.jour;
      } else if (rec === "mensuelle") {
        d = prochaineMensuelle(ref, ech.jour);
        approx = !ech.jour;
      } else if (rec === "ponctuelle" && ech.date) {
        d = parseISO(ech.date);
        datesPonctuelles.add(ech.date);
        if (iso(d) < iso(ref)) continue;
      } else {
        continue;
      }
      if (iso(d) > iso(fin)) continue;
      aUnEvenement = true;
      evenements.push(evenement(c, ech.libelle, rec, d, ref, cal, approx));
    }
    const da = c.date_application;
    if (c.statut === "a_venir" && da && !datesPonctuelles.has(da) && da <= iso(fin)) {
      aUnEvenement = true;
      evenements.push(evenement(c, "Entrée en application", "ponctuelle", parseISO(da), ref, cal, false));
    }
    if (!aUnEvenement) continues.push(c.id);
  }
  sortBy(evenements, (e) => [e.date, e.obligation, e.libelle]);
  continues.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return { debut: iso(ref), fin: iso(fin), evenements, continues };
}

function evenement(carte, libelle, rec, d, ref, cal, approx) {
  const jours = joursEntre(ref, d);
  let urgence;
  if (jours <= Number(cal.urgent_jours)) urgence = "urgent";
  else if (jours <= Number(cal.proche_jours)) urgence = "proche";
  else urgence = "normal";
  return {
    date: iso(d),
    jours,
    obligation: carte.id,
    titre: carte.titre,
    libelle,
    recurrence: rec,
    urgence,
    approx,
    couleur: carte.couleur,
  };
}

function listerModules(bundle, cartes) {
  const parModule = new Map();
  for (const m of bundle.modules) {
    parModule.set(m.id, { id: m.id, nom: m.nom, statut: m.statut, obligations: [], rouges: 0, _imm: 0, _avn: 0 });
  }
  for (const c of cartes) {
    if (!["applicable", "a_venir", "a_verifier"].includes(c.statut) || c.couverture === "aucune") continue;
    const m = parModule.get(c.module);
    if (m === undefined) continue;
    m.obligations.push(c.id);
    m._imm += c.gain_immediat;
    m._avn += c.gain_a_venir;
    if (c.couleur === "rouge") m.rouges += 1;
  }
  const out = [];
  for (const m of parModule.values()) {
    if (!m.obligations.length) continue;
    const { _imm, _avn, ...rest } = m;
    rest.gain_immediat = arrondi(_imm);
    rest.gain_a_venir = arrondi(_avn);
    rest.obligations.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    out.push(rest);
  }
  return sortBy(out, (m) => [-(m.gain_immediat + m.gain_a_venir), -m.rouges, m.id]);
}

function modulesEssai(bundle, cartes) {
  const modules = Object.fromEntries(bundle.modules.map((m) => [m.id, m]));
  const actifs = bundle.modules.filter((m) => m.toujours_actif).map((m) => m.id);
  for (const c of cartes) {
    if ((c.statut === "applicable" || c.statut === "a_venir") && c.couverture !== "aucune") {
      const m = modules[c.module];
      if (m !== undefined && m.statut === "disponible" && !actifs.includes(m.id)) actifs.push(m.id);
    }
  }
  for (let i = 0; i < actifs.length; i++) {
    for (const dep of modules[actifs[i]].requiert || []) {
      if (!actifs.includes(dep) && dep in modules && modules[dep].statut === "disponible") actifs.push(dep);
    }
  }
  const ordre = bundle.modules.map((m) => m.id);
  return actifs.sort((a, b) => ordre.indexOf(a) - ordre.indexOf(b));
}

function champsManquants(bundle, cartes) {
  const questions = {};
  for (const e of bundle.questionnaire.etapes) for (const f of e.champs) questions[f.cle] = f;
  const champs = new Map();
  for (const c of cartes) {
    for (const champ of c.manquants) {
      if (!champs.has(champ)) champs.set(champ, []);
      champs.get(champ).push(c.id);
    }
  }
  const out = [...champs.entries()].map(([k, v]) => ({
    champ: k,
    question: (questions[k] && questions[k].question) || k,
    obligations: v.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
  }));
  return sortBy(out, (x) => [-x.obligations.length, x.champ]);
}
