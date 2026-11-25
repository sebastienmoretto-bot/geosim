# Barco Power Solutions — salle de contrôle énergies renouvelables

Démonstrateur de supervision d'un parc européen d'éoliennes en mer et de centrales solaires, pensé pour tourner en boucle sur un mur d'images en 16:9.

Les sites sont réels (positions et capacités approximatives) ; **toutes les données d'exploitation sont simulées**. « Barco Power Solutions » est une marque fictive de démonstration.

100 % statique : aucun serveur, aucune clé d'API. Leaflet est inclus dans `vendor/` ; seuls le fond de carte (CARTO) et les polices (Google Fonts) viennent d'Internet.

## Les deux pages

| Page | Adresse | Rôle |
|---|---|---|
| Écran principal | `…/barco-power/` | Carte, tableaux de bord, incidents. À afficher en plein écran (F11). |
| Régie | `…/barco-power/regie.html` | Déclenche scénarios et incidents sans toucher l'écran principal. |

La régie et l'écran principal doivent être ouverts **dans le même navigateur, sur le même ordinateur** (deux fenêtres, ou deux écrans). Ils communiquent par `BroadcastChannel`, sans serveur. Le bouton « Régie » de l'écran principal (ou la touche `R`) ouvre la régie dans une fenêtre séparée. Le voyant en haut de la régie indique si l'écran principal répond.

## Écran principal

- **Carte** : solaire à gauche, éolien à droite, carte de l'Europe au centre.
  - Vue Europe : chaque site est un anneau dont le remplissage indique le facteur de charge, avec une pastille d'alarme.
  - En zoomant sur un site, on voit chaque éolienne (pales animées selon la vitesse du rotor, couleur selon l'état), les câbles inter-éoliennes, le câble d'export, le poste en mer, le port de maintenance ; pour le solaire, chaque poste onduleur.
  - Fiche site : production, facteur de charge, vent ou ensoleillement, disponibilité, énergie et revenu du jour, courbe 24 h réelle et prévue, état de chaque unité.
  - Fiche unité : télémétrie (vent nacelle, rotor, pas, températures, vibrations ; ou irradiance, puissance DC/AC, rendement, températures).
  - Navires de transfert et équipes terrain animés vers les incidents, tempêtes et passages nuageux qui se déplacent sur la carte.
  - Journal d'exploitation en bas, notifications pour les alarmes majeures et critiques.
- **Tableaux de bord** : production 24 h et prévision 6 h, mix, énergie par pays, prix spot, classement des sites, disponibilité par site, incidents sur 7 jours et par type, indicateurs d'exploitation (MTTR, équipes mobilisées…).
- **Incidents** : liste filtrable, fiche détaillée avec étapes (nouveau → acquitté → équipe en route → sur site → intervention → résolu), puissance indisponible, main courante, actions opérateur.

## Fonctionnement autonome

Par défaut, la simulation vit seule toute la journée :

- incidents aléatoires (défaut convertisseur, survitesse, foudre, givrage, câble inter-éoliennes, câble d'export, intrusion, défaut onduleur, départ de feu, grêle, encrassement, poste de livraison, bridage réseau, maintenance…) ;
- tempêtes et passages nuageux aléatoires ; les éoliennes s'arrêtent au-dessus de 25 m/s et redémarrent sous 21 m/s ;
- traitement automatique des incidents : acquittement, envoi de l'équipe la plus proche, intervention, résolution ;
- production éolienne et solaire calculée selon le vent, la position du soleil (heure et date réelles) et la nébulosité.

Les opérations (déplacements, interventions, tempêtes) sont accélérées pour rester lisibles en démonstration : un incident dure quelques minutes.

## Régie

- **Affichage** : changer d'onglet, vue Europe, zoomer sur un site, visite automatique (enchaîne carte, sites, tableaux de bord, incidents ; elle se met en pause 90 s dès qu'on touche l'écran principal), zoom automatique sur les alarmes critiques.
- **Temps** : pause, ×1 à ×300, sauter à 8 h, midi, 16 h, 19 h ou la nuit.
- **Mode automatique** : fréquence des événements (arrêt, calme, normal, intense), traitement automatique des incidents.
- **Scénarios** : tempête mer du Nord, Manche, Atlantique, golfe du Lion ; passage nuageux ; vague de chaleur ; bridage réseau France ; série de défauts ; coupure du câble d'export d'un parc ; défaut du poste de livraison d'une centrale ; incident aléatoire ; retour au calme.
- **Incident ciblé** : site, type, unité, sévérité et description au choix.
- **Incidents actifs** : afficher, acquitter, engager une équipe, clôturer.
- Réinitialisation complète de la simulation.

## Raccourcis clavier (écran principal)

| Touche | Action |
|---|---|
| `Espace` | Pause / lecture |
| `1` à `4` | Vitesse ×1, ×10, ×60, ×300 |
| `C` / `D` / `A` | Onglet Carte / Tableaux de bord / Incidents |
| `E` | Vue Europe |
| `N` | Créer un incident |
| `I` | Incident aléatoire |
| `T` | Visite automatique |
| `R` | Ouvrir la régie |
| `Échap` | Fermer la fiche |

## Paramètres d'URL

```
…/barco-power/?visite=1&activite=intense&heure=12&onglet=dash
```

- `visite=1` : démarre la visite automatique.
- `activite=off|calme|normal|intense` : fréquence des événements aléatoires.
- `heure=12` : place l'horloge de simulation à cette heure (heure de Paris).
- `vitesse=10` : vitesse de simulation.
- `onglet=map|dash|inc` : onglet affiché au démarrage.

## Tester en local

Depuis la racine du dépôt :

```bash
python3 -m http.server 8000
```

Puis ouvrez http://localhost:8000/barco-power/ et http://localhost:8000/barco-power/regie.html.

## Personnalisation

- `js/data.js` : sites (position, nombre d'unités, puissance unitaire, port), types d'incident, trajectoires de tempête.
- `js/sim.js` : modèles de vent, d'ensoleillement et de prix, fréquence des événements aléatoires (`ACT`), compression du temps des opérations (`OPS_SCALE`).
- `css/style.css` : couleurs (variables en tête de fichier).

## Crédits

Fond de carte © contributeurs OpenStreetMap © CARTO. Bibliothèque cartographique Leaflet (licence BSD-2, voir `vendor/leaflet/LICENSE`).
