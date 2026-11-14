import { db } from "./client";

type Database = ReturnType<typeof db>;

/**
 * Runs several writes as ONE all-or-nothing unit.
 *
 * Production uses the Neon HTTP driver, which has no interactive transactions but can send a list of
 * statements that Postgres runs in a single transaction (`db.batch`). Tests run on an embedded Postgres
 * whose driver has real transactions, so the same list runs inside `db.transaction` there.
 *
 * `build` receives the database (or the transaction) and returns the UN-AWAITED statements, in order:
 *
 *   await runAtomically((d) => [d.delete(a).where(...), d.insert(b).values(...)]);
 *
 * Never await a statement inside `build`: that would run it outside the unit.
 */
export async function runAtomically(build: (d: Database) => unknown[]): Promise<void> {
  const d = db();
  const driver = d as unknown as {
    batch?: (statements: unknown[]) => Promise<unknown>;
    transaction?: (fn: (tx: Database) => Promise<void>) => Promise<void>;
  };

  if (typeof driver.batch === "function") {
    const statements = build(d);
    if (statements.length > 0) await driver.batch(statements);
    return;
  }
  if (typeof driver.transaction === "function") {
    await driver.transaction(async (tx) => {
      for (const statement of build(tx)) await (statement as PromiseLike<unknown>);
    });
    return;
  }
  throw new Error("This database client cannot run atomic writes.");
}
