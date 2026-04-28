import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseWrapperInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      map((data) => {
        return {
          success: true,
          data: data?.data ?? data ?? null,
          meta: data?.meta ?? {},
          errors: {}, // always empty on success
        };
      }),
    );
  }
}
