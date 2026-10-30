# Module GNSS, terrain et carte (proprietaire : Romuald)

Dossiers couverts : le Kotlin natif `mobile/android/app/src/main/kotlin/com/geosmart/field/gnss/` (ce dossier), le Dart `mobile/lib/features/gnss|survey|cogo|map/` et leurs tests dans `mobile/test/features/`, `contracts/survey.md`, `contracts/gnss-channel.md`. Ne rien modifier ailleurs.

Principe : le Kotlin natif ne fait que ce que Flutter ne sait pas bien faire (le materiel). Tout le reste, y compris la logique metier et les calculs, est en Dart et se teste sans telephone ni recepteur.

## A faire dans l'ordre

1. Ecrire `contracts/gnss-channel.md` d'abord : nom des canaux, commandes (connecter, deconnecter, configurer NTRIP), flux de positions (latitude, longitude, altitude, mode FIXED / FLOAT / AUTONOME, satellites, PDOP, sigma H, age RTCM, horodatage), erreurs. Ouvrir une PR vers `dev`.
2. Kotlin : lien Bluetooth SPP avec reconnexion, lecture des lignes, analyse GGA, RMC, GSA, GSV avec controle de somme ; tests avec des phrases reelles. Une source de test qui rejoue un fichier NMEA (simulateur). Fait : `BluetoothGnssConnector`, `NmeaLineAssembler`, `NmeaChecksum`, `NmeaSimulator`, `assets/nmea/simulation.txt`.
3. Kotlin : client NTRIP (reconnexion exponentielle) qui renvoie les RTCM au recepteur. Le client NTRIP reste en Dart (`NtripDataSource`), les octets passent par `sendRtcm`.
4. Kotlin : exposer a Flutter le canal du contrat (MethodChannel pour les commandes, EventChannel pour le flux de positions). Fait : `GnssChannelHost`, branche dans `MainActivity`.
5. Dart : `SurveyPoint` (RG-01 : seul FIXED peut valider une borne), enregistrement local d'abord, jamais d'ecriture reseau directe (RG-08).
6. Dart : calculs UTM 31N (distance, perimetre, surface), tests sur des carres connus ; plan PDF local.
7. Dart : chantiers (un topographe ne voit que ses chantiers assignes, CA-7) ; carte des parcelles coloree par statut, avec filtres (EF-406). Lit `GET /parcels` ; donnees simulees tant que Samuel n'a pas livre.
8. Ecran de mesure d'une borne selon le design (qualite visible, bouton desactive hors Fixed avec la raison).

## Verification

Kotlin : `cd mobile/android && ./gradlew testDebugUnitTest`
Dart : `cd mobile && flutter analyze && flutter test`

## Limites

La mesure CA-1 exige le vrai recepteur. Sans lui, ne jamais annoncer "2 cm" : parler de "simulation".
