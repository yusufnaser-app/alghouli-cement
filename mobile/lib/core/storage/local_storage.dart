class LocalStorage {
  static String? _token;
  static String? _refreshToken;
  static String? _user;

  static Future<void> saveToken(String token) async {
    _token = token;
  }

  static Future<String?> getToken() async {
    return _token;
  }

  static Future<void> saveRefreshToken(String token) async {
    _refreshToken = token;
  }

  static Future<String?> getRefreshToken() async {
    return _refreshToken;
  }

  static Future<void> saveUser(String userJson) async {
    _user = userJson;
  }

  static Future<String?> getUser() async {
    return _user;
  }

  static Future<void> clearAll() async {
    _token = null;
    _refreshToken = null;
    _user = null;
  }
}
