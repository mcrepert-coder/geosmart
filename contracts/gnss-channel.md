# Specification du canal GNSS : Pont Flutter - Natif Android

Proprietaire : Romuald (SODOU Essodina Romuald)
Module : Socle GNSS et liaison materielle (EF-101 a EF-105)

Ce document definit le contrat d'interface (Platform Channels) entre la couche Flutter (Dart) et la couche native Android (Kotlin) pour la communication Bluetooth SPP avec le recepteur GNSS et le renvoi des corrections RTCM.

Le contrat metier des donnees de borne et de chantier est defini dans [survey.md](file:///home/ro/Documents/geosmart/geosmart/contracts/survey.md).

---

## 1. Vue d'ensemble

```
+-------------------------------------------------------------+
| Layer Flutter (Dart)                                        |
| - Decodage NMEA (NmeaStreamDecoder)                         |
| - Client NTRIP 4G (NtripDataSource)                         |
| - Calculs UTM 31N, cartographie et stockage local SQLite   |
+-------------------------------------------------------------+
         ^                                            |
         | EventChannel (flux NMEA)                   | MethodChannel (commandes & RTCM)
         | com.geosmart/gnss_stream                   | com.geosmart/gnss_control
         |                                            v
+-------------------------------------------------------------+
| Layer Android Natif (Kotlin)                                |
| - BluetoothAdapter / BluetoothSocket (SPP RFCOMM)           |
| - Gestion de la reconnexion automatique                     |
| - Ecriture flux RTCM vers le port serie Bluetooth          |
+-------------------------------------------------------------+
         ^                                            |
         | Trames NMEA (GGA, RMC, GSA, GSV)           | Trames RTCM 3.x
         |                                            v
+-------------------------------------------------------------+
| Recepteur physique (UM982) ou Simulateur NMEA (str2str)     |
+-------------------------------------------------------------+
```

---

## 2. EventChannel : Flux NMEA entrant

- **Nom du canal** : `com.geosmart/gnss_stream`
- **Direction** : Natif Kotlin -> Flutter Dart
- **Type de donnees** : `String` (ligne NMEA complete terminant par `\r\n`)

### Format d'un message émis sur le flux

Chaque evenement correspond a une phrase NMEA brute valide :
- `$GNGGA,143200.00,0608.2354,N,00112.7528,E,4,18,0.8,24.35,M,0.0,M,1.0,0000*7A`
- `$GNGSA,A,3,01,02,03,04,05,06,07,08,09,10,11,12,1.2,0.8,0.9*1E`
- `$GNRMC,143200.00,A,0608.2354,N,00112.7528,E,0.02,180.0,251026,,,D*74`

### Gestion des erreurs du flux

En cas de perte de liaison Bluetooth, le canal emet une erreur `STREAM_DISCONNECTED` avec le motif, avant de tenter la reconnexion automatique.

---

## 3. MethodChannel : Commandes et injection RTCM

- **Nom du canal** : `com.geosmart/gnss_control`
- **Direction** : Flutter Dart -> Natif Kotlin

### Methodes disponibles

#### 1. `startScan()`
- **Description** : Recherche les peripheriques Bluetooth appaires et a proximite.
- **Parametres** : Aucun.
- **Retour** : `List<Map<String, dynamic>>`
  ```json
  [
    {
      "name": "UM982_GNSS",
      "address": "00:11:22:33:AA:BB",
      "isBonded": true
    }
  ]
  ```

#### 2. `connectDevice(String address)`
- **Description** : Etablit la connexion Bluetooth SPP (UUID standard SerialPort `00001101-0000-1000-8000-00805F9B34FB`). Active la reconnexion automatique si la connexion chute.
- **Parametres** :
  - `address` (String) : Adresse MAC du recepteur.
- **Retour** : `Boolean` (`true` si connecte, exception `PlatformException` si echec).

#### 3. `disconnectDevice()`
- **Description** : Ferme proprement la socket Bluetooth SPP et stoppe le flux.
- **Parametres** : Aucun.
- **Retour** : `Boolean`.

#### 4. `sendRtcm(Uint8List bytes)`
- **Description** : Transmet les octets de corrections differentielles RTCM 3.x recus du client NTRIP vers l'entree du recepteur GNSS via la socket Bluetooth.
- **Parametres** :
  - `bytes` (`ByteArray` / `Uint8List`) : Bloc d'octets RTCM.
- **Retour** : `Boolean`.

#### 5. `startSimulation(String assetPath)`
- **Description** : Mode simulateur (EF-105, sans materiel physique). Rejoue un fichier de trames NMEA a une cadence definie (ex: 1 Hz ou 5 Hz).
- **Parametres** :
  - `assetPath` (String) : Chemin vers le fichier NMEA simule.
- **Retour** : `Boolean`.

#### 6. `saveCaster(...)`
- **Description** : Enregistre la configuration du caster NTRIP. Le mot de passe est chiffre en AES-GCM avec une cle du Keystore Android ; il n'est jamais ecrit en clair.
- **Parametres** :
  - `host` (String) : Nom ou adresse du caster.
  - `port` (Integer) : Port entre 1 et 65535.
  - `mountpoint` (String) : Point de montage RTCM.
  - `username` (String) : Identifiant du caster.
  - `password` (String) : Mot de passe, chiffre avant stockage.
  - `useTls` (Boolean) : Transport HTTPS vers le caster.
- **Retour** : `Boolean` (`false` si le Keystore est indisponible ou si la configuration est invalide).

#### 7. `loadCaster()`
- **Description** : Relit la configuration du caster et dechiffre le mot de passe.
- **Parametres** : Aucun.
- **Retour** : `Map<String, dynamic>?` avec `host`, `port`, `mountpoint`, `username`, `password`, `useTls`, ou `null` si aucune configuration n'est stockee.

#### 8. `clearCaster()`
- **Description** : Supprime la configuration memorisee.
- **Parametres** : Aucun.
- **Retour** : `Boolean`.

---

## 4. Statuts de connexion retournes

| Code statut | Signification |
|---|---|
| `DISCONNECTED` | Aucun appareil connecte |
| `CONNECTING` | Tentative de connexion SPP en cours |
| `CONNECTED` | Liaison etablie, flux NMEA actif |
| `RECONNECTING` | Liaison perdue, tentative automatique de reconnexion |
| `ERROR` | Erreur fatale Bluetooth (adaptateur desactive, port indisponible) |

