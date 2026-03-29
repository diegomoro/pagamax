import { z } from 'zod';

/**
 * PaymentRail enumerates the transaction channels.
 * These map directly to DB enum values.
 */
export const PaymentRailSchema = z.enum([
  'qr',
  'nfc',
  'credit_card',
  'debit_card',
  'prepaid_card',
  'transfer',
  'wallet',
  'unknown',
]);
export type PaymentRail = z.infer<typeof PaymentRailSchema>;

/**
 * CapPeriod defines the reset window for a monetary limit.
 */
export const CapPeriodSchema = z.enum([
  'per_transaction',
  'per_day',
  'per_week',
  'per_month',
  'per_period',
  'total',
]);
export type CapPeriod = z.infer<typeof CapPeriodSchema>;

/**
 * BenefitType classifies the type of value offered to the user.
 */
export const BenefitTypeSchema = z.enum([
  'cashback_percentage',
  'cashback_fixed',
  'discount_percentage',
  'discount_fixed',
  'installments_interest_free',
  'installments_fixed_rate',
  'free_shipping',
  'other',
]);
export type BenefitType = z.infer<typeof BenefitTypeSchema>;

/**
 * Weekday enum for typed schedule validation.
 */
export const WeekdaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export type Weekday = z.infer<typeof WeekdaySchema>;

/**
 * RefundMethod describes how the user receives the benefit value.
 */
export const RefundMethodSchema = z.enum([
  'account_credit',
  'statement_credit',
  'cashback_wallet',
  'points',
  'immediate',
]);
export type RefundMethod = z.infer<typeof RefundMethodSchema>;

/**
 * Promotion is the stable identity record.
 * One row per unique issuer+merchant+offer combination.
 * Versioning is tracked via PromotionVersion.
 */
export const PromotionSchema = z.object({
  id: z.string().uuid(),
  issuerCode: z.string(),
  /** Issuer's internal promotion identifier (e.g., Naranja X's Promo ID UUID). */
  issuerPromoId: z.string().optional(),
  merchantName: z.string().optional(),
  category: z.string().optional(),
  title: z.string(),
  sourceUrl: z.string().url(),
  imageUrl: z.string().url().optional(),
  /** ISO 4217 currency code. Defaults to ARS. All monetary amounts in the bundle use this currency. */
  currency: z.string().default('ARS'),
  /** Whether this promotion can be combined with other promotions from the same issuer. */
  stackable: z.boolean().optional(),
  /** Original stackability text for edge cases. */
  stackingText: z.string().optional(),
  createdAt: z.coerce.date(),
});
export type Promotion = z.infer<typeof PromotionSchema>;

/**
 * PromotionVersion is one snapshot per scrape run.
 * A new version is created when rawHtmlHash changes.
 * isActive tracks whether the promotion is currently live.
 */
export const PromotionVersionSchema = z.object({
  id: z.string().uuid(),
  promotionId: z.string().uuid(),
  rawHtmlHash: z.string(),
  scrapedAt: z.coerce.date(),
  isActive: z.boolean(),
});
export type PromotionVersion = z.infer<typeof PromotionVersionSchema>;

/**
 * Benefit describes one value proposition of the promotion.
 * A promo can have multiple benefits (e.g., cashback + installments).
 *
 * Caps/limits are tracked in the Limit entity, not here.
 */
export const BenefitSchema = z.object({
  type: BenefitTypeSchema,
  /** Percentage value for percentage-type benefits (e.g., 30 for 30%). */
  value: z.number().optional(),
  installments: z.number().optional(),
  interestFree: z.boolean().optional(),
  /** Named installment plan (e.g., "Plan Zeta", "Plan Turbo", "Ahora 12"). */
  planName: z.string().optional(),
  /** True if the promotion is exclusive to this plan (e.g., "exclusiva turbo"). */
  planExclusive: z.boolean().optional(),
  /** How the benefit value is returned to the user. */
  refundMethod: RefundMethodSchema.optional(),
  /** Days until the benefit is credited (0 = immediate). */
  refundDelayDays: z.number().optional(),
  /** Original refund text (e.g., "Reintegro inmediato en tu cuenta"). */
  refundText: z.string().optional(),
});
export type Benefit = z.infer<typeof BenefitSchema>;

