/** A write was attempted by an actor that may only read (a CA). */
export class ForbiddenError extends Error {
  override name = "ForbiddenError";
  constructor(message = "Forbidden") {
    super(message);
  }
}

/** Missing row, or a row the actor may not see. The two are deliberately indistinguishable. */
export class NotFoundError extends Error {
  override name = "NotFoundError";
  constructor(message = "Not found") {
    super(message);
  }
}

export class ValidationError extends Error {
  override name = "ValidationError";
  constructor(message: string) {
    super(message);
  }
}
