import type { NextFunction, Request, Response } from "express";
import { InferenceHistoryStore } from "./inference-history.js";

export interface ErrorResponse {
  success: false;
  error: string;
  request_id: string;
  details?: string;
}

export type RequestWithRequestId = Request & { requestId?: string };

export function ensureRequestId(req: RequestWithRequestId, res: Response): string {
  if (req.requestId) return req.requestId;

  const incoming = req.header("x-request-id")?.trim();
  const requestId =
    incoming && incoming.length > 0 ? incoming : InferenceHistoryStore.generateRequestId();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  return requestId;
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  ensureRequestId(req as RequestWithRequestId, res);
  next();
}

export function sendError(req: Request, res: Response, status: number, error: string, details?: string): void {
  const requestId = ensureRequestId(req as RequestWithRequestId, res);
  const body: ErrorResponse = {
    success: false,
    error,
    request_id: requestId,
    ...(details ? { details } : {}),
  };
  res.status(status).json(body);
}

