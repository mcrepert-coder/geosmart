plugins { id("com.android.application") }
android {
 namespace = "com.geosmart.field.beni"
 compileSdk = 36
 buildFeatures { buildConfig = true }
 defaultConfig { applicationId = "com.geosmart.field.beni"; minSdk = 26; targetSdk = 36; versionCode = 2; versionName = "0.2.0" }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
dependencies { implementation(project(":beni")) }
