import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // @Get() // Comment out or change path e.g. @Get('hello')
  // getHello(): string {
  //   return this.appService.getHello();
  // }

  @Get('ping')
  getPong(): string {
    return 'pong';
  }
}
