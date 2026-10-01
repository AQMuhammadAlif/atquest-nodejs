import { Response } from "express";

type Envelope = {
  success: boolean;
  status: number;
  message: string;
  data: unknown;
};

function send(res: Response, status: number, message: string, data: unknown) {
  const body: Envelope = { success: status < 400, status, message, data };
  res.status(status).json(body);
}

export function ok(res: Response, data: unknown) {
  send(res, 200, "success", data);
}

export function created(res: Response, data: unknown) {
  send(res, 201, "success", data);
}

export function fail(res: Response, status: number, message: string) {
  send(res, status, message, null);
}