/**
 * Limit defines thresholds and caps on using the promotion.
 * All monetary amounts use the promotion's currency.
 */
export const LimitSchema = z.object({
  /** Minimum purchase amount to qualify. */
  minPurchase: z.number().optional(),
  /** Maximum benefit amount per cap period. */
  maxBenefit: z.number().optional(),
  capPeriod: CapPeriodSchema.optional(),
  usesPerPeriod: z.number().optional(),
  /** Whether the cap applies per person (vs per account/card). */
  perPerson: z.boolean().optional(),
  /** Optimal purchase amount to maximize the benefit (e.g., "Comprá por $48.000 y listo"). */
  optimalPurchase: z.number().optional(),
  /** Original cap text for debugging. */
  capText: z.string().optional(),
});
export type Limit = z.infer<typeof LimitSchema>;

/**
 * Schedule defines when the promotion is valid.
 * weekdays uses ISO names via WeekdaySchema.
 */
export const ScheduleSchema = z.object({
  weekdays: z.array(WeekdaySchema),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  /** "HH:MM" 24-hour format */
  timeStart: z.string().optional(),
  timeEnd: z.string().optional(),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/**
 * Condition is a requirement the user must meet.
 * text is always the original (normalized) Spanish text.
 * structured holds any machine-parsed interpretation.
 */
export const ConditionSchema = z.object({
  text: z.string(),
  structured: z.record(z.unknown()).optional(),
});
export type Condition = z.infer<typeof ConditionSchema>;

/** Exclusion is something explicitly not covered by the promotion. */
export const ExclusionSchema = z.object({
  text: z.string(),
});
export type Exclusion = z.infer<typeof ExclusionSchema>;

/**
 * Scope defines where the promotion applies.
 * regions and branches are populated when the promo is geographically restricted.
 */
export const ScopeSchema = z.object({
  type: z.enum(['online', 'in_store', 'both']),
  regions: z.array(z.string()).optional(),
  branches: z.array(z.string()).optional(),
});
export type Scope = z.infer<typeof ScopeSchema>;

/**
 * PaymentRailEntry links a PaymentRail to optional card network metadata.
 */
export const PaymentRailEntrySchema = z.object({
  rail: PaymentRailSchema,
  /** e.g., "Visa", "Mastercard", "Naranja" */
  cardNetwork: z.string().optional(),
  /** e.g., "checking", "savings" */
  accountType: z.string().optional(),
});
export type PaymentRailEntry = z.infer<typeof PaymentRailEntrySchema>;

/**
 * NormalizedPromotionBundle is the complete output of one normalization pass.
 *
 * It is deliberately flat at the top level so each sub-array maps cleanly
 * to a DB table. The bundle is the unit of storage and the unit of output
 * from every issuer adapter's normalizeCandidate() call.
 *
 * Extension note: adding a new sub-entity (e.g., "rewards") means adding
 * a new optional array here and a new schema above. No existing code changes.
 */
export const NormalizedPromotionBundleSchema = z.object({
  promotion: PromotionSchema,
  promotionVersion: PromotionVersionSchema,
  paymentRails: z.array(PaymentRailEntrySchema),
  benefits: z.array(BenefitSchema),
  limits: z.array(LimitSchema),
  schedules: z.array(ScheduleSchema),
  conditions: z.array(ConditionSchema),
  exclusions: z.array(ExclusionSchema),
  scopes: z.array(ScopeSchema),
});
export type NormalizedPromotionBundle = z.infer<typeof NormalizedPromotionBundleSchema>;
