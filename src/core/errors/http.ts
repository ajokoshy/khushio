import { AppError } from "./index";

/** Turns a thrown error into a JSON response. Unknown errors never leak details. */
export function errorResponse(error: unknown): Response {
  if (error instanceof AppError && error.status < 500) {
    return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  }
  console.error(error);
  return Response.json({ error: "INTERNAL", message: "Something went wrong" }, { status: 500, headers: { "Cache-Control": "no-store" } });
}
