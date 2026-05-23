import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import bcrypt from "bcrypt";

const url = new URL(process.env.DATABASE_URL!);
const adapter = new PrismaMariaDb({
  host: url.hostname,
  port: Number(url.port) || 3306,
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
});
const prisma = new PrismaClient({ adapter });

// Helper: random date in last N months
function randomDate(monthsBack: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - Math.floor(Math.random() * monthsBack));
  d.setDate(Math.floor(Math.random() * 28) + 1);
  return d;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  if (process.env.ALLOW_SEED !== "true") {
    console.error("════════════════════════════════════════════════════════");
    console.error("  Seed blocked — demo data is for development only.");
    console.error("");
    console.error("  To seed locally:  ALLOW_SEED=true npm run db:seed");
    console.error("  For production:   npm run create-admin -- --username ... --password ...");
    console.error("════════════════════════════════════════════════════════");
    process.exit(1);
  }

  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: Refusing to seed while NODE_ENV=production");
    process.exit(1);
  }

  console.log("🌱 Seeding database with demo data...\n");

  // ═══════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════
  const users = [
    { username: "admin", password: "admin123", name: "Administrator", role: "bos", status: 0 },
    { username: "staff", password: "staff123", name: "Staff User", role: "core", status: 0 },
    { username: "ptg", password: "ptg123", name: "PTG User", role: "ptg", status: 0 },
    { username: "erwin", password: "erwin123", name: "Erwin Saputra", role: "bos", status: 0 },
    { username: "sari", password: "sari1234", name: "Sari Dewi", role: "core", status: 0 },
  ];

  for (const user of users) {
    const hashed = await bcrypt.hash(user.password, 12);
    await prisma.user.upsert({
      where: { username: user.username },
      update: {},
      create: { username: user.username, password: hashed, name: user.name, role: user.role, status: user.status },
    });
  }
  console.log("  ✓ 5 users created");

  // ═══════════════════════════════════════════════
  // ITEMS (Inventory master)
  // ═══════════════════════════════════════════════
  const itemNames = [
    { name: "White Pepper", unit: "kg" },
    { name: "Black Pepper", unit: "kg" },
    { name: "Cassia Vera", unit: "kg" },
    { name: "Clove", unit: "kg" },
    { name: "Nutmeg", unit: "kg" },
    { name: "Star Anise", unit: "kg" },
    { name: "Cinnamon Stick", unit: "kg" },
    { name: "Dried Ginger", unit: "kg" },
    { name: "Turmeric Powder", unit: "kg" },
    { name: "Cardamom", unit: "kg" },
  ];

  const itemRecords = [];
  for (const item of itemNames) {
    const record = await prisma.item.upsert({
      where: { name: item.name },
      update: {},
      create: item,
    });
    itemRecords.push(record);
  }
  console.log("  ✓ 10 inventory items created");

  // ═══════════════════════════════════════════════
  // STOCK MOVEMENTS
  // ═══════════════════════════════════════════════
  for (const item of itemRecords) {
    // 3-5 stock-in movements over last 6 months
    const inCount = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < inCount; i++) {
      await prisma.stock.create({
        data: {
          itemId: item.id,
          quantity: Math.floor(Math.random() * 5000) + 500,
          type: "in",
          date: randomDate(6),
          note: pick(["From supplier", "Warehouse receive", "Purchase order", "Import shipment"]),
        },
      });
    }
    // 1-3 stock-out movements
    const outCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < outCount; i++) {
      await prisma.stock.create({
        data: {
          itemId: item.id,
          quantity: Math.floor(Math.random() * 2000) + 200,
          type: "out",
          date: randomDate(4),
          note: pick(["Shipment to buyer", "Export container", "Customer order", "Sample shipment"]),
        },
      });
    }
  }
  console.log("  ✓ Stock movements created");

  // ═══════════════════════════════════════════════
  // SUPPLIERS
  // ═══════════════════════════════════════════════
  const supplierData = [
    { name: "PT Spice Indonesia", address: "Jl. Raya Bogor Km 30, Jakarta Timur", phone: "021-8765432", email: "info@spiceindonesia.co.id" },
    { name: "CV Rempah Nusantara", address: "Jl. Pahlawan No. 45, Surabaya", phone: "031-7654321", email: "order@rempahnusantara.com" },
    { name: "PT Bangka Pepper", address: "Jl. Mawar No. 12, Pangkal Pinang, Bangka", phone: "0717-421234", email: "sales@bangkapepper.com" },
    { name: "UD Lampung Jaya", address: "Jl. Kartini No. 88, Bandar Lampung", phone: "0721-253456", email: "lampungjaya@gmail.com" },
    { name: "CV Sulawesi Spice", address: "Jl. Sam Ratulangi No. 15, Manado", phone: "0431-851234", email: "sulawesispice@yahoo.com" },
    { name: "PT Kalimantan Herbs", address: "Jl. Pangeran Antasari No. 7, Banjarmasin", phone: "0511-321456", email: "info@kalherbs.co.id" },
  ];

  const supplierRecords = [];
  for (const s of supplierData) {
    const existing = await prisma.supplier.findFirst({ where: { name: s.name } });
    if (existing) {
      supplierRecords.push(existing);
    } else {
      const record = await prisma.supplier.create({ data: s });
      supplierRecords.push(record);
    }
  }
  console.log("  ✓ 6 suppliers created");

  // Supplier transactions
  for (const supplier of supplierRecords) {
    const txCount = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < txCount; i++) {
      await prisma.supplierTransaction.create({
        data: {
          supplierId: supplier.id,
          date: randomDate(6),
          type: pick(["deposit", "receive", "deposit", "payment"]),
          amount: Math.floor(Math.random() * 50000000) + 5000000,
          currency: pick(["IDR", "IDR", "IDR", "USD"]),
          note: pick(["Deposit for next shipment", "Payment for goods", "Advance payment", "Final payment", "Partial payment"]),
        },
      });
    }
  }
  console.log("  ✓ Supplier transactions created");

  // ═══════════════════════════════════════════════
  // CUSTOMERS
  // ═══════════════════════════════════════════════
  const customerData = [
    { name: "Guangxi Tianqin Foods", address: "No. 88 Minzu Road, Nanning, Guangxi, China", phone: "+86-771-5551234", email: "import@tianqinfoods.cn", pic: "Mr. Zhang Wei" },
    { name: "Shanghai Spice Trading Co.", address: "1200 Zhongshan Road, Shanghai, China", phone: "+86-21-6234567", email: "purchase@shanghaiSpice.cn", pic: "Ms. Li Mei" },
    { name: "Vietnam Pepper Export JSC", address: "45 Nguyen Hue Blvd, Ho Chi Minh City, Vietnam", phone: "+84-28-38221234", email: "trade@vnpepper.vn", pic: "Mr. Tran Duc" },
    { name: "Indian Spice Importers Pvt", address: "Plot 12, MIDC, Navi Mumbai, India", phone: "+91-22-27651234", email: "buy@indianspice.in", pic: "Mr. Rajesh Kumar" },
    { name: "Euro Spice GmbH", address: "Hafenstraße 15, 20095 Hamburg, Germany", phone: "+49-40-3456789", email: "sourcing@eurospice.de", pic: "Mr. Klaus Mueller" },
    { name: "PT Bumbu Masakan Indonesia", address: "Jl. Industri Raya No. 22, Tangerang", phone: "021-5523456", email: "procurement@bumbumasakan.co.id", pic: "Ibu Ratna" },
    { name: "Singapore Trading Pte Ltd", address: "10 Anson Road #12-05, Singapore 079903", phone: "+65-6223-4567", email: "trade@sgtrading.sg", pic: "Mr. Tan Ah Kow" },
    { name: "Tokyo Spice Corporation", address: "3-5-1 Nihonbashi, Chuo-ku, Tokyo, Japan", phone: "+81-3-3271-1234", email: "import@tokyospice.jp", pic: "Mr. Tanaka Kenji" },
  ];

  for (const c of customerData) {
    const existing = await prisma.customer.findFirst({ where: { name: c.name } });
    if (!existing) {
      await prisma.customer.create({ data: c });
    }
  }
  console.log("  ✓ 8 customers created");

  // ═══════════════════════════════════════════════
  // CONTRACTS
  // ═══════════════════════════════════════════════
  const buyers = customerData.map((c) => c.name);
  const consignees = ["Same as buyer", "Guangxi Warehouse", "Shanghai Port", "Ho Chi Minh Port", "Mumbai Port", "Hamburg Port", null];
  const packagings = ["PP Bag", "Jute Bag", "Carton Box", "Vacuum Pack", "PP Woven Bag"];
  const shipments = ["CIF Shanghai", "FOB Jakarta", "CIF Hamburg", "CIF Ho Chi Minh", "FOB Surabaya", "CIF Mumbai", "CIF Singapore", "CIF Tokyo"];
  const statuses: ("signed" | "pending" | "canceled")[] = ["signed", "signed", "signed", "pending", "pending", "canceled"];

  const contractsData = [
    { no: "SAI-2025-001", buyer: buyers[0], currency: "USD", months: 8 },
    { no: "SAI-2025-002", buyer: buyers[1], currency: "CNY", months: 7 },
    { no: "SAI-2025-003", buyer: buyers[2], currency: "USD", months: 6 },
    { no: "SAI-2025-004", buyer: buyers[3], currency: "USD", months: 5 },
    { no: "SAI-2025-005", buyer: buyers[4], currency: "USD", months: 5 },
    { no: "SAI-2025-006", buyer: buyers[5], currency: "IDR", months: 4 },
    { no: "SAI-2025-007", buyer: buyers[0], currency: "CNY", months: 3 },
    { no: "SAI-2025-008", buyer: buyers[6], currency: "USD", months: 3 },
    { no: "SAI-2026-001", buyer: buyers[1], currency: "CNY", months: 2 },
    { no: "SAI-2026-002", buyer: buyers[7], currency: "USD", months: 2 },
    { no: "SAI-2026-003", buyer: buyers[3], currency: "USD", months: 1 },
    { no: "SAI-2026-004", buyer: buyers[5], currency: "IDR", months: 1 },
    { no: "SAI-2026-005", buyer: buyers[2], currency: "USD", months: 0 },
    { no: "SAI-2026-006", buyer: buyers[6], currency: "USD", months: 0 },
    { no: "SAI-2026-007", buyer: buyers[4], currency: "USD", months: 0 },
  ];

  for (const cd of contractsData) {
    const existing = await prisma.contract.findFirst({ where: { contractNo: cd.no } });
    if (existing) continue;

    const status = pick(statuses);
    const itemCount = 1 + Math.floor(Math.random() * 3);
    const selectedItems = [];
    for (let i = 0; i < itemCount; i++) {
      const item = pick(itemNames);
      if (!selectedItems.includes(item.name)) selectedItems.push(item.name);
    }

    const date = new Date();
    date.setMonth(date.getMonth() - cd.months);
    date.setDate(Math.floor(Math.random() * 28) + 1);

    const priceMultiplier = cd.currency === "IDR" ? 100000 : cd.currency === "CNY" ? 50 : 1;

    const contract = await prisma.contract.create({
      data: {
        contractNo: cd.no,
        date,
        buyer: cd.buyer,
        consignee: pick(consignees),
        packaging: pick(packagings),
        shipment: pick(shipments),
        top1: pick(["T/T 30% deposit, 70% before shipment", "L/C at sight", "T/T 100% before shipment", "T/T 50% deposit, 50% after BL"]),
        top2: pick(["Payment within 30 days of BL date", "Payment upon receipt of documents", null]),
        currency: cd.currency,
        status,
        items: {
          create: selectedItems.map((itemName) => ({
            itemName,
            bags: Math.floor(Math.random() * 500) + 50,
            kgPerBag: pick([25, 50, 60]),
            pricePerKg: Math.round((Math.random() * 10 + 3) * priceMultiplier * 100) / 100,
          })),
        },
      },
      include: { items: true },
    });

    // Add payments for signed contracts
    if (status === "signed") {
      const totalValue = contract.items.reduce(
        (sum, item) => sum + Number(item.bags) * Number(item.kgPerBag) * Number(item.pricePerKg),
        0
      );

      // 1-3 payments
      const paymentCount = 1 + Math.floor(Math.random() * 3);
      let paidSoFar = 0;
      for (let i = 0; i < paymentCount; i++) {
        const isLast = i === paymentCount - 1;
        const amount = isLast
          ? Math.round((totalValue - paidSoFar) * 100) / 100
          : Math.round(totalValue * (0.2 + Math.random() * 0.3) * 100) / 100;

        if (amount <= 0) continue;
        paidSoFar += amount;

        const payDate = new Date(date);
        payDate.setDate(payDate.getDate() + (i + 1) * 15);

        await prisma.contractPayment.create({
          data: {
            contractId: contract.id,
            date: payDate,
            amount,
            currency: cd.currency,
            note: pick(["Deposit payment", "Second payment", "Final payment", "Advance", "Balance payment"]),
          },
        });
      }
    } else if (status === "pending") {
      // Maybe partial payment
      if (Math.random() > 0.5) {
        const totalValue = contract.items.reduce(
          (sum, item) => sum + Number(item.bags) * Number(item.kgPerBag) * Number(item.pricePerKg),
          0
        );
        await prisma.contractPayment.create({
          data: {
            contractId: contract.id,
            date: new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000),
            amount: Math.round(totalValue * 0.3 * 100) / 100,
            currency: cd.currency,
            note: "Deposit 30%",
          },
        });
      }
    }
  }
  console.log("  ✓ 15 contracts with items & payments created");

  // ═══════════════════════════════════════════════
  // INVOICES
  // ═══════════════════════════════════════════════
  const invoiceData = [
    { no: "INV-2025-001", months: 7 },
    { no: "INV-2025-002", months: 6 },
    { no: "INV-2025-003", months: 5 },
    { no: "INV-2025-004", months: 4 },
    { no: "INV-2025-005", months: 3 },
    { no: "INV-2026-001", months: 2 },
    { no: "INV-2026-002", months: 2 },
    { no: "INV-2026-003", months: 1 },
    { no: "INV-2026-004", months: 1 },
    { no: "INV-2026-005", months: 0 },
    { no: "INV-2026-006", months: 0 },
    { no: "INV-2026-007", months: 0 },
  ];

  for (const inv of invoiceData) {
    const existing = await prisma.invoice.findFirst({ where: { invoiceNo: inv.no } });
    if (existing) continue;

    const status = pick(statuses);
    const date = new Date();
    date.setMonth(date.getMonth() - inv.months);
    date.setDate(Math.floor(Math.random() * 28) + 1);

    const itemCount = 1 + Math.floor(Math.random() * 4);
    const items = [];
    for (let i = 0; i < itemCount; i++) {
      items.push({
        itemName: pick(itemNames).name,
        quantity: Math.floor(Math.random() * 3000) + 100,
        price: Math.floor(Math.random() * 150000) + 10000,
        unit: "kg",
      });
    }

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNo: inv.no,
        date,
        status,
        items: { create: items },
      },
      include: { items: true },
    });

    // Payments for signed invoices
    if (status === "signed") {
      const totalValue = invoice.items.reduce(
        (sum, item) => sum + Number(item.quantity) * Number(item.price),
        0
      );
      await prisma.invoicePayment.create({
        data: {
          invoiceId: invoice.id,
          date: new Date(date.getTime() + 14 * 24 * 60 * 60 * 1000),
          amount: totalValue,
          currency: "IDR",
          note: "Full payment",
        },
      });
    }
  }
  console.log("  ✓ 12 invoices with items & payments created");

  // ═══════════════════════════════════════════════
  // CASH ACCOUNTS (Financial transactions)
  // ═══════════════════════════════════════════════
  const cashTypes = ["bank", "kas_besar", "kas_kecil"] as const;
  const currencies = ["IDR", "USD", "CNY"] as const;

  const descriptions = {
    bank: {
      debit: ["Contract payment received", "Wire transfer in", "Export payment", "Deposit from buyer", "LC payment received"],
      credit: ["Supplier payment", "Bank charges", "Transfer to Kas Besar", "Tax payment", "Wire transfer out"],
    },
    kas_besar: {
      debit: ["Transfer from Bank", "Cash deposit", "Refund received", "Customer advance"],
      credit: ["Supplier deposit", "Operational expense", "Transport cost", "Warehouse rental", "Transfer to Kas Kecil"],
    },
    kas_kecil: {
      debit: ["Transfer from Kas Besar", "Petty cash top-up"],
      credit: ["Office supplies", "Fuel & transport", "Meals & entertainment", "Courier fees", "Parking", "Miscellaneous", "Cleaning service"],
    },
  };

  // Generate 6 months of transactions
  for (let m = 5; m >= 0; m--) {
    const month = new Date();
    month.setMonth(month.getMonth() - m);

    for (const type of cashTypes) {
      const cur = type === "kas_kecil" ? "IDR" : pick([...currencies]);

      // Debit transactions (2-5 per month per type)
      const debitCount = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < debitCount; i++) {
        const date = new Date(month);
        date.setDate(Math.floor(Math.random() * 28) + 1);

        const multiplier = cur === "IDR" ? 1 : cur === "USD" ? 15000 : 2000;
        const amount =
          type === "kas_kecil"
            ? Math.floor(Math.random() * 500000) + 50000
            : Math.floor(Math.random() * 100000000) + 5000000 / (cur === "IDR" ? 1 : multiplier);

        await prisma.cashAccount.create({
          data: {
            type,
            date,
            description: pick(descriptions[type].debit),
            currency: cur,
            debit: Math.round(amount),
            credit: 0,
            note: Math.random() > 0.5 ? pick(["Ref: transfer", "Confirmed", "Auto-debit", null]) : null,
          },
        });
      }

      // Credit transactions (2-4 per month per type)
      const creditCount = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < creditCount; i++) {
        const date = new Date(month);
        date.setDate(Math.floor(Math.random() * 28) + 1);

        const multiplier = cur === "IDR" ? 1 : cur === "USD" ? 15000 : 2000;
        const amount =
          type === "kas_kecil"
            ? Math.floor(Math.random() * 300000) + 20000
            : Math.floor(Math.random() * 80000000) + 2000000 / (cur === "IDR" ? 1 : multiplier);

        await prisma.cashAccount.create({
          data: {
            type,
            date,
            description: pick(descriptions[type].credit),
            currency: cur,
            debit: 0,
            credit: Math.round(amount),
          },
        });
      }
    }
  }
  console.log("  ✓ ~180 financial transactions created (6 months × 3 accounts)");

  // ═══════════════════════════════════════════════
  // CURRENCY CONVERSIONS
  // ═══════════════════════════════════════════════
  const conversionPairs = [
    { from: "USD", to: "IDR", rateRange: [15000, 16000] },
    { from: "CNY", to: "IDR", rateRange: [2100, 2300] },
    { from: "USD", to: "CNY", rateRange: [7.0, 7.5] },
  ];

  for (let i = 0; i < 10; i++) {
    const pair = pick(conversionPairs);
    const rate = pair.rateRange[0] + Math.random() * (pair.rateRange[1] - pair.rateRange[0]);
    const amount = Math.floor(Math.random() * 50000) + 1000;

    await prisma.currencyConversion.create({
      data: {
        date: randomDate(6),
        fromCur: pair.from,
        toCur: pair.to,
        amount,
        rate: Math.round(rate * 10000) / 10000,
        result: Math.round(amount * rate * 100) / 100,
      },
    });
  }
  console.log("  ✓ 10 currency conversions created");

  // ═══════════════════════════════════════════════
  // DOCUMENTS
  // ═══════════════════════════════════════════════
  const contracts = await prisma.contract.findMany({ take: 8 });
  const docTypes = ["bl", "invoice", "coo", "fumigation", "contract", "other"];

  for (const contract of contracts) {
    const docCount = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < docCount; i++) {
      const dtype = pick(docTypes);
      await prisma.document.create({
        data: {
          contractId: contract.id,
          filename: `${contract.contractNo}_${dtype.toUpperCase()}_${Date.now()}.pdf`,
          filepath: `/uploads/demo_${dtype}_${contract.id}_${i}.pdf`,
          type: dtype,
        },
      });
    }
  }
  console.log("  ✓ ~16 documents linked to contracts");

  // ═══════════════════════════════════════════════
  // DONE
  // ═══════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  Demo seed completed successfully!");
  console.log("══════════════════════════════════════════\n");
  console.log("Login credentials:");
  console.log("┌──────────┬──────────┬────────────────┐");
  console.log("│ Username │ Password │ Role           │");
  console.log("├──────────┼──────────┼────────────────┤");
  console.log("│ admin    │ admin123 │ Manager (bos)  │");
  console.log("│ staff    │ staff123 │ Staff (core)   │");
  console.log("│ ptg      │ ptg123   │ PTG Department │");
  console.log("│ erwin    │ erwin123 │ Manager (bos)  │");
  console.log("│ sari     │ sari1234 │ Staff (core)   │");
  console.log("└──────────┴──────────┴────────────────┘");
  console.log("\nDemo data summary:");
  console.log("  • 5 users (3 roles)");
  console.log("  • 10 inventory items with stock movements");
  console.log("  • 6 suppliers with transactions");
  console.log("  • 8 customers (international)");
  console.log("  • 15 contracts with items & payments");
  console.log("  • 12 invoices with items & payments");
  console.log("  • ~180 financial transactions (6 months)");
  console.log("  • 10 currency conversions");
  console.log("  • ~16 documents");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
