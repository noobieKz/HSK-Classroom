export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'REQUEST_FAILED',
  ) {
    super(message);
  }
}
export function invariant(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export function publicError(error: unknown) {
  if (error instanceof AppError)
    return { status: error.status, message: error.message, code: error.code };
  // Never serialize upstream exceptions, request URLs or bodies: OAuth secrets may be present.
  return {
    status: 500,
    message: 'Không thể hoàn tất. Tải lại để kiểm tra kết quả trước khi thử lại.',
    code: 'INTERNAL_ERROR',
  };
}
