# Cahier des charges - GeoSmart Field (version equipe)

Version 2.0 - 20 octobre 2026. Remplace la proposition initiale des etudiants. Valide par : LGR (ASSOGBA Koffi Ezechiel). Encadrant pedagogique : M. Gédéon AMOUSSOU.
Chaque exigence porte un numero (EF = fonctionnelle, RG = regle de gestion, CA = critere d'acceptation). Une exigence n'est "faite" que si son test automatique passe.

## 1. Contexte

Le foncier togolais releve de l'ANDF (Agence Nationale du Domaine et du Foncier). Les doubles ventes de terrains, les levés imprecis et les faux agents immobiliers detruisent la confiance. GeoSmart Field est un outil d'aide a la securisation : il mesure au centimetre, empeche d'enregistrer deux fois la meme terre, et rend les annonces verifiables. Il seconde l'Etat sans s'y substituer.

## 2. Objectifs mesurables

1. Mesurer une borne avec un ecart inferieur a 2 cm en RTK Fixed (CA-1).
2. Refuser 100 % des parcelles qui chevauchent une parcelle connue (CA-2).
3. Ne perdre aucune donnee lors d'une coupure reseau (CA-3).
4. Empecher toute publication par un faux agent ou un client (CA-4, CA-5).

## 3. Acteurs et roles

Un compte a un seul role, attribue par l'administrateur (RG-06).

| Role | Peut | Ne peut pas |
|---|---|---|
| Administrateur | Valider ou rejeter les comptes, attribuer le role, voir le journal, suspendre | Modifier une limite de parcelle |
| Geometre | Lever, creer et modifier les parcelles dont il est l'auteur, emettre l'attestation s'il est inscrit a l'Ordre | Publier une annonce |
| Topographe | Ajouter des points aux chantiers qui lui sont assignes | Creer une parcelle, emettre une attestation |
| Agent immobilier | Publier des biens (apres validation), organiser des visites, gerer des baux, demander un leve | Modifier une limite |
| Client | Consulter parcelles et annonces, demander une visite | Publier, modifier |

Statuts de certification : "geometre inscrit" ou "geometre non inscrit" ; "agent certifie" ou "agent non certifie". Les levés d'un geometre non inscrit portent la mention "non certifie" et ne donnent pas d'attestation.
Etat d'un compte : telephone non verifie -> en attente -> actif / rejete / suspendu.

## 4. Exigences fonctionnelles

### Module 1 - Socle GNSS, application de terrain et carte (Romuald)
- EF-101 Appairage Bluetooth SPP (BLE GATT en option) avec un recepteur GNSS, reconnexion automatique.
- EF-102 Lecture NMEA (GGA, RMC, GSA, GSV) avec controle de somme.
- EF-103 Affichage position, qualite (Fixed / Float / autonome), satellites, PDOP, HDOP, VDOP.
- EF-104 Client NTRIP (corrections RTCM 3.x par 4G) avec reconnexion ; mot de passe du caster chiffre. Le prototype utilise un seul recepteur UM982 qui recoit les corrections par Internet, sans station de reference propre.
- EF-105 Fonctionne avec tout recepteur NMEA/RTCM (changement de source a chaud).
- EF-106 Chaque borne est enregistree d'abord en local (base SQLite), avec precision, satellites, PDOP, horodatage.
- EF-107 Calcul de distances, perimetre, surface (projection UTM zone 31N).
- EF-108 Generation locale d'un plan PDF du leve.
- EF-109 Chantiers : creation, assignation d'un topographe, suivi.
- EF-406 Carte des parcelles coloree par statut, avec filtres.

### Module 2 - Foncier, journal et verification publique (Samuel)
- EF-201 Creation d'une parcelle a partir de bornes : au moins 3 sommets, pas d'auto-intersection.
- EF-202 Controle de chevauchement cote serveur (PostGIS) ; refus 409 et alerte (RG-02).
- EF-203 Statut juridique : titre, coutumier non titre, en litige.
- EF-204 Attestation de leve en PDF : numero, surface, perimetre, bornes, version, date, geometre, empreinte SHA-256 du polygone, mention "Ne vaut pas titre foncier". Pas de QR code.
- EF-205 Versions de parcelle et journal infalsifiable (chaque ligne contient l'empreinte de la precedente).
- EF-206 Consultation du statut avant achat par identifiant de parcelle ; copie locale pour le mode hors ligne.
- EF-207 Demandes de leve emises par les agents, prises par un geometre.
- EF-208 Bornage contradictoire : voisins presents, horodatage et photos a la creation.

### Module 3 - Annonces et site web (Marrich)
- EF-301 Un bien (terrain ou maison) est rattache a une parcelle ; publication reservee aux agents actifs (RG-05).
- EF-302 Badge "parcelle certifiee" / "agent certifie" visible sur l'annonce.
- EF-303 Recherche avec filtres : type, prix, statut juridique, badge, zone.
- EF-304 Site web public : liste des annonces, fiche d'un bien, statut d'une parcelle.
- EF-308 Partage WhatsApp (message pre-rempli) et TikTok/Instagram (lien + image).

### Module 4 - Comptes, roles, synchronisation (Beni)
- EF-401 Inscription avec numero de telephone et code SMS (simule en journal tant qu'il n'y a pas de fournisseur).
- EF-402 Navigation par role : seules les actions permises sont affichees ; le serveur refuse de toute facon.
- EF-403 Pieces justificatives : identite pour tous, carte professionnelle / agrement / RCCM pour les agents, attestation d'inscription a l'Ordre pour les geometres. Pieces d'identite visibles du proprietaire et de l'administrateur seulement.
- EF-404 Espace administrateur : file d'attente des comptes, validation, rejet avec motif, suspension, journal.
- EF-405 Synchronisation hors ligne : file d'envoi locale, `clientId` unique, reprise automatique, refus conserve avec son motif.
- EF-407 Connexion securisee : jetons courts, renouvellement, blocage 15 minutes apres 5 echecs.
- EF-408 Zones inondables : phase 3, seulement si une source fiable est trouvee.

### Module 5 - Location (Beni)
- EF-305 Visites : demande, statut, rappel (l'envoi du rappel attend un fournisseur SMS).
- EF-306 Etat des lieux d'entree et de sortie : photos horodatees et signature du locataire.
- EF-307 Baux et loyers : echeances, retards.
- EF-309 Paiement mobile Flooz et T-Money (Mixx by Yas) pour les loyers : phase 3.

## 5. Regles de gestion

- RG-01 Pas de RTK Fixed, pas de borne validee.
- RG-02 Chevauchement refuse, alerte journalisee, limite commune acceptee.
- RG-03 Attestation : geometre inscrit + toutes bornes RTK Fixed + parcelle sans conflit.
- RG-04 Chaque geometrie garde sa source (instrument, mode, PDOP, satellites).
- RG-05 Un client ne publie jamais ; il passe par un agent.
- RG-06 Un seul role par compte, attribue par l'administrateur, relu en base a chaque requete.
- RG-07 La plateforme n'impose aucun outil aux agents : elle propose le partage par lien.
- RG-08 Aucune ecriture directe depuis le terrain : tout passe par la file locale.
- RG-09 Le document s'appelle "attestation de leve" ; mention "Ne vaut pas titre foncier" obligatoire.
- RG-10 Chaque action sensible (validation de compte, creation/modification de parcelle, attestation, alerte) est journalisee.

## 6. Architecture

| Couche | Choix | Raison |
|---|---|---|
| Serveur | Node.js + NestJS, TypeScript | Proposition des etudiants, ecosysteme large |
| Base | PostgreSQL + PostGIS | Index spatial et intersections rapides |
| Application | Android natif Kotlin (Jetpack Compose), base locale Room/SQLite | Bluetooth et hors ligne fiables |
| Site web | Pages web servies par le meme depot (`web/`), consommant l'API | Pas de second serveur |
| Contrat | OpenAPI, un fichier par module dans `contracts/` | Chacun travaille sans attendre l'autre |

Principe "contrat d'abord" : avant de coder un point d'API, son proprietaire ecrit son fichier `contracts/<module>.yaml` et ouvre une PR. Les autres peuvent alors coder contre ce contrat avec des donnees simulees.
Hebergement : un serveur HTTPS (par exemple une machine gratuite Oracle Cloud ou un autre hebergeur). L'application de production refuse le HTTP.

## 7. Donnees principales

`users`, `documents`, `sessions` (Beni) ; `visits`, `leases`, `payments`, `inspections` (Beni) ; `projects`, `survey_points` (Romuald) ; `parcels`, `parcel_versions`, `attestations`, `audit_log` (Samuel) ; `properties` (Marrich). Chaque module n'ecrit que dans ses tables ; il lit les autres par l'API ou par une vue en lecture seule.

## 8. Exigences non fonctionnelles

- Hors ligne : toute saisie de terrain fonctionne sans reseau.
- Securite : mots de passe BCrypt, jetons signes, fichiers limites a 5 Mo (JPEG, PNG, PDF), aucun secret dans le depot.
- Donnees personnelles : pieces d'identite privees, photos de biens publiques.
- Qualite : tests automatiques obligatoires, linter bloquant, integration continue sur GitHub.
- Performance : verification d'un chevauchement en moins de 2 secondes pour 10 000 parcelles.

## 9. Contraintes du cadre Confluences

Regles de financement de Confluences Togo : l'appui n'est jamais une somme versee aux etudiants ou aux membres de l'equipe. Chaque depense est une prestation ou une fourniture necessaire au projet, realisee par un prestataire ou un fournisseur, et justifiee par un devis puis une facture adresses a "Ambassade de France / SCAC". Plafond : 450 000 FCFA par projet. Processus : un besoin, un prestataire, un devis, l'accord de principe de l'encadrant et de l'ambassade, puis la facture. Devis et factures sont conserves jusqu'a la restitution finale. Seuls les etudiants realisent le projet. Aucun compte payant cree sans accord de LGR.

## 10. Planning

Le planning detaille, avec les conditions de lancement (fonds, outils de travail, materiel, hebergement), est dans `docs/FEUILLE-DE-ROUTE.md`. En resume : preparation sans cout maintenant, puis 2 jours de developpement des que les quatre etudiants sont equipes, puis recette, puis mesure reelle CA-1 a l'arrivee du materiel.

## 11. Criteres d'acceptation

- CA-1 10 mesures d'une borne connue en RTK Fixed : ecart inferieur a 2 cm (mesure physique, materiel requis).
- CA-2 Une parcelle qui en recouvre une autre est refusee, une alerte est journalisee ; une voisine qui partage une limite est acceptee.
- CA-3 Coupure reseau pendant un leve : aucune perte, synchronisation sans doublon.
- CA-4 Un agent qui modifie une limite est refuse par le serveur.
- CA-5 Un client qui publie un bien est refuse.
- CA-6 Un agent publie un bien rattache a une parcelle certifiee : badge visible, bien sur la carte, lien de partage public.
- CA-7 Un topographe ne peut ajouter des points que sur un chantier qui lui est assigne.

## 12. Hors perimetre

QR code et protocoles administratifs, titre foncier, interconnexion avec l'ANDF, paiement reel (phase 3), zones inondables sans source fiable.

## 13. Risques

| Risque | Parade |
|---|---|
| Recepteur non achete ou plus cher que prevu | Simulateur RTKLIB (`str2str`) pour developper ; achat echelonne ; mesure CA-1 des l'arrivee du materiel |
| Pas de donnees foncieres officielles | Zone pilote levee par l'equipe |
| Conflits Git | Proprietes de dossiers strictes (docs/RESPONSABILITES.md) |
| SMS reel indisponible | Code simule en journal, interface `SmsSender` prete |
| Aucun service de corrections NTRIP a Lome | Verifier avant l'achat ; sinon prevoir une station de reference |
| Un etudiant bloque | Issue GitHub sous 24 h ; Marrich arbitre, LGR tranche |
