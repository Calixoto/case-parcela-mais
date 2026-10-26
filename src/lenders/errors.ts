/** A lender integration answered with an HTTP error (the fake Delta returns 500 in 30% of the calls). */
export class LenderHttpError extends Error {
  readonly status: number;

  constructor(status: number, message = `Lender responded with HTTP ${status}`) {
    super(message);
    this.name = 'LenderHttpError';
    this.status = status;
  }
}
