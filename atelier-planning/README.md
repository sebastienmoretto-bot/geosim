# Atelier Planning

Planning, suivi de commandes et rappels pour menuisier, agenceur, ébéniste ou cuisiniste.

**Le principe** : un devis validé (PDF) entre dans l'outil. Il en extrait la main-d'œuvre et les heures, qu'on ajuste au besoin. L'outil calcule ensuite :

- **quand commander** chaque poste (panneaux, façades, plan de travail, électroménager…), d'après les délais fournisseurs ;
- **quand fabriquer**, selon la capacité réelle de l'atelier ;
- **quand poser** chez le client.

Il prévient aussi le client par **WhatsApp** à J-7, 48 h et 24 h avant la pose.

## Fonctions

| | |
|---|---|
| **Import de devis** | Dépôt d'un PDF : n° de devis, client, téléphone, total HT. Main-d'œuvre **fabrication** et **pose** séparées, heures (lues dans le devis ou estimées via le taux horaire). Postes à commander détectés par mots-clés. Tout reste modifiable avant validation. |
| **Planning** | Deux modes : **au plus tôt** (l'outil propose la date de pose) ou **date de pose fixée** (calcul à rebours des dates de commande et de fabrication). Prend en compte les délais de livraison, une marge (buffer), la capacité atelier (heures/jour par personne, jours travaillés), les congés, les fermetures et les jours fériés français. |
| **Commandes** | Liste « à commander / en retard / commandées / reçues ». Boutons « Commandé » et « Reçu » ; la date de livraison annoncée par le fournisseur est reprise dans le planning. |
| **Rappels** | Tableau de bord : commandes en retard, à passer sous 7 jours, livraisons attendues, poses à venir, alertes de planning, tâches à échéance. |
| **Objectifs** | CA signé, main-d'œuvre signée, heures planifiées, nombre de poses, ou suivi manuel, sur une période. |
| **WhatsApp** | Rappels de rendez-vous configurables (J-7, 48 h, 24 h par défaut), plage horaire d'envoi, mode test. Les réponses « Je confirme » / « Je souhaite décaler » mettent à jour le rendez-vous. |
| **Écran atelier** | Page plein écran pour une TV ou une tablette : aujourd'hui, 2 semaines de planning avec la charge de chaque jour, poses, livraisons, commandes en retard. Rafraîchie chaque minute, accessible par un lien à clé, sans connexion. |
| **Équipe** | Comptes avec rôles : administrateur, bureau, atelier, poseur. |

## Démarrage rapide (test)

Il faut Node.js 22.13 ou plus récent.

```bash
cd atelier-planning
npm install
npm run demo     # optionnel : données d'exemple (compte demo@atelier.local / demo1234)
npm start        # http://localhost:3000
```

Sans `npm run demo`, le premier lancement demande de créer le compte administrateur.

Un devis PDF d'exemple se trouve dans `exemples/devis-exemple.pdf` (régénérable avec `npm run sample-pdf`).

Tests : `npm test`.

## Installation sur le serveur local (Docker)

```bash
cd atelier-planning
cp .env.example .env      # puis compléter les identifiants WhatsApp
docker compose up -d --build
```

- L'application est alors sur `http://<ip-du-serveur>:3000` depuis tous les postes, tablettes et téléphones du réseau local.
- Les données (base SQLite + PDF des devis) sont dans `./data`.
- **Sauvegarde** : copier régulièrement le dossier `data/`, par exemple avec une tâche planifiée ou la sauvegarde du NAS.
- Mise à jour : `git pull && docker compose up -d --build`.

L'écran atelier s'ouvre depuis **Réglages › Écran atelier** (lien avec clé). Ajoutez `&theme=clair` à l'adresse pour un fond clair.

## Configurer WhatsApp (API officielle Meta)

1. Créer un compte **Meta Business** et une app de type « Business » sur developers.facebook.com, puis y ajouter le produit **WhatsApp**.
2. Enregistrer un **numéro dédié** : il ne doit pas être utilisé en parallèle dans l'application WhatsApp du téléphone.
3. Créer un **utilisateur système** avec un **jeton permanent** (droits `whatsapp_business_messaging`). Mettre le jeton dans `WHATSAPP_TOKEN` et l'identifiant du numéro dans `WHATSAPP_PHONE_NUMBER_ID` (fichier `.env`).
4. Créer et faire valider les **modèles de message** (catégorie « Utilitaire », langue français), un par rappel : `rappel_pose_j7`, `rappel_pose_48h`, `rappel_pose_24h`. Les noms se changent dans Réglages › WhatsApp. Texte conseillé, avec 4 variables :
   > Bonjour {{1}}, nous vous rappelons l'installation prévue le {{2}} à {{3}} par {{4}}. Merci de confirmer votre disponibilité.

   Variables : {{1}} nom du client, {{2}} date (« mardi 3 décembre »), {{3}} heure (« 08h00 »), {{4}} nom de l'entreprise. Ajoutez deux boutons de réponse rapide : « Je confirme » et « Je souhaite décaler ».
5. Pour recevoir les réponses et les accusés de lecture, déclarer le **webhook** `https://<adresse-publique>/webhook/whatsapp` avec le jeton `WHATSAPP_VERIFY_TOKEN`, et s'abonner au champ `messages`. Renseignez aussi `WHATSAPP_APP_SECRET` pour que le serveur vérifie la signature de Meta.
   Le serveur étant local, il faut une adresse publique en HTTPS : par exemple Cloudflare Tunnel, ou un reverse proxy avec un nom de domaine. **N'exposez que le chemin `/webhook/whatsapp`**, pas toute l'application.
6. Dans **Réglages › WhatsApp**, décocher le **mode test**.

Sans webhook, les rappels partent quand même ; seules les réponses des clients ne remontent pas.

Tant que le mode test est actif ou que les identifiants manquent, les messages sont **simulés** : ils apparaissent comme « Simulé (test) » dans le journal, mais rien n'est envoyé aux clients.

Coût : Meta facture les messages « utilitaires » à l'unité, quelques centimes en France (voir la grille tarifaire WhatsApp Business).

## Comment le planning est calculé

- **Délais de livraison** : en jours calendaires, comme les annoncent les fournisseurs. Valeur par défaut par poste dans Réglages › Postes de commande, modifiable projet par projet.
- **Nécessaire pour « fabrication » ou « pose »** : les panneaux et la quincaillerie doivent être là pour fabriquer ; les façades, le plan de travail et l'électroménager seulement pour la pose.
- **Marge livraisons** : jours ouvrés entre la réception et le besoin (2 par défaut).
- **Marge avant pose** : jours ouvrés entre la fin de fabrication et la pose (1 par défaut).
- **Fabrication** : les heures sont réparties jour par jour sur la capacité **restante** de l'atelier, en tenant compte des autres projets déjà planifiés. La capacité est la somme des heures/jour des personnes « atelier » qui travaillent ce jour-là.
- **Au plus tôt** : tout est commandé dès la validation, la pose tombe au premier jour possible. Une fois la date convenue avec le client, cliquer sur **« Fixer cette date avec le client »**.
- **Date fixée** : l'outil calcule à rebours la date limite de chaque commande et alerte si une commande aurait déjà dû partir ou si la capacité ne suffit pas.
- Les heures déjà planifiées sur des jours passés sont conservées lors d'un recalcul ; seul le reste est replanifié.
- Les rappels WhatsApp suivent la date de pose : si elle change, les messages non partis sont recalculés. Un rappel dont l'échéance est déjà passée au moment de la planification n'est pas envoyé en retard.

## Lecture des devis PDF

L'extraction est générique : elle repère les lignes contenant des mots-clés (« main d'œuvre », « fabrication », « pose », « installation »…) et prend le montant en fin de ligne. Les mots-clés se règlent dans **Réglages › Général**.

Un PDF scanné (image) ne contient pas de texte : dans ce cas, on saisit les valeurs à la main. Pour fiabiliser l'extraction sur le logiciel de devis réellement utilisé, il suffit de fournir un ou deux devis anonymisés.

## Architecture

- `server/` : Node.js + Express. Base SQLite intégrée à Node (`node:sqlite`), aucune base externe.
  - `planning.js` : moteur de planning (fonctions pures, testées) ;
  - `quoteParser.js` : extraction des devis ;
  - `whatsapp.js` et `scheduler.js` : envoi des rappels, vérifiés chaque minute ;
  - `app.js` : API REST.
- `public/` : interface web en JavaScript sans framework ni étape de compilation. `atelier.html` est l'écran mural.
- `test/` : tests (`node --test`).
