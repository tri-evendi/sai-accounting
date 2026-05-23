export const APP_NAME = "SAI Management";
export const COMPANY_NAME = "PT Subur Anugerah Indonesia";
export const COMPANY_ADDRESS = "Komplek Pergudangan Kapuk Ecopark, Jakarta";

export const ROLES = {
  BOS: "bos",
  CORE: "core",
  PTG: "ptg",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_LABELS: Record<Role, string> = {
  bos: "Manager",
  core: "Staff",
  ptg: "PTG Department",
};

export const CURRENCIES = ["USD", "CNY", "IDR"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CONTRACT_STATUSES = ["signed", "pending", "canceled"] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

export const STATUS_COLORS: Record<ContractStatus, string> = {
  signed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  canceled: "bg-red-100 text-red-800",
};

export const CASH_TYPES = ["bank", "kas_besar", "kas_kecil"] as const;
export type CashType = (typeof CASH_TYPES)[number];

export const CASH_TYPE_LABELS: Record<CashType, string> = {
  bank: "Bank",
  kas_besar: "Kas Besar",
  kas_kecil: "Kas Kecil",
};

export const ROLE_DASHBOARDS: Record<Role, string> = {
  bos: "/finance",
  core: "/finance",
  ptg: "/inventory",
};

/** Items at or below this quantity (same unit as stock) are flagged as low stock. */
export const LOW_STOCK_THRESHOLD = 100;
