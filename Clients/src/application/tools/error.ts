export class APIError extends Error {
  constructor(
    public message: string,
    public status?: number,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = `APIError_${status || "Unknown"}`; // Example: "APIError_404"
  }
}
