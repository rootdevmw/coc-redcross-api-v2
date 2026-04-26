import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<{ userId?: bigint }>();

  run(context: { userId?: bigint }, fn: () => void) {
    this.storage.run(context, fn);
  }

  getUserId(): bigint | undefined {
    return this.storage.getStore()?.userId;
  }
}
