/// Statuts d'une visite (EF-305), identiques au serveur.
enum VisitStatus {
  demandee('DEMANDEE'),
  confirmee('CONFIRMEE'),
  faite('FAITE'),
  annulee('ANNULEE');

  const VisitStatus(this.serialized);

  final String serialized;

  static VisitStatus fromString(String? value) {
    final normalized = value?.trim().toUpperCase();
    for (final status in values) {
      if (status.serialized == normalized) return status;
    }
    return VisitStatus.demandee;
  }

  String get label => switch (this) {
    VisitStatus.demandee => 'Demandee',
    VisitStatus.confirmee => 'Confirmee',
    VisitStatus.faite => 'Faite',
    VisitStatus.annulee => 'Annulee',
  };
}

class Visit {
  const Visit({
    required this.id,
    required this.propertyId,
    required this.requesterId,
    required this.status,
    required this.scheduledAt,
    required this.reminderAt,
    required this.createdAt,
  });

  factory Visit.fromJson(Map<String, dynamic> json) => Visit(
    id: json['id'] as String,
    propertyId: json['propertyId'] as String,
    requesterId: json['requesterId'] as String,
    status: VisitStatus.fromString(json['status'] as String?),
    scheduledAt: _date(json['scheduledAt']),
    reminderAt: _date(json['reminderAt']),
    createdAt: _date(json['createdAt']) ?? DateTime.now(),
  );

  final String id;
  final String propertyId;
  final String requesterId;
  final VisitStatus status;
  final DateTime? scheduledAt;
  final DateTime? reminderAt;
  final DateTime createdAt;
}

/// Statut d'un loyer (EF-307), calcule par le serveur.
enum RentStatus {
  aPayer('A_PAYER'),
  payee('PAYEE'),
  enRetard('EN_RETARD');

  const RentStatus(this.serialized);

  final String serialized;

  static RentStatus fromString(String? value) {
    final normalized = value?.trim().toUpperCase();
    for (final status in values) {
      if (status.serialized == normalized) return status;
    }
    return RentStatus.aPayer;
  }

  String get label => switch (this) {
    RentStatus.aPayer => 'A payer',
    RentStatus.payee => 'Payee',
    RentStatus.enRetard => 'En retard',
  };
}

class Rent {
  const Rent({
    required this.id,
    required this.dueDate,
    required this.amount,
    required this.status,
    required this.paidAt,
  });

  factory Rent.fromJson(Map<String, dynamic> json) => Rent(
    id: json['id'] as String,
    dueDate: json['dueDate'] as String,
    amount: (json['amount'] as num).toInt(),
    status: RentStatus.fromString(json['status'] as String?),
    paidAt: _date(json['paidAt']),
  );

  final String id;
  final String dueDate;
  final int amount;
  final RentStatus status;
  final DateTime? paidAt;
}

class Lease {
  const Lease({
    required this.id,
    required this.propertyId,
    required this.agentId,
    required this.tenantName,
    required this.monthlyRent,
    required this.startDate,
    required this.months,
    required this.rents,
  });

  factory Lease.fromJson(Map<String, dynamic> json) => Lease(
    id: json['id'] as String,
    propertyId: json['propertyId'] as String,
    agentId: json['agentId'] as String,
    tenantName: json['tenantName'] as String?,
    monthlyRent: (json['monthlyRent'] as num).toInt(),
    startDate: json['startDate'] as String,
    months: (json['months'] as num).toInt(),
    rents: [
      for (final rent in json['rents'] as List)
        Rent.fromJson(rent as Map<String, dynamic>),
    ],
  );

  final String id;
  final String propertyId;
  final String agentId;
  final String? tenantName;
  final int monthlyRent;
  final String startDate;
  final int months;
  final List<Rent> rents;
}

/// Type d'etat des lieux (EF-306).
enum InspectionKind {
  entry('ENTRY'),
  exit('EXIT');

  const InspectionKind(this.serialized);

  final String serialized;

  String get label => switch (this) {
    InspectionKind.entry => 'Entree',
    InspectionKind.exit => 'Sortie',
  };
}

class InspectionPhoto {
  const InspectionPhoto({
    required this.id,
    required this.takenAt,
    required this.sizeBytes,
  });

  factory InspectionPhoto.fromJson(Map<String, dynamic> json) =>
      InspectionPhoto(
        id: json['id'] as String,
        takenAt: json['takenAt'] as String,
        sizeBytes: (json['sizeBytes'] as num).toInt(),
      );

  final String id;
  final String takenAt;
  final int sizeBytes;
}

class Inspection {
  const Inspection({
    required this.id,
    required this.leaseId,
    required this.kind,
    required this.clientId,
    required this.notes,
    required this.photos,
    required this.createdAt,
  });

  factory Inspection.fromJson(Map<String, dynamic> json) => Inspection(
    id: json['id'] as String,
    leaseId: json['leaseId'] as String,
    kind: json['kind'] == 'EXIT'
        ? InspectionKind.exit
        : InspectionKind.entry,
    clientId: json['clientId'] as String,
    notes: json['notes'] as String?,
    photos: [
      for (final photo in json['photos'] as List)
        InspectionPhoto.fromJson(photo as Map<String, dynamic>),
    ],
    createdAt: json['createdAt'] as String,
  );

  final String id;
  final String leaseId;
  final InspectionKind kind;
  final String clientId;
  final String? notes;
  final List<InspectionPhoto> photos;
  final String createdAt;
}

DateTime? _date(Object? value) =>
    value is String && value.isNotEmpty ? DateTime.tryParse(value) : null;
