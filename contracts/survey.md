# Contrat de donnees : Module Terrain et GNSS (survey)

Proprietaire : Romuald (SODOU Essodina Romuald)
Concerne : Romuald (emetteur), Beni (synchronisation `POST /sync`), Samuel (foncier et parcelles).

Ce document definit les structures de donnees, regles de validation et formats d'echange pour les bornes de lévé et les chantiers de terrain.

---

## 1. Structure de donnee : `SurveyPoint`

Represente une borne physique mesuree sur le terrain par le recepteur GNSS.

### Champs

| Champ | Type | Description | Regle associee |
|---|---|---|---|
| `id` | String (UUID) | Identifiant local unique du point | Interne mobile |
| `clientId` | String (UUID) | Identifiant unique pour la file de synchronisation hors ligne | RG-08 |
| `projectId` | String (UUID) | Identifiant du chantier auquel appartient la borne | EF-109, CA-7 |
| `surveyorId` | String (UUID) | Identifiant du topographe qui a realise la mesure | CA-7 |
| `pointNumber` | Integer | Numero d'ordre de la borne dans le tour de la parcelle (ex: 1, 2, 3, ...) | EF-201 |
| `pointName` | String | Libelle de la borne (ex: "B1", "B2") | Optionnel |
| `latitude` | Double | Latitude en degres decimaux (WGS84, EPSG:4326) | Entre -90.0 et +90.0 |
| `longitude` | Double | Longitude en degres decimaux (WGS84, EPSG:4326) | Entre -180.0 et +180.0 |
| `altitude` | Double | Hauteur ou altitude en metres | Flottant |
| `accuracy` | Double | Precision horizontale estimee en metres | Flottant |
| `fixQuality` | String / Enum | Qualite du fix GNSS : `FIXED`, `FLOAT`, `AUTONOME`, `INVALIDE` | RG-01 (obligatoire) |
| `satellitesCount` | Integer | Nombre de satellites utilises dans la solution | RG-04 |
| `pdop` | Double | Dilution de precision 3D (PDOP) | RG-04 |
| `hdop` | Double | Dilution de precision horizontale (HDOP) | Flottant |
| `vdop` | Double | Dilution de precision verticale (VDOP) | Flottant |
| `instrument` | String | Identifiant de l'appareil (ex: "UM982", "Simulateur") | RG-04 |
| `recordedAt` | String (ISO 8601 UTC) | Horodatage precis de la mesure | RG-04 |
| `isValidated` | Boolean | Vrai si le point est valide comme borne officielle | RG-01 : Vrai SEULEMENT si `fixQuality == "FIXED"` |

### Règles de validation strictes

- **RG-01 : Pas de RTK Fixed, pas de borne validee.**  
  Tout point dont `fixQuality != "FIXED"` est enregistre comme point indicatif ou trace, mais ne peut en aucun cas etre valide (`isValidated = false`) pour servir de sommet a une parcelle officielle.
- **RG-04 : Traçabilité des sources.**  
  Tout point valide doit comporter obligatoirement `instrument`, `fixQuality`, `pdop` et `satellitesCount`.
- **Système de coordonnées :**  
  Les coordonnees sont mesurees et stockees en WGS84 (EPSG:4326). Les calculs de distance, perimetre et surface sont effectues localement en projection UTM Zone 31N (EF-107).

---

## 2. Structure de donnee : `SurveySession` (Chantier de leve)

Represente un chantier et l'ensemble ordonne des bornes levees.

### Champs

| Champ | Type | Description |
|---|---|---|
| `id` | String (UUID) | Identifiant local du chantier |
| `projectId` | String (UUID) | Identifiant serveur du chantier assigne |
| `surveyorId` | String (UUID) | Identifiant du topographe assigne |
| `title` | String | Nom ou reference du chantier |
| `status` | String / Enum | `DRAFT`, `IN_PROGRESS`, `COMPLETED`, `SYNCED` |
| `points` | List<SurveyPoint> | Liste ordonnee des bornes (minimum 3 pour une parcelle) |
| `perimeterMeters` | Double | Perimetre calcule en metres (projection UTM 31N) |
| `areaSquareMeters` | Double | Surface calculee en metres carres (projection UTM 31N) |
| `createdAt` | String (ISO 8601) | Date de creation locale |
| `completedAt` | String (ISO 8601) | Date de fin du leve (nullable) |

---

## 3. Format d’échange pour la synchronisation (`POST /sync`)

Consomme par : Beni (`api/src/sync/`).  
Conformité : RG-08 (file locale avec `clientId` unique, reprise automatique sans doublon).

Chaque borne validee stockee localement est deposee dans la file d'envoi.

### Exemple de charge utile (JSON) pour un point de leve

```json
{
  "clientId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "entityType": "survey_point",
  "action": "CREATE",
  "payload": {
    "projectId": "8f3b6c2a-9e12-4c56-8a71-3b5e4a2c1d0f",
    "pointNumber": 1,
    "pointName": "B1",
    "latitude": 6.137254,
    "longitude": 1.212547,
    "altitude": 24.35,
    "fixQuality": "FIXED",
    "satellitesCount": 18,
    "pdop": 1.2,
    "hdop": 0.8,
    "vdop": 0.9,
    "instrument": "UM982",
    "recordedAt": "2026-10-25T14:32:00.000Z"
  }
}
```

### Regles cote serveur pour `POST /sync` sur les `survey_point`

- Si `fixQuality != "FIXED"`, le serveur rejette l'insertion comme borne officielle avec une erreur explicite.
- Le serveur utilise `clientId` pour garantir l'idempotence : un renvoi de la meme requete suite a une coupure reseau ne cree aucun doublon (CA-3).

---

## 4. Contrat d'exposition pour le Foncier (Samuel)

Consomme par : Samuel (`api/src/land/` et `mobile/.../land/`).

Pour creer une parcelle (EF-201, EF-202) :
- Samuel recoit la liste ordonnee des points de `SurveySession`.
- Verification du nombre de sommets : minimum 3 points.
- Tous les points doivent être valides (`fixQuality == "FIXED"`).
- Samuel procede a la fermeture du polygone, au controle de non auto-intersection et au controle PostGIS de non-chevauchement (409 en cas de conflit, RG-02).

---

## 5. Canal interne GNSS : Pont Flutter / Natif (si necessaire)

Pour la reception des donnees brutes NMEA depuis le Bluetooth SPP ou BLE :

- **EventChannel `com.geosmart/gnss_stream`** :  
  Emet un flux de chaines de caracteres correspondant aux lignes NMEA brutes lues sur le port Bluetooth (`$GNGGA`, `$GNRMC`, `$GNGSA`, `$GPGSV`).
- **MethodChannel `com.geosmart/gnss_control`** :  
  Commandes de pilotage du recepteur :
  - `connectDevice(address: String)` : Connexion au peripherique Bluetooth SPP/BLE.
  - `disconnectDevice()` : Deconnexion propre.
  - `sendRtcmData(bytes: ByteArray)` : Injection des trames RTCM provenant du client NTRIP (EF-104) vers le recepteur.

