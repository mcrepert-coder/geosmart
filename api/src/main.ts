import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // En-tetes de securite. La ressource reste lisible depuis le site et
  // l'application (autre origine), d'ou cross-origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('GeoSmart API')
    .setDescription(
      'Documentation des routes HTTP de l API GeoSmart. Contrats detailes dans le dossier contracts/ du depot.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'GeoSmart API',
  });

  await app.listen(process.env.API_PORT ?? 3000);
}
bootstrap();
