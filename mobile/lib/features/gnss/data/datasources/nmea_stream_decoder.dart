import 'dart:convert';

import 'package:nmea/nmea.dart';

class NmeaStreamDecoder {
  Stream<NmeaSentence> decode(Stream<List<int>> bytes) {
    return bytes
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .transform(NmeaDecoder(onlyAllowValid: true));
  }
}
