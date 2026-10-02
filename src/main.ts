import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Cabeceras de seguridad basicas
  app.use(helmet());

  // Rechaza cualquier campo no declarado en los DTOs (defensa en profundidad)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({ origin: process.env.CORS_ORIGIN?.split(',') ?? false, credentials: true });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
