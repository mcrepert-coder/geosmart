# Module location (proprietaire : Beni)

Dossiers couverts : `api/src/leasing/`, `api/test/leasing/`, `contracts/leasing.yaml`, `mobile/.../field/leasing/`.

Ce module vient apres l'authentification et la synchronisation : ne le commence qu'une fois `@Roles` et `POST /sync` fusionnes.

## A faire dans l'ordre

1. Ecrire `contracts/leasing.yaml` (visites, etats des lieux, baux, loyers).
2. Visites : demande par un client ou un agent, statut (demandee, confirmee, faite, annulee), heure de rappel enregistree. L'envoi du rappel attend un fournisseur SMS : interface `SmsSender` partagee avec le module auth.
3. Etats des lieux d'entree et de sortie : photos horodatees, notes, signature du locataire en image. Ils passent par la file de synchronisation (clientId unique).
4. Baux et loyers : echeances mensuelles, statut paye / en retard.
5. Paiement mobile : seulement une interface `MobileMoneyProvider` (Flooz, T-Money alias Mixx by Yas), sans implementation reelle.
6. Application : ecrans Visites, Baux et loyers, boite de dialogue d'etat des lieux avec signature au doigt.

## Verification

`npm test -- leasing` et `npm run lint`. Tests obligatoires : un client ne cree pas de bail, une visite sur un bien inexistant est refusee, le renvoi d'un meme etat des lieux ne cree pas de doublon.
