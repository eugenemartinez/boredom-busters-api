import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

@Injectable()
export class JwtRefreshAuthGuard extends AuthGuard('jwt-refresh') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(
    err: any,
    user: TUser,
    info: any,
    _context: ExecutionContext,
    _status?: any,
  ): TUser {
    let errorMessage = 'Invalid or expired refresh token.';

    // Check if 'info' is an Error instance and has a message
    if (
      info instanceof Error &&
      typeof info.message === 'string' &&
      info.message
    ) {
      errorMessage = info.message;
    }
    // Check if 'info' is an object with a string 'message' property
    else if (info && typeof info === 'object' && 'message' in info) {
      const potentialMessage = (info as { message?: unknown }).message;
      if (typeof potentialMessage === 'string' && potentialMessage) {
        errorMessage = potentialMessage;
      }
    }
    // Fallback to 'err' if it's an Error with a message
    else if (
      err instanceof Error &&
      typeof err.message === 'string' &&
      err.message
    ) {
      errorMessage = err.message;
    }

    if (err || !user) {
      throw err || new UnauthorizedException(errorMessage);
    }
    return user;
  }
}
