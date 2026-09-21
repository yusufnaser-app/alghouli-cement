class Address {
  final String id;
  final String label;
  final String governorate;
  final String area;
  final String addressText;
  final String? altPhone;
  final bool isDefault;

  Address({
    required this.id,
    required this.label,
    required this.governorate,
    required this.area,
    required this.addressText,
    this.altPhone,
    required this.isDefault,
  });

  factory Address.fromJson(Map<String, dynamic> json) {
    return Address(
      id: json['id'] ?? '',
      label: json['label'] ?? '',
      governorate: json['governorate'] ?? '',
      area: json['area'] ?? '',
      addressText: json['address_text'] ?? '',
      altPhone: json['alt_phone'],
      isDefault: json['is_default'] ?? false,
    );
  }

  String get fullAddress => '$area - $governorate\n$addressText';
}
