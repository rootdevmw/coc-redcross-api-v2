import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest();
    const res = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    // Extract request info
    const method = req.method;
    const url = req.originalUrl || req.url;
    const ip = req.ip;
    const userId = req.user?.id;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
      } else if (typeof response === 'object') {
        message = (response as any).message || message;
        code =
          (response as any).error || (response as any).code || 'HTTP_EXCEPTION';
      }
    }

    // 🔥 LOGGING (this is what you were missing)
    this.logger.error(
      `[${method}] ${url} ${status} - ${message}`,
      exception instanceof Error ? exception.stack : JSON.stringify(exception),
      `IP: ${ip} | User: ${userId ?? 'anonymous'}`,
    );

    res.status(status).json({
      success: false,
      data: null,
      meta: {},
      errors: {
        message,
        code,
      },
    });
  }
}
