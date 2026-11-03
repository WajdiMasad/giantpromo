import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type UserRole = "admin" | "office" | "installer" | "accountant";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role").$type<UserRole>().notNull().default("office"),
    phone: text("phone").default(""),
    avatarUrl: text("avatar_url"),
    isActive: boolean("is_active").notNull().default(true),
    googleRefreshToken: text("google_refresh_token"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)]
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sessions_token_hash_idx").on(t.tokenHash)]
);

export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    sageId: text("sage_id"),
    name: text("name").notNull(),
    companyName: text("company_name").default(""),
    contactPerson: text("contact_person").default(""),
    email: text("email").default(""),
    phone: text("phone").default(""),
    addressLine1: text("address_line1").default(""),
    addressLine2: text("address_line2").default(""),
    city: text("city").default("Halifax"),
    province: text("province").notNull().default("NS"),
    postalCode: text("postal_code").default(""),
    country: text("country").notNull().default("Canada"),
    paymentTerms: text("payment_terms").notNull().default("Net 30"),
    taxExempt: boolean("tax_exempt").notNull().default(false),
    siteNotes: text("site_notes").default(""),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    isActive: boolean("is_active").notNull().default(true),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("customers_sage_id_idx").on(t.sageId)]
);

/**
 * One record for the whole life of a piece of work (like Goodshuffle's Project):
 * New -> Quote Sent -> (Action Needed) -> Signed -> Scheduled -> In Progress ->
 * Installed -> Invoiced -> Paid, or Lost / Cancelled.
 * The Q-number exists from creation; the job number is ALWAYS the Sage invoice number
 * and only exists once the project is signed.
 */
export type ProjectStatus =
  | "new"
  | "quote_sent"
  | "action_needed"
  | "approved"
  | "scheduled"
  | "in_progress"
  | "installed"
  | "invoiced"
  | "paid"
  | "lost"
  | "cancelled";
export type JobStatus = ProjectStatus;

/** Derived from the project's invoice and its payments. */
export type PaymentStatus = "unpaid" | "part_paid" | "paid" | "void";

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    /** Quote number (Q-1001) — exists from creation. */
    quoteNumber: text("quote_number").notNull(),
    publicToken: text("public_token").notNull(),
    /**
     * Master numbering rule (§2a): jobNumber is ALWAYS the Sage invoice number
     * (e.g. "232016"). Null until signed, and while sageSyncStatus = 'pending_number'.
     */
    jobNumber: text("job_number"),
    idempotencyKey: text("idempotency_key").notNull(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    title: text("title").notNull(),
    description: text("description").default(""),
    poReference: text("po_reference").default(""),
    siteAddress: text("site_address").default(""),
    siteProvince: text("site_province").notNull().default("NS"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    status: text("status").$type<ProjectStatus>().notNull().default("new"),
    priority: text("priority")
      .$type<"normal" | "rush" | "urgent">()
      .notNull()
      .default("normal"),
    scheduledDate: text("scheduled_date"), // YYYY-MM-DD
    completedAt: timestamp("completed_at", { withTimezone: true }),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxRatePpm: integer("tax_rate_ppm").notNull().default(140000),
    taxLabel: text("tax_label").notNull().default("14% HST"),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    // Quote / contract phase
    customerTerms: text("customer_terms").default(""),
    validUntil: text("valid_until"), // YYYY-MM-DD
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentByUserId: integer("sent_by_user_id").references(() => users.id),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByName: text("approved_by_name"),
    approvedByEmail: text("approved_by_email"),
    approvedIp: text("approved_ip"),
    declineReason: text("decline_reason"),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    // Production / install phase
    installerNotes: text("installer_notes").default(""),
    internalNotes: text("internal_notes").default(""),
    driveFolderId: text("drive_folder_id"),
    driveFolderUrl: text("drive_folder_url"),
    // The invoice for this job (its number is the job number)
    invoiceId: integer("invoice_id"),
    paymentStatus: text("payment_status").$type<PaymentStatus>().notNull().default("unpaid"),
    invoiceSentAt: timestamp("invoice_sent_at", { withTimezone: true }),
    invoiceSentByUserId: integer("invoice_sent_by_user_id").references(() => users.id),
    invoiceSentToEmail: text("invoice_sent_to_email"),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("projects_quote_number_idx").on(t.quoteNumber),
    uniqueIndex("projects_public_token_idx").on(t.publicToken),
    uniqueIndex("projects_job_number_idx").on(t.jobNumber),
    uniqueIndex("projects_idempotency_key_idx").on(t.idempotencyKey),
  ]
);
/** Back-compat alias used throughout the code base. */
export const jobs = projects;

