// Mesure d'audience Arpent, sans cookie ni tiers.
// Envoie un événement anonyme à notre propre API. Aucun identifiant n'est stocké
// dans le navigateur, l'empreinte visiteur est calculée côté serveur et change
// chaque jour : aucun suivi dans le temps n'est possible, donc pas de bandeau.
(function () {
  var API = 'https://api.arpent-lab.ai/api/v1/events';
  var source = (function () {
    try {
      var p = new URLSearchParams(location.search);
      var utm = p.get('utm_source') || p.get('source');
      if (utm) return utm.slice(0, 64);
      if (!document.referrer) return 'direct';
      var h = new URL(document.referrer).hostname.replace(/^www\./, '');
      return h === location.hostname ? 'interne' : h.slice(0, 64);
    } catch (_) { return 'direct'; }
  })();

  function envoyer(etape) {
    try {
      var corps = JSON.stringify({ etape: etape, source: source });
      // sendBeacon survit à la fermeture de l'onglet, fetch est le repli.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API, new Blob([corps], { type: 'application/json' }));
      } else {
        fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                     body: corps, keepalive: true }).catch(function () {});
      }
    } catch (_) { /* la mesure ne doit jamais casser la page */ }
  }

  window.arpentMesure = envoyer;
  envoyer(document.body.getAttribute('data-etape') || 'vue_site');

  // Intérêt pour le contact : premier focus dans le formulaire.
  var form = document.getElementById('contact-form');
  if (form) {
    var vu = false;
    form.addEventListener('focusin', function () {
      if (!vu) { vu = true; envoyer('clic_contact'); }
    });
    form.addEventListener('submit', function () { envoyer('lead_envoye'); });
  }
})();
