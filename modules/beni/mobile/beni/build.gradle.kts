plugins { id("com.android.library") }
android {
 namespace = "com.geosmart.field.beni.module"
 compileSdk = 36
 buildFeatures { buildConfig = true }
 defaultConfig { minSdk = 26 }
 compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}
