export class JwtService {
  private lastPayload: unknown = { sub: 'mock-user-id' };

  sign(payload: any): string {
    this.lastPayload = payload;
    return 'mock-jwt-token';
  }

  verify(token: string): any {
    void token;
    return this.lastPayload;
  }

  signAsync(payload: any): Promise<string> {
    return Promise.resolve(this.sign(payload));
  }

  verifyAsync(token: string): Promise<any> {
    return Promise.resolve(this.verify(token));
  }
}

export class JwtModule {
  static register(options: any) {
    void options;
    return {
      module: JwtModule,
      providers: [JwtService],
      exports: [JwtService],
    };
  }

  static registerAsync(options: any) {
    void options;
    return {
      module: JwtModule,
      providers: [JwtService],
      exports: [JwtService],
    };
  }
}
