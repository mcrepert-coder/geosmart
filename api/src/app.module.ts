import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuditModule } from './audit/audit.module';
import { LandModule } from './land/land.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (): TypeOrmModuleOptions => {
        const url = process.env.DATABASE_URL;
        if (!url) {
          throw new Error('DATABASE_URL must be set to start the API.');
        }

        return {
          type: 'postgres',
          url,
          migrations: [__dirname + '/**/migrations/*{.js,.ts}'],
          migrationsRun: true,
          synchronize: false,
        };
      },
    }),
    AuditModule,
    LandModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
