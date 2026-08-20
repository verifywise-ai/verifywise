export class STATUS_CODE {
  // 1XX informational response
  static 100 = (data: any) => {
    return { message: "Continue", data };
  };
  static 101 = (data: any) => {
    return { message: "Switching Protocols", data };
  };
  static 102 = (data: any) => {
    return { message: "Processing", data };
  };
  static 103 = (data: any) => {
    return { message: "Early Hints", data };
  };

  // 2XX success
  static 200 = (data: any) => {
    return { message: "OK", data };
  };
  static 201 = (data: any) => {
    return { message: "Created", data };
  };
  static 202 = (data: any) => {
    return { message: "Accepted", data };
  };
  static 203 = (data: any) => {
    return { message: "Non-Authoritative Information", data };
  };
  static 204 = (data: any) => {
    return { message: "No Content", data };
  };
  static 206 = (data: any) => {
    return { message: "Partial Content", data };
  };

  // 3XX redirection
  static 300 = (data: any) => {
    return { message: "Multiple Choices", data };
  };
  static 301 = (data: any) => {
    return { message: "Moved Permanently", data };
  };
  static 302 = (data: any) => {
    return { message: "Found", data };
  };

  // 4XX client errors
  static 400 = (data: any) => {
    return { message: "Bad Request", data };
  };
  static 401 = (data: any) => {
    return { message: "Unauthorized", data };
  };
  static 402 = (data: any) => {
    return { message: "Payment Required", data };
  };
  static 403 = (data: any) => {
    return { message: "Forbidden", data };
  };
  static 404 = (data: any) => {
    return { message: "Not Found", data };
  };
  static 405 = (data: any) => {
    return { message: "Method Not Allowed", data };
  };
  static 406 = (data: any) => {
    return { message: "Not Acceptable", data };
  };
  static 407 = (data: any) => {
    return { message: "Proxy Authentication Required", data };
  };
  static 408 = (data: any) => {
    return { message: "Request Timeout", data };
  };
  static 409 = (data: any) => {
    return { message: "Conflict", data };
  };
  static 413 = (data: any) => {
    return { message: "Payload Too Large", data };
  };
  static 415 = (data: any) => {
    return { message: "Unsupported Media Type", data };
  };
  static 422 = (data: any) => {
    return { message: "Unprocessable Entity", data };
  };
  static 429 = (data: any) => {
    return { message: "Too Many Requests", data };
  };

  // 5XX server errors
  static 500 = (error: any) => {
    return { message: "Internal Server Error", error };
  };
  static 501 = (error: any) => {
    return { message: "Not Implemented", error };
  };
  static 502 = (error: any) => {
    return { message: "Bad Gateway", error };
  };
  static 503 = (error: any) => {
    return { message: "Service Unavailable", error };
  };
  static 504 = (error: any) => {
    return { message: "Gateway Timeout", error };
  };
}
