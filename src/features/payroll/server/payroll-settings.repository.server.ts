import '@tanstack/react-start/server-only'
import { desc, eq, lte, sql } from 'drizzle-orm'
import { db } from '#/db'
import { employee, payrollPolicy, user } from '#/db/schema'

export const transactPayrollSettings = db.transaction.bind(db)
export type PayrollTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]

export async function currentAccount(tx: PayrollTransaction, actorId: string) {
  // Share locks keep access revocation from committing between authorization and the policy save.
  const account = (
    await tx
      .select({
        roles: user.roles,
        permissionOverrides: user.permissionOverrides,
        state: user.accessState,
      })
      .from(user)
      .where(eq(user.id, actorId))
      .for('share')
  ).at(0)
  const person = (
    await tx
      .select({ status: employee.status })
      .from(employee)
      .where(eq(employee.userId, actorId))
      .for('share')
  ).at(0)
  return { account, person }
}

export async function lockPolicy(tx: PayrollTransaction) {
  // Also serializes the first save, when no policy row exists yet.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('team-adwings-payroll-policy'))`,
  )
}
export async function latestPolicy(tx: PayrollTransaction) {
  return (
    await tx
      .select()
      .from(payrollPolicy)
      .orderBy(desc(payrollPolicy.version))
      .limit(1)
  ).at(0)
}
export async function effectivePolicy(tx: PayrollTransaction, date: string) {
  return (
    await tx
      .select()
      .from(payrollPolicy)
      .where(lte(payrollPolicy.effectiveFrom, date))
      .orderBy(desc(payrollPolicy.effectiveFrom), desc(payrollPolicy.version))
      .limit(1)
  ).at(0)
}
export async function insertPolicy(
  tx: PayrollTransaction,
  data: typeof payrollPolicy.$inferInsert,
) {
  return (await tx.insert(payrollPolicy).values(data).returning())[0]
}
