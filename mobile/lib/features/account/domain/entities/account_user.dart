/// Roles de GeoSmart, identiques a ceux du serveur (RG-06 : le role est
/// relu en base a chaque requete, jamais devine par l'application).
enum AccountRole {
  admin('ADMIN'),
  geometre('GEOMETRE'),
  topographe('TOPOGRAPHE'),
  agent('AGENT'),
  client('CLIENT');

  const AccountRole(this.serialized);

  final String serialized;

  static AccountRole? fromString(String? value) {
    final normalized = value?.trim().toUpperCase();
    for (final role in values) {
      if (role.serialized == normalized) return role;
    }
    return null;
  }
}

/// Utilisateur connecte, forme renvoyee par `GET /auth/me`
/// (contracts/auth.yaml, schema CurrentUser).
class AccountUser {
  const AccountUser({
    required this.id,
    required this.role,
    required this.registeredSurveyor,
    required this.accountActive,
    this.fullName,
    this.ordreNumber,
  });

  factory AccountUser.fromJson(Map<String, dynamic> json) => AccountUser(
    id: json['id'] as String,
    role: AccountRole.fromString(json['role'] as String?) ??
        AccountRole.client,
    registeredSurveyor: json['registeredSurveyor'] == true,
    accountActive: json['accountActive'] == true,
    fullName: json['fullName'] as String?,
    ordreNumber: json['ordreNumber'] as String?,
  );

  final String id;
  final AccountRole role;
  final bool registeredSurveyor;
  final bool accountActive;
  final String? fullName;
  final String? ordreNumber;

  Map<String, dynamic> toJson() => {
    'id': id,
    'role': role.serialized,
    'registeredSurveyor': registeredSurveyor,
    'accountActive': accountActive,
    'fullName': fullName,
    'ordreNumber': ordreNumber,
  };
}
