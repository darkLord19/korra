export { ForbiddenError, NotFoundError, ValidationError } from "@korra/db/iso";

/** No (valid) session. Web should redirect to sign-in. */
export class UnauthenticatedError extends Error {
  override name = "UnauthenticatedError";
  constructor(message = "Not signed in") {
    super(message);
  }
}
