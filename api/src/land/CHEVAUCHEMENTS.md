# Controle des chevauchements

`withParcelOverlapCheck` travaille sur une connexion PostgreSQL dediee, initialement
hors transaction, fournie par le futur service foncier. L'adaptateur expose
`query(sql, params)` et renvoie les lignes (adapter le resultat `rows` de pg).

1. Ouvrir une transaction READ COMMITTED et verrouiller `parcels` en
   SHARE ROW EXCLUSIVE avant de lire les voisins.
2. Verifier la validite spatiale du contour prepare par `prepareParcelGeometry`.
3. Chercher les intersections des interieurs avec ST_Relate, apres filtre spatial
   indexable. Cela couvre inclusion, egalite et recouvrement partiel ; les limites
   ou sommets communs sont acceptes. Aucun seuil de tolerance n'est applique.
4. Sans conflit, executer le callback sur cette meme connexion puis COMMIT.
5. En conflit, ROLLBACK avant l'appel `audit.log`, puis lever `ParcelOverlapError`
   (status 409) avec identifiants, surface en UTM 31N et sequence d'alerte.
   Une panne d'audit remonte sans fabriquer de sequence ni annoncer un refus journalise.

La surface retournee est la somme des intersections avec les parcelles en conflit.
`excludeParcelId` est reserve a une modification autorisee par le service ; il ne
doit jamais etre accepte directement du client sans controle d'identite et de droits.

Le callback doit faire les ecritures, versions et audit de succes dans la transaction
commune. Le PgAuditStore habituel ouvre sa propre transaction pour les alertes
apres rollback. Pour les succes, `PgAuditStore.inTransaction(client)` fournit
un stockage lie au client foncier ; construire AuditService avec ce stockage
et l'horloge commune. Voir `api/src/audit/TRANSACTIONS.md`.

Tous les chemins de creation et modification, y compris sync, doivent utiliser
ce controle. Le verrou serialise les ecritures pendant la transaction, mais ne
remplace pas le controle pour les ecritures ulterieures. Il est volontairement
global ; performances et acces concurrents multi-connexions restent a verifier
sur un serveur PostgreSQL cible. PGlite ne prouve pas ces garanties de concurrence.

Les routes HTTP, roles, rejeux, versions et stockage du callback ne sont pas
implementes par cette fonction. Ce controle seul ne constitue pas la recette CA-2
de bout en bout de l'API.

Verification locale : les quatre suites foncieres passent sous Jest sur PGlite
avec PostGIS (144 tests, dont 14 pour le controle des chevauchements).
Cela couvre aussi une alerte persistee et chainee via PgAuditStore apres refus,
avec un adaptateur de connexion de test. Aucun serveur multi-connexions n'a ete teste.
