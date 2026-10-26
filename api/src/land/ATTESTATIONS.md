# Attestations de leve et PDF

`AttestationService` fournit issue(parcelId, issuer), list(parcelId, reader) et
pdf(number, reader). Ces services ne creent pas encore de routes HTTP.

## Emission

L'emetteur est un geometre auteur actif, inscrit a l'Ordre. Son identite et son
nom professionnel viennent du module comptes, jamais du corps HTTP. Le service
verifie le statut juridique, le drapeau de conflit, les bornes RTK Fixed et
l'empreinte de la version courante avant emission.

L'adaptateur obligatoire OpenParcelConflicts verifie les alertes ouvertes. Il
n'existe aucun simulateur actif par defaut : le cycle de vie des alertes doit
encore etre raccorde. Toute lecture SQL de cet adaptateur doit utiliser le client
fourni pour ne pas bloquer un pool a une seule connexion.

Sous le verrou foncier, le service genere le PDF a partir de l'instantane de
version, puis enregistre metadata, octets PDF et evenement ATTESTATION_ISSUED dans
la meme transaction. Un echec de rendu, stockage ou audit annule tout. L'audit
contient les empreintes du polygone et du fichier PDF.

Le PDF contient numero, parcelle, version, date, geometre, surface, perimetre,
bornes WGS84 et empreinte SHA-256 du polygone. Il porte le titre
"Attestation de leve" et la mention "Ne vaut pas titre foncier", repetee sur les
pages supplementaires. Aucun QR code ni image n'est genere.

## Stockage et consultation

Choix technique de cette implementation, a relire avec l'integrateur : les PDF
sont conserves en BYTEA dans land_attestation_pdfs. La nouvelle migration
202610241400_land_attestation_pdfs.sql s'execute apres la migration fonciere.
Elle ne remplace aucune migration deja partagee. Les PDF sont en ajout seul,
limites a 5 000 000 octets. Le service verifie leur empreinte au telechargement.

La version et le nom professionnel a l'emission sont conserves. Une modification
ulterieure de la parcelle ne change ni l'ancien PDF ni les mesures de son attestation.
La consultation et le telechargement sont reserves aux comptes actifs selon le
contrat actuel. Leur visibilite doit toujours etre confirmee par LGR avant exposition.
Un PDF historique n'atteste pas l'etat juridique courant d'une parcelle.

## Demandes d'integration pour Marrich et Beni

- Ajouter PDFKit aux dependances API et @types/pdfkit aux dependances de
  developpement. Version verifiee localement : pdfkit 0.20.2.
- Fournir une police TTF sous forme de Buffer a PdfKitAttestationRenderer ; elle
  doit couvrir les glyphes des noms et langues utilises et etre distribuable
  dans l'environnement de production. Aucun chemin n'est accepte du client HTTP.
- Raccorder le pool, l'horloge, les roles, le nom professionnel et l'inscription
  a l'Ordre. Raccorder l'adaptateur de conflits ouverts avant toute exposition.
- Executer la nouvelle migration et brancher les trois routes du contrat.
- Pour les tests PDF, ajouter pdfjs-dist en developpement (6.4.299 verifie localement)
  et definir LAND_TEST_PDF_FONT_PATH si aucune police de test n'est trouvee.

Les dependances ont ete installees uniquement dans un dossier temporaire pour
la verification. Aucun package.json ou fichier partage de Marrich n'a ete modifie.
Les tests lisent les PDF avec PDF.js dans un processus Node separe, sans mock
du parseur, et executent le SQL avec PostGIS embarque. La concurrence et les
performances sur PostgreSQL cible restent a verifier.

Verification du lot : 283 tests reussis dans 12 suites land/audit, dont 16 tests
d'attestation, et controle TypeScript strict sans erreur sur 28 fichiers.
Pour le lot complet, Jest a ete lance avec un worker et
`workerIdleMemoryLimit: '32MB'` pour recycler les processus entre les suites
utilisant le moteur embarque. La premiere execution monoprocessus a ete interrompue.
