import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js'; // Adjusted for ESM and relative path
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express'; // Vercel typically needs Express for NestJS
import { INestApplication } from '@nestjs/common';

// This will hold the initialized NestJS application instance (via its Express adapter)
let expressApp: express.Express | undefined;
let isNestAppReady = false;

// This function creates and initializes the NestJS application for Vercel.
async function bootstrapNestAppForVercel(): Promise<express.Express> {
  const newExpressApp = express(); // Create a new Express app instance
  const nestAppInstance: INestApplication = await NestFactory.create(
    AppModule,
    new ExpressAdapter(newExpressApp), // Use the Express adapter
  );

  nestAppInstance.enableCors(); // Enable CORS - configure as needed
  // Add any other NestJS app configurations here that are specific to Vercel
  // e.g., global pipes, interceptors, if they differ from local setup

  await nestAppInstance.init(); // Initialize the NestJS application
  return newExpressApp; // Return the configured Express app
}

async function ensureNestAppIsReady() {
  if (!isNestAppReady || !expressApp) {
    console.log('NestJS application is not ready. Bootstrapping for Vercel...');
    try {
      expressApp = await bootstrapNestAppForVercel();
      isNestAppReady = true;
      console.log('NestJS application bootstrapped and ready for Vercel.');
    } catch (error) {
      console.error(
        'Failed to bootstrap NestJS application for Vercel:',
        error,
      );
      isNestAppReady = false; // Ensure it retries if bootstrap fails
      expressApp = undefined;
      throw error; // Re-throw to be caught by the handler
    }
  }
}

// Vercel Serverless Function Handler
export default async (req: express.Request, res: express.Response) => {
  try {
    await ensureNestAppIsReady();

    if (expressApp) {
      expressApp(req, res); // Forward requests to the Express server (which NestJS uses)
    } else {
      // This case should ideally not be reached if ensureNestAppIsReady throws on failure
      console.error(
        'NestJS Express app instance is not available in Vercel handler after bootstrap attempt.',
      );
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Server Error: Application not initialized.');
    }
  } catch (error) {
    // Error during ensureNestAppIsReady or if expressApp somehow fails
    console.error('Error in Vercel handler for NestJS:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error: Handler failed.');
  }
};
