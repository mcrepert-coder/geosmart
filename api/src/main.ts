import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // En-tetes de securite. La ressource reste lisible depuis le site et
  // l'application (autre origine), d'ou cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });
  await app.listen(process.env.API_PORT ?? 3000);
}
bootstrap();
