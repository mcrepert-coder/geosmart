# Demandes de leve (EF-207)

`SurveyRequestService` fournit create(input, agent), list(filters, reader) et
take(id, geometre). Ces services ne creent pas encore de routes HTTP.
Migration : `api/migrations/202610241500_land_survey_requests.sql`.

## Droits

- Creation : agent actif. Le corps ne contient que description, location et
  contactPhone ; l'agent vient du contexte auth, jamais du corps HTTP.
- Liste : l'agent voit ses demandes, le geometre les demandes OUVERTE et celles
  qu'il a prises, l'administrateur toutes. Client et topographe : 403.
- Prise : geometre actif. Inscription a l'Ordre non exigee (le contrat ne la
  demande pas pour prendre une demande, seulement pour l'attestation).

Le telephone de contact n'est renvoye qu'a l'agent auteur, a l'administrateur
et au geometre qui a pris la demande. C'est une proposition : donnee personnelle,
a confirmer par LGR.

## Transactions

La demande et sa ligne de journal (SURVEY_REQUEST_CREATED, SURVEY_REQUEST_TAKEN)
sont validees ensemble ; un echec du journal annule la demande.
La prise est une mise a jour conditionnelle (`WHERE status = 'OUVERTE'`) : un seul
geometre l'obtient, meme en cas de prises simultanees. Le meme geometre qui
reprend sa demande recoit l'etat courant sans nouvel audit.

## Ce que la base garantit

- localisation Point SRID 4326 dans le domaine WGS84 ; telephone de 8 a 15 chiffres ;
- demande ouverte sans geometre, demande prise toujours avec un geometre ;
- description, agent, localisation, telephone et date de creation immuables ;
- geometre d'une demande prise non remplacable ; ni suppression ni TRUNCATE ;
- parcelle rattachee existante.

## Reste ouvert

- Transitions TERMINEE et ANNULEE, et rattachement de la parcelle levee :
  decision LGR, aucun service ne les produit.
- Prises simultanees sur plusieurs connexions : garanties par la mise a jour
  conditionnelle, non testees (PGlite n'a qu'une connexion).

## Verification

    NODE_OPTIONS=--experimental-vm-modules npx jest test/land/survey-request.spec.ts
