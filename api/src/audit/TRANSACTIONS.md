# Audit et transactions metier

Deux usages distincts du meme stockage et du meme chainage :

- `new PgAuditStore(pool)` ouvre et termine sa propre transaction. A utiliser
  pour une alerte de refus, uniquement apres le rollback foncier.
- `PgAuditStore.inTransaction(client)` renvoie un AuditStore qui utilise une
  transaction READ COMMITTED deja ouverte. Il ne fait ni BEGIN, COMMIT, ROLLBACK
  ni release. L'appelant reste responsable du cycle de vie de la transaction.

## Integration par le service foncier

Dans le callback d'ecriture de `withParcelOverlapCheck`, utiliser le PoolClient
qui porte deja cette transaction et adapter son resultat `rows` pour le controle
foncier. Le stockage ne doit jamais recevoir un autre client ni un pool.

    const store = PgAuditStore.inTransaction(client);
    const transactionalAudit = new AuditService(store, clock);
    await insertParcelAndVersion(client, data);
    await transactionalAudit.log('PARCEL_CREATED', actorId, {},
      { type: 'parcel', id: parcelId });

`insertParcelAndVersion` illustre le futur stockage metier, pas une fonction
deja exposee dans le projet. Le callback doit attendre chaque ecriture et laisser
remonter les erreurs. Le COMMIT commun intervient uniquement apres son succes.
Une ligne renvoyee par log n'est durable qu'apres ce COMMIT.

Conserver une seule instance du stockage transactionnel par transaction. Une file
serialise ses appels simultanes ; le verrou consultatif SQL protege les connexions
distinctes. Ne pas reutiliser l'instance apres COMMIT ou ROLLBACK. L'ordre commun
des verrous est : verrou foncier, puis verrou d'audit. Ne pas prendre ces verrous
dans l'ordre inverse dans un autre chemin d'ecriture.

Apres un rollback, une sequence non validee peut etre reutilisee : aucune ligne
fantome ne doit subsister ni servir de predecesseur. Le controle des empreintes
reste identique pour les evenements autonomes et transactionnels.

Les tests d'integration couvrent succes, erreur apres audit, erreur de validation,
refus SQL du journal, refus au COMMIT differe et plusieurs appels dans une meme
transaction. La concurrence entre connexions reste a verifier sur un serveur
PostgreSQL ; une seule instance PGlite ne fournit pas cette preuve.
