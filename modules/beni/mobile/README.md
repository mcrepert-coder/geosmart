# Bibliotheque Android M4 et application exemple

Application Kotlin native, minimum Android 8 (API 26), compilation SDK 36, Java 17. Plugin Android Gradle 9.0.1 avec Kotlin integre, Gradle 9.1.0.

Le module `beni/` est une bibliotheque Android partageable. Le module `app/` est une application exemple qui depend de `beni/`. Ouvrir ce dossier comme projet dans Android Studio. Le SDK peut etre renseigne par l'IDE, la variable ANDROID_HOME ou un fichier local.properties propre a votre poste. Ne pas distribuer local.properties.

```powershell
./gradlew.bat :beni:assembleRelease :app:assembleDebug
```

L'AAR partage est produit dans `beni/build/outputs/aar/beni-release.aar`. Pour integrer les sources, ajouter `include(":beni")` dans les settings de l'hote puis `implementation(project(":beni"))` dans son application. Aucune Activity de lancement n'est fournie par la bibliotheque.

L'APK exemple est produit dans `app/build/outputs/apk/debug/app-debug.apk`. Une copie de la compilation verifiee est livree dans le dossier `../livraison/`.

Le build debug accepte HTTP pour les essais locaux. Le manifeste principal refuse HTTP : une version release doit utiliser une URL HTTPS configuree. L'adresse par defaut `10.0.2.2` vise uniquement l'emulateur Android standard et ne fonctionne pas directement sur un telephone.

Les pages sont fonctionnelles et utilitaires : connexion, inscription, code, justificatifs, compte, administration, saisie terrain de test, file de synchronisation et carte. La vue cartographique projette les polygones localement sans fond de carte ; elle n'effectue aucun calcul de surface ou de precision metrique. La navigation depend du role en session et les autorisations sont controlees a nouveau par l'API.

Les donnees terrain sont conservees dans SQLite avant envoi. Les jetons sont chiffres par AES-GCM avec une cle Android Keystore. Les sauvegardes Android de l'application sont desactivees. Chaque compte voit uniquement sa propre file locale ; une deconnexion ne detruit pas les saisies non envoyees.

Les demarrages d'emplois JobScheduler restent soumis au systeme Android. Aucune garantie de synchronisation a la seconde pres n'est annoncee. L'ecran de synchronisation permet un declenchement manuel et affiche les motifs de refus.
