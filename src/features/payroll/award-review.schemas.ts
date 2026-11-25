import { z } from 'zod'
import {
  awardFormSchema,
  awardHistorySchema,
  awardInputFields,
  awardQuantitySchema,
  saveAwardSchema,
  validateAwardSourceReference,
  withdrawAwardSchema,
} from './award-proposals.schemas'
import { salaryFormSchema, salarySaveSchema } from './salary.schemas'
import { bonusCalculationSchema } from './bonus-rules.schemas'

const command = withdrawAwardSchema.shape
const reviewFields = {
  expectedVersion: command.expectedVersion,
  requestId: command.requestId,
  reason: command.reason,
  decision: z.enum(['approved', 'rejected', 'revoked'], {
    error: 'აირჩიეთ განხილვის შედეგი.',
  }),
  evidenceVerified: z.boolean({
    error: 'დაადასტურეთ მონაცემების გადამოწმება.',
  }),
}
function verified(
  v: { decision: string; evidenceVerified: boolean },
  ctx: z.RefinementCtx,
) {
  if (v.decision === 'approved' && !v.evidenceVerified)
    ctx.addIssue({
      code: 'custom',
      path: ['evidenceVerified'],
      message:
        'დამტკიცებამდე დაადასტურეთ მტკიცებულებისა და თანხის გადამოწმება.',
    })
}
export const reviewAwardSchema = z
  .strictObject(
    { proposalId: command.proposalId, ...reviewFields },
    { error: 'განხილვის მონაცემები არასწორია.' },
  )
  .superRefine(verified)
export const reviewPoolSchema = z
  .strictObject(
    { poolId: command.proposalId, ...reviewFields },
    { error: 'ფონდის განხილვის მონაცემები არასწორია.' },
  )
  .superRefine(verified)
export const awardReviewFormSchema = z
  .object(
    {
      reason: command.reason,
      decision: reviewFields.decision,
      evidenceVerified: reviewFields.evidenceVerified,
    },
    { error: 'განხილვის მონაცემები არასწორია.' },
  )
  .superRefine(verified)
const { userId, ...poolFields } = awardInputFields
const allocation = z.strictObject(
  { userId, amountMinor: salarySaveSchema.shape.amountMinor },
  { error: 'ბენეფიციარის წილი არასწორია.' },
)
export const saveAwardPoolSchema = z
  .strictObject(
    {
      ...poolFields,
      poolId: command.proposalId.nullable(),
      expectedVersion: saveAwardSchema.shape.expectedVersion,
      requestId: command.requestId,
      quantityMilli: saveAwardSchema.shape.quantityMilli,
      allocations: z
        .array(allocation, { error: 'აირჩიეთ ბენეფიციარები.' })
        .min(2, 'ფონდს უნდა ჰყავდეს მინიმუმ ორი ბენეფიციარი.')
        .max(20, 'ერთ ფონდში აირჩიეთ მაქსიმუმ 20 ბენეფიციარი.')
        .refine(
          (rows) => new Set(rows.map((r) => r.userId)).size === rows.length,
          'ბენეფიციარები არ უნდა განმეორდეს.',
        ),
    },
    { error: 'ფონდის მონაცემები არასწორია.' },
  )
  .superRefine((v, ctx) => {
    validateAwardSourceReference(v, ctx)
    if ((v.poolId === null) !== (v.expectedVersion === 0))
      ctx.addIssue({
        code: 'custom',
        path: ['expectedVersion'],
        message: 'განაახლეთ ფონდის ვერსია.',
      })
  })
const { expectedRuleVersion: _ruleVersion, ...poolFormFields } = poolFields
export const awardPoolFormSchema = z
  .object(
    {
      ...poolFormFields,
      calculation: bonusCalculationSchema,
      quantity: awardQuantitySchema,
      allocations: z
        .array(
          z.object(
            { userId, amount: salaryFormSchema.shape.amount },
            { error: 'ბენეფიციარის წილი არასწორია.' },
          ),
          { error: 'აირჩიეთ ბენეფიციარები.' },
        )
        .min(2, 'აირჩიეთ მინიმუმ ორი ბენეფიციარი.')
        .max(20, 'აირჩიეთ მაქსიმუმ 20 ბენეფიციარი.'),
    },
    { error: 'ფონდის მონაცემები არასწორია.' },
  )
  .superRefine((v, ctx) => {
    const parsed = awardFormSchema.safeParse({
      userId: v.allocations[0]?.userId ?? 'selected',
      ruleId: v.ruleId,
      workDate: v.workDate,
      jobId: v.jobId,
      reference: v.reference,
      evidence: v.evidence,
      reason: v.reason,
      quantity: v.quantity,
      calculation: v.calculation,
    })
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: issue.path,
          message: issue.message,
        })
  })
export const poolIdSchema = z.object(
  { poolId: command.proposalId },
  { error: 'ფონდის იდენტიფიკატორი არასწორია.' },
)
export const awardPoolDetailSchema = poolIdSchema.extend(
  awardHistorySchema.shape,
)
export const withdrawAwardPoolSchema = z.strictObject(
  {
    poolId: command.proposalId,
    expectedVersion: command.expectedVersion,
    requestId: command.requestId,
    reason: command.reason,
  },
  { error: 'ფონდის გაუქმების მონაცემები არასწორია.' },
)
