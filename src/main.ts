import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { Logger } from '@nestjs/common'; // Import Logger

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
  Logger.log(`Application is running on: ${await app.getUrl()}`, 'Bootstrap'); // Optional: Log the URL
}

bootstrap().catch((err) => {
  // Add .catch here
  // You can use NestJS logger or console.error
  Logger.error('Failed to bootstrap the application', err, 'Bootstrap');
  // console.error('Failed to bootstrap the application:', err);
  process.exit(1); // Exit with an error code if bootstrap fails
});
