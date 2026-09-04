# Arpent — landing commerciale

Landing statique française d’Arpent Lab.

## Positionnement

Arpent conçoit des IA spécialisées pour une tâche métier précise et en mesure la valeur avant mise en production. La page présente :

- la doctrine de preuve ;
- les trois offres de services ;
- la méthode Arpenter → Mesurer → Prouver → Déployer ;
- Ceres, premier produit et banc d’essai de la méthode ;
- les fondateurs et les canaux de contact.

## Exécution locale

Depuis ce dossier :

```powershell
python -m http.server 8080 --bind 127.0.0.1
```

Puis ouvrir `http://127.0.0.1:8080/`.

Aucun build ni dépendance front-end n’est requis.

## Fichiers

- `index.html` — contenu, sémantique et interactions minimales ;
- `assets/arpent.css` — système visuel responsive ;
- `assets/arpent-logo-brandbook.png` — logo officiel recadré depuis le brand book fourni ;
- `assets/ceres-demo.css` — ancien composant de démonstration conservé mais non chargé.

## Contacts

La page n’affiche pas de faux formulaire. Les CTA finaux ouvrent les profils LinkedIn des fondateurs ; le brief de départ peut être copié localement dans le presse-papiers.

## Statut

Prototype commercial prêt à revue. Le domaine, l’adresse email société et l’hébergement de production restent à brancher lorsque les décisions correspondantes sont prises.
