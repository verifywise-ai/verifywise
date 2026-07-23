export class HttpError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export const parseEnvelope = async <T>(res: Response): Promise<{ status: number; data: T }> => {
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(res.status, text);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new HttpError(res.status, body);
  }
  const data = (body as { data: T }).data;
  return { status: res.status, data };
};
