# GeoSim — simulateur de géolocalisation de flotte

Simulateur web de véhicules géolocalisés pour les démonstrations de salle de contrôle.
Pompiers, police, SAMU, bus, taxis, livraisons et dépanneuses circulent **sur les vraies routes** de la ville choisie.

100 % statique : aucun serveur, aucune clé d'API. Hébergeable tel quel sur GitHub Pages.

> Aussi dans ce dépôt : **[Atelier Planning](atelier-planning/)**, planning et suivi de commandes pour menuisier / cuisiniste (application Node.js, voir son README).
>
> Autre démonstrateur dans ce dépôt : **[Barco Power Solutions](barco-power/)**, une salle de contrôle de parc éolien en mer et solaire européen (`/barco-power/`, avec sa régie `/barco-power/regie.html`).

## Fonctions

- **N'importe quelle ville** : recherche libre (OpenStreetMap / Nominatim) et raccourcis (Paris, Lyon, Marseille…).
- **Vraies bases** : les casernes, commissariats et hôpitaux de la ville sont récupérés automatiquement (bases simulées si aucune n'est trouvée).
- **Comportements par métier**
  - Pompiers et SAMU attendent en caserne ou à l'hôpital, partent en urgence (gyrophare), restent sur place puis rentrent.
  - Police et dépanneuses patrouillent.
  - Bus : lignes en boucle avec arrêts voyageurs et terminus.
  - Taxis et livraisons : courses et tournées avec arrêts clients.
- **Incidents** : cliquez sur la carte pour en créer un (incendie, accident, secours à personne, agression, cambriolage, panne). Les moyens les plus proches sont engagés automatiquement. Il existe aussi des incidents aléatoires automatiques.
- **Statuts** : disponible, en service, en intervention, sur place, retour base, hors service. Ils sont affichés en compteurs dans la barre du haut (cliquez sur un compteur pour filtrer).
- **Télémétrie et alertes** : vitesse, cap, carburant, compteur kilométrique, excès de vitesse, arrêt prolongé, carburant bas, panne moteur (une dépanneuse est envoyée).
- **Contrôle du temps** : pause, ×1, ×2, ×5, ×10, ×30.

## Raccourcis clavier

| Touche | Action |
|---|---|
| `Espace` | Pause / lecture |
| `1` à `5` | Vitesse ×1, ×2, ×5, ×10, ×30 |
| `I` | Incident aléatoire |
| `F` | Suivre le véhicule sélectionné |
| `Échap` | Fermer la fiche véhicule |

## Lien de démo direct

Ajoutez des paramètres à l'URL pour lancer une ville directement :

```
https://<votre-compte>.github.io/<depot>/?ville=Bordeaux&vitesse=10
```

La dernière ville et la composition de la flotte sont mémorisées dans le navigateur.

## Mise en ligne sur GitHub Pages

1. Créez un dépôt sur GitHub (par exemple `geosim`).
2. Envoyez-y les fichiers de ce dossier :

```bash
git init && git add . && git commit -m "GeoSim" && git branch -M main
```

```bash
git remote add origin https://github.com/<votre-compte>/geosim.git && git push -u origin main
```

3. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, branche `main`, dossier `/ (root)`.
4. Après une minute environ, le site est en ligne à `https://<votre-compte>.github.io/geosim/`.

## Tester en local

```bash
python3 -m http.server 8000
```

Puis ouvrez http://localhost:8000.

## Services utilisés

Ce sont des services publics gratuits, prévus pour un usage modéré comme une démo :

- Fond de carte : © contributeurs OpenStreetMap (le thème sombre est un filtre CSS appliqué aux tuiles OSM).
- Recherche de ville et des bases : Nominatim.
- Itinéraires : OSRM (`router.project-osrm.org`, avec `routing.openstreetmap.de` en secours). Les requêtes sont espacées. Si le service ne répond pas, le véhicule suit un trajet en ligne droite, signalé comme « trajet approximatif ».

Pour une flotte importante ou un usage intensif, remplacez les URL de `CONFIG.routers` dans `js/app.js` par votre propre serveur OSRM.

## Personnalisation

Tout est dans le haut de `js/app.js` :

- `TYPES` : types de véhicules (icône, couleur, vitesses, limite, consommation, indicatifs, nombre par défaut).
- `INCIDENTS` : types d'incidents, moyens nécessaires et durée sur place.
- `CONFIG.cityChips` : villes proposées en raccourci.
