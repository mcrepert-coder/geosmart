# Feuille de route GeoSmart Field (version corrigee, 20 octobre 2026)

Cette version remplace le planning de la proposition initiale. Elle tient compte de ce qui n'est pas encore acquis : les fonds ne sont pas debloques, Confluences ne verse aucun argent aux etudiants (tout passe par devis puis facture a l'ordre de Ambassade de France / SCAC, plafond 450 000 FCFA), chaque etudiant prepare ses propres outils de travail sans que Confluences les finance, la TVA de 18 % s'ajoute aux achats, le materiel GNSS coute presque deux fois plus que prevu, et l'inscription Oracle a ete refusee.

Principe : on avance sur tout ce qui ne depend pas d'un achat, et on lance le developpement des que les conditions sont reunies. Le logiciel ne depend pas du recepteur GNSS : seule la mesure de precision (CA-1) en depend.

## Etat des conditions

| Condition | Etat | Qui |
|---|---|---|
| Validation du projet par l'entreprise (LGR) | En cours | Koffi |
| Budget Confluences (devis a l'ordre de Ambassade de France / SCAC, accord de principe, plafond 450 000 FCFA) : materiel GNSS et transport par un prestataire | Deux devis prepares : materiel 354 000 FCFA TTC, transport 94 400 FCFA TTC, total 448 400 FCFA TTC | Koffi |
| Outils de travail de chaque etudiant (poste, logiciels, comptes personnels ; non finances par Confluences, aucun versement aux etudiants) | A organiser par chacun, mode de soutien a decider par LGR | chaque etudiant, Koffi |
| Prix reels du materiel GNSS, avec TVA | A recueillir (factures proforma) | Koffi |
| Hebergement du serveur (Oracle refuse) | A choisir (machine louee ou autre) | Koffi, avec Marrich |
| Depot GitHub et noms d'utilisateur | A faire cette semaine | Koffi et les 4 etudiants |

## Phase 0 - Preparation (maintenant, sans cout)

Duree : jusqu'a ce que chacun dispose de ses outils de travail. Tout le monde peut avancer.

- Chaque etudiant cree son compte GitHub et envoie son nom d'utilisateur.
- Chacun installe Git, Android Studio, JDK 17, Node.js 20 et Docker.
- Chacun lit `docs/CAHIER-DES-CHARGES.md`, `docs/RESPONSABILITES.md` et `docs/WORKFLOW-GIT.md`.
- Marrich cree le squelette du depot et la CI (jalon J0) : ce travail ne demande aucun achat.
- Chacun ecrit a la main une premiere version du contrat de son module (`contracts/<module>.yaml`), sur papier ou dans un fichier : routes, roles, erreurs.
- Koffi reunit les devis proforma avec TVA et choisit l'hebergement.

Resultat attendu : depot en place, contrats ecrits, ordinateurs prets, aucun jour perdu quand les outils de chacun sont prets.

## Phase 1 - Developpement (2 jours, des que chacun est equipe)

Condition : les quatre etudiants ont chacun leurs outils de travail pret. Sans cela, ne pas commencer : le travail se fait en parallele et chacun a besoin de son propre poste et de ses propres comptes.

| Moment | Livrable verifiable | Qui |
|---|---|---|
| Jour 1 matin | Squelette qui compile, CI verte, contrats fusionnes ; Beni publie `@Roles` | Marrich, tous |
| Jour 1 apres-midi | Chaque brique avec des donnees simulees pour les voisins : comptes et admin, bornes locales, parcelle et chevauchement, biens et annonces | tous |
| Jour 2 matin | Assemblage sur l'API reelle : synchronisation, attestation PDF, site web, visites et baux | tous, Marrich integre |
| Jour 2 apres-midi | Recette CA-2 a CA-7 en tests automatiques, APK de test, serveur lance en local, `docs/RECETTE.md` | Marrich pilote, Koffi verifie |

Priorite des livrables en cas de retard (le revenu vient de l'immobilier) :
1. Comptes, validation des agents, publication d'un bien, recherche, partage WhatsApp.
2. Foncier : parcelle, chevauchement refuse, statut avant achat.
3. Terrain : lecture NMEA simulee, bornes locales, synchronisation.
4. Location : visites, etats des lieux, baux.

## Phase 2 - Verification et demonstration

Duree : quelques jours apres la phase 1.
- Koffi examine sur GitHub chaque PR et la recette.
- Correction des ecarts. Version de demonstration (APK et serveur local).
- Mise a jour de `docs/RECETTE.md` avec ce qui marche et ce qui reste.

## Phase 3 - Materiel et mesure reelle

Condition : recepteur GNSS achete (prix reels et TVA connus).
- Romuald rejoue CA-1 : 10 mesures d'une borne connue, ecart inferieur a 2 cm en RTK Fixed.
- Le prototype utilise un seul recepteur UM982 qui recoit les corrections par Internet (NTRIP), sans station de reference propre.
- A verifier avant l'achat : qu'un service de corrections NTRIP couvre Lome. Sinon, prevoir une station de reference.

## Phase 4 - Mise en ligne et suite

Hors des deux jours, a decider par LGR :
- Hebergement HTTPS (le build de production refuse le HTTP).
- Fournisseur SMS reel pour le code de verification et les rappels de visite.
- Paiement mobile Flooz et T-Money (Mixx by Yas) pour les loyers.
- Donnees foncieres officielles ou zone pilote levee par l'equipe.
- Zones inondables, seulement si une source fiable existe.
- Modele economique de l'immobilier (commission, abonnement des agents, mise en avant) : a definir avant toute mise en vente.

## Risques et parades

| Risque | Parade |
|---|---|
| Fonds en retard | La phase 0 se fait sans argent ; aucun jour de developpement n'est declenche avant que chacun soit equipe |
| TVA non prevue au budget | Toutes les demandes en TTC, sur facture proforma |
| Materiel plus cher | Developper avec le simulateur ; echelonner l'achat |
| Aucun service de corrections NTRIP a Lome | Verifier avant l'achat ; sinon ajouter une station de reference |
| Comptes partages entre etudiants | Interdit : un compte personnel par personne |
| Pas de serveur en ligne | La recette se fait en local ; l'hebergement est une decision de la phase 4 |
| Un etudiant bloque | Issue GitHub sous 24 h ; Marrich arbitre, Koffi tranche |
