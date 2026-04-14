import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  requestId: string;
};

const requestStorage = new AsyncLocalStorage<RequestContext>();

export function enterRequestContext(context: RequestContext): void {
  requestStorage.enterWith(context);
}

export function getRequestId(): string | undefined {
  return requestStorage.getStore()?.requestId;
}
