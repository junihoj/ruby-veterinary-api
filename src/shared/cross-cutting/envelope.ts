export const RESPONSE_ENVELOPE = Symbol('RESPONSE_ENVELOPE');
export const ERROR_ENVELOPE = Symbol('ERROR_ENVELOPE');

/** Success envelope (§9): every 2xx body is `{ data, meta }`. */
export interface SuccessEnvelope<T> {
  data: T;
  meta: ResponseMeta;
}

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  nextCursor?: string | null;
  limit?: number;
  total?: number;
}

/** Error envelope (§9): `{ error: { code, message, details[], requestId } }`. */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; issue: string }>;
    requestId: string;
  };
}

export function envelope<T>(
  data: T,
  requestId: string,
  pagination?: PaginationMeta,
): SuccessEnvelope<T> {
  return {
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...(pagination ? { pagination } : {}),
    },
  };
}
