import { z } from "zod";
import { vmsg } from "@/lib/i18n/validation";
import { ACCOUNT_TYPE_VALUES } from "@/lib/accounting";
import { CURRENCIES } from "@/lib/constants";

// normal_balance is derived from `type` on the server (see normalBalanceFor); not user input.
export const accountSchema = z.object({
  code: z.string().min(1, vmsg("validation.accountCodeRequired")).max(20).trim(),
  name: z.string().min(1, vmsg("validation.accountNameRequired")).max(150).trim(),
  type: z.enum(ACCOUNT_TYPE_VALUES),
  parentId: z.coerce.number().int().positive().nullable().optional(),
  currency: z.enum(CURRENCIES).default("IDR"),
  isActive: z.boolean().optional(),
});

export type AccountInput = z.infer<typeof accountSchema>;
