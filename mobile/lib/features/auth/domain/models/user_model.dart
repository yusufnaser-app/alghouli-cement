class UserModel {
  final String id;
  final String fullName;
  final String phone;
  final String userType;
  final String? customerType;
  final List<String> roles;

  UserModel({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.userType,
    this.customerType,
    required this.roles,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] ?? '',
      fullName: json['fullName'] ?? json['full_name'] ?? '',
      phone: json['phone'] ?? '',
      userType: json['userType'] ?? json['user_type'] ?? '',
      customerType: json['customerType'] ?? json['customer_type'],
      roles: (json['roles'] as List?)?.map((e) => e.toString()).toList() ?? [],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'fullName': fullName,
        'phone': phone,
        'userType': userType,
        'customerType': customerType,
        'roles': roles,
      };

  bool get isCustomer => roles.contains('customer');
  bool get isAdmin => roles.contains('admin');
  bool get isTrader => customerType == 'trader';
}
