import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import type { db } from '#/db'

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Account and employment writes can lock both the acting and target employee. */
export async function lockAccountManagement(tx: Transaction) {
  await tx.execute(sql`select pg_advisory_xact_lock(812736, 1)`)
}
