# Module GNSS, terrain et carte (proprietaire : Romuald)

Dossiers couverts : `gnss/`, `survey/`, `cogo/`, `map/` (et leurs tests), `contracts/survey.md`. Ne rien modifier ailleurs.

## A faire dans l'ordre

1. Interface `NmeaLineSource` + analyse GGA, RMC, GSA, GSV avec controle de somme ; tests avec des phrases reelles.
2. Lien Bluetooth SPP avec reconnexion ; source de test qui rejoue un fichier NMEA (simulateur).
3. Client NTRIP (reconnexion exponentielle) qui renvoie les RTCM au recepteur.
4. `SurveyPoint` : latitude, longitude, altitude, mode (FIXED / FLOAT / AUTONOME), satellites, PDOP, horodatage. RG-01 : seul FIXED peut valider une borne.
5. Enregistrement local d'abord (Room), jamais d'ecriture reseau directe (RG-08).
6. Calculs UTM 31N : distance, perimetre, surface ; tests sur des carres connus.
7. Plan PDF local.
8. Chantiers : un topographe ne voit que ses chantiers assignes (CA-7).
9. Carte MapLibre : parcelles colorees par statut, filtres (EF-406). Lit `GET /parcels` ; donnees simulees tant que Samuel n'a pas livre.

## Verification

`./gradlew :app:testDebugUnitTest ktlintCheck`

## Limites

La mesure CA-1 exige le vrai recepteur. Sans lui, ne jamais annoncer "2 cm" : parler de "simulation".
