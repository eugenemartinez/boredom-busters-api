import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    info: any, // 'info' can be an error object or an object with a message property
    _context: ExecutionContext,
    _status?: any,
  ): TUser {
    let errorMessage = 'User is not authenticated or token is invalid';

    // 1. Check 'err' first
    if (err instanceof Error) {
      // If err is an Error, its message property is a string.
      if (typeof err.message === 'string' && err.message) {
        errorMessage = err.message;
      }
    }
    // 2. Check if 'info' is an Error instance
    else if (info instanceof Error) {
      // If info is an Error, its message property is a string.
      // This block should correctly narrow the type of 'info' to 'Error'.
      if (typeof info.message === 'string' && info.message) {
        errorMessage = info.message; // Accessing info.message after instanceof check
      }
    }
    // 3. Check if 'info' is an object with a string 'message' property
    else if (info && typeof info === 'object' && 'message' in info) {
      // To be absolutely safe with 'any', access 'message' after casting
      // and then check the type of the accessed property.
      const potentialMessage = (info as { message?: unknown }).message;
      if (typeof potentialMessage === 'string' && potentialMessage) {
        errorMessage = potentialMessage;
      }
    }

    if (err || !user) {
      throw err || new UnauthorizedException(errorMessage);
    }
    return user;
  }
}
