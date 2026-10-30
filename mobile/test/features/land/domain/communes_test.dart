import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:geosmart_mobile/features/land/domain/entities/parcel_draft.dart';

void main() {
  test('propose les memes communes que le serveur', () {
    final server = jsonDecode(
      File('../api/src/land/communes.json').readAsStringSync(),
    );
    expect(communes, server);
  });
}
