const multer = require("multer");
import { createUploadErrorHandler, handleUploadError } from "./upload.utils";

function run(handler: any, err: unknown) {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const next = jest.fn();
  const t = jest.fn((key: string, vars?: Record<string, string>) =>
    vars ? `${key}|${JSON.stringify(vars)}` : key,
  );
  handler(err, { t } as any, res, next);
  return { res, next };
}

describe("upload error handler", () => {
  it("answers an unsupported file type with 415 and the allowed types", () => {
    const { res, next } = run(handleUploadError, new Error("UNSUPPORTED_FILE_TYPE"));
    expect(res.status).toHaveBeenCalledWith(415);
    expect(res.json.mock.calls[0][0].data).toMatch(/^Unsupported file type\. Allowed types:/);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers a file over the limit with 413 naming the actual limit", () => {
    const err = new multer.MulterError("LIMIT_FILE_SIZE");
    const def = run(handleUploadError, err);
    expect(def.res.status).toHaveBeenCalledWith(413);
    expect(def.res.json.mock.calls[0][0].data).toContain('"limit":"30MB"');

    const small = run(createUploadErrorHandler(5 * 1024 * 1024), err);
    expect(small.res.status).toHaveBeenCalledWith(413);
    expect(small.res.json.mock.calls[0][0].data).toContain('"limit":"5MB"');
  });

  it("answers too many files with 400", () => {
    const { res } = run(handleUploadError, new multer.MulterError("LIMIT_FILE_COUNT"));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("Too many files in one upload");
  });

  it("answers any other multer error with 400 and a translated message, not the raw one", () => {
    const err = new multer.MulterError("LIMIT_UNEXPECTED_FILE", "secret");
    const { res } = run(handleUploadError, err);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json.mock.calls[0][0].data).toBe("The file upload could not be processed");
  });

  it("passes an unrelated error on", () => {
    const err = new Error("boom");
    const { res, next } = run(handleUploadError, err);
    expect(next).toHaveBeenCalledWith(err);
    expect(res.status).not.toHaveBeenCalled();
  });
});