export const projectItems = pgTable("project_items", {
  id: serial("id").primaryKey(),
  jobId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  groupName: text("group_name").notNull().default(""),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unitPriceCents: integer("unit_price_cents").notNull().default(0),
  netCents: integer("net_cents").notNull().default(0),
  taxCents: integer("tax_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull().default(0),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  /** Shown only on the internal work order / pull sheet, never to the customer. */
  hiddenFromCustomer: boolean("hidden_from_customer").notNull().default(false),
  calculatorMetaJson: text("calculator_meta_json"),
});
export const jobItems = projectItems;

export const projectAssignments = pgTable(
  "project_assignments",
  {
    id: serial("id").primaryKey(),
    jobId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("project_assignments_unique_idx").on(t.jobId, t.userId)]
);
export const jobAssignments = projectAssignments;

export type JobFileKind =
  | "proof"
  | "artwork"
  | "before_photo"
  | "after_photo"
  | "install_photo"
  | "document";

export const projectFiles = pgTable("project_files", {
  id: serial("id").primaryKey(),
  jobId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  uploadedByUserId: integer("uploaded_by_user_id").references(() => users.id),
  uploadedByName: text("uploaded_by_name").notNull().default("Staff"),
  kind: text("kind").$type<JobFileKind>().notNull().default("install_photo"),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull().default("image/jpeg"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  storagePath: text("storage_path").notNull(),
  caption: text("caption").default(""),
  driveFileId: text("drive_file_id"),
  driveUrl: text("drive_url"),
  driveMirrorStatus: text("drive_mirror_status")
    .$type<"pending" | "synced" | "failed">()
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobFiles = projectFiles;

export type EquipmentStatus = "available" | "rented" | "maintenance" | "retired";

export const equipment = pgTable(
  "equipment",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // e.g. MS-001
    name: text("name").notNull(),
    category: text("category").notNull().default("Mobile Sign"),
    serialNumber: text("serial_number").default(""),
    defaultMonthlyRateCents: integer("default_monthly_rate_cents").notNull().default(15000),
    status: text("status").$type<EquipmentStatus>().notNull().default("available"),
    conditionNotes: text("condition_notes").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("equipment_code_idx").on(t.code)]
);

export type RentalStatus = "scheduled" | "active" | "returned" | "cancelled";

export const equipmentRentals = pgTable("equipment_rentals", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id")
    .notNull()
    .references(() => equipment.id),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"), // YYYY-MM-DD (null = open-ended monthly rental)
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  monthlyRateCents: integer("monthly_rate_cents").notNull().default(15000),
  locationAddress: text("location_address").notNull().default(""),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  status: text("status").$type<RentalStatus>().notNull().default("active"),
  notes: text("notes").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BillingPlanStatus = "active" | "paused" | "ended";
export type BillingPlanKind = "equipment_rental" | "maintenance" | "storage" | "advertising_space" | "service";

export const recurringBillingPlans = pgTable("recurring_billing_plans", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id),
  rentalId: integer("rental_id").references(() => equipmentRentals.id),
  kind: text("kind").$type<BillingPlanKind>().notNull().default("equipment_rental"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  poReference: text("po_reference").default(""),
  province: text("province").notNull().default("NS"),
  monthlyAmountCents: integer("monthly_amount_cents").notNull(),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"), // YYYY-MM-DD when ended
  status: text("status").$type<BillingPlanStatus>().notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BatchStatus = "draft" | "approved_scheduled" | "sent" | "dry_run";

export const recurringBillingBatches = pgTable(
  "recurring_billing_batches",
  {
    id: serial("id").primaryKey(),
    monthKey: text("month_key").notNull(), // YYYY-MM (e.g. "2026-12", "2027-01")
    invoiceDate: text("invoice_date").notNull(), // YYYY-MM-01
    status: text("status").$type<BatchStatus>().notNull().default("draft"),
    isDryRun: boolean("is_dry_run").notNull().default(false),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recurring_batches_month_idx").on(t.monthKey)]
);

export const recurringBillingBatchItems = pgTable(
  "recurring_billing_batch_items",
  {
    id: serial("id").primaryKey(),
    batchId: integer("batch_id")
      .notNull()
      .references(() => recurringBillingBatches.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => recurringBillingPlans.id),
    monthKey: text("month_key").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    description: text("description").notNull(),
    netCents: integer("net_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    isHalfMonthProrated: boolean("is_half_month_prorated").notNull().default(false),
    changeFlag: text("change_flag")
      .$type<"new" | "half_month_start" | "price_changed" | "ending" | "unchanged">()
      .notNull()
      .default("unchanged"),
    skipThisMonth: boolean("skip_this_month").notNull().default(false),
    invoiceId: integer("invoice_id"),
    invoiceNumber: text("invoice_number"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Hard database guarantee: a plan can NEVER be billed twice in the same month
    uniqueIndex("batch_items_plan_month_unique_idx").on(t.planId, t.monthKey),
    uniqueIndex("batch_items_idempotency_idx").on(t.idempotencyKey),
  ]
);

/** Singleton settings row (id = 'primary'). The app owns invoice numbering. */
export const appSettings = pgTable("app_settings", {
  id: text("id").primaryKey(), // always 'primary'
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(232016),
  companyName: text("company_name").notNull().default("Giant Promotions Limited"),
  hstNumber: text("hst_number").notNull().default("888811650 RT 0001"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InvoiceKind = "job" | "recurring";
/** draft = number reserved (job signed) but not yet sent; issued = sent/billed; void = cancelled. */
export type InvoiceStatus = "draft" | "issued" | "void";

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: text("invoice_number").notNull(),
    kind: text("kind").$type<InvoiceKind>().notNull().default("job"),
    projectId: integer("project_id").references(() => projects.id),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id),
    reference: text("reference").default(""),
    description: text("description").default(""),
    status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
    issueDate: text("issue_date"), // YYYY-MM-DD, set when issued
    dueDate: text("due_date"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    taxLabel: text("tax_label").notNull().default("14% HST"),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentToEmail: text("sent_to_email"),
    sentByUserId: integer("sent_by_user_id").references(() => users.id),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    /** The accountant batch in which this invoice was captured into the books. */
    capturedBatchId: integer("captured_batch_id"),
    /** The batch in which a later void was captured (if voided after capture). */
    voidCapturedBatchId: integer("void_captured_batch_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("invoices_number_idx").on(t.invoiceNumber)]
);

export type PaymentMethod = "cheque" | "etransfer" | "cash" | "card" | "other";

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id")
    .notNull()
    .references(() => invoices.id),
  receivedOn: text("received_on").notNull(), // YYYY-MM-DD
  amountCents: integer("amount_cents").notNull(),
  method: text("method").$type<PaymentMethod>().notNull().default("etransfer"),
  reference: text("reference").default(""),
  notes: text("notes").default(""),
  recordedByUserId: integer("recorded_by_user_id").references(() => users.id),
  recordedByName: text("recorded_by_name").notNull().default("Staff"),
  capturedBatchId: integer("captured_batch_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** One accountant "capture" session: everything up to a date, entered into the books at once. */
export const accountingBatches = pgTable("accounting_batches", {
  id: serial("id").primaryKey(),
  throughDate: text("through_date").notNull(), // YYYY-MM-DD cut-off
  capturedByUserId: integer("captured_by_user_id").references(() => users.id),
  capturedByName: text("captured_by_name").notNull().default("Accountant"),
  note: text("note").default(""),
  invoiceCount: integer("invoice_count").notNull().default(0),
  voidCount: integer("void_count").notNull().default(0),
  paymentCount: integer("payment_count").notNull().default(0),
  salesNetCents: integer("sales_net_cents").notNull().default(0),
  hstCents: integer("hst_cents").notNull().default(0),
  salesTotalCents: integer("sales_total_cents").notNull().default(0),
  paymentsCents: integer("payments_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activityLog = pgTable("activity_log", {
  id: serial("id").primaryKey(),
  actorUserId: integer("actor_user_id").references(() => users.id),
  actorName: text("actor_name").notNull().default("System"),
  entityType: text("entity_type").notNull(), // 'quote' | 'job' | 'rental' | 'billing' | 'sage'
  entityId: text("entity_id").notNull(),
  action: text("action").notNull(),
  summary: text("summary").notNull(),
  metadataJson: text("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
