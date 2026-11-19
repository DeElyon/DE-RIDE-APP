import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});

export const userProfiles = pgTable("user_profiles", {
  userId: text("userId").primaryKey(),
  phoneNumber: varchar("phone_number", { length: 20 }).unique(),
  role: varchar("role", { length: 20 }).notNull().default("passenger"),
  languagePref: varchar("language_pref", { length: 5 }).notNull().default("en"),
  walletBalance: numeric("wallet_balance", { precision: 12, scale: 2, mode: "number" }).notNull().default(0),
  completedTrips: integer("completed_trips").notNull().default(0),
  dailyFreeTokens: integer("daily_free_tokens").notNull().default(10),
  purchasedTokens: integer("purchased_tokens").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const busParks = pgTable("bus_parks", {
  id: uuid("id").primaryKey().defaultRandom(),
  parkName: varchar("park_name", { length: 150 }).notNull(),
  address: text("address").notNull(),
  lga: varchar("lga", { length: 80 }).notNull(),
  stateCode: varchar("state_code", { length: 8 }).notNull(),
  centerLatitude: numeric("center_latitude", { precision: 10, scale: 7, mode: "number" }).notNull(),
  centerLongitude: numeric("center_longitude", { precision: 10, scale: 7, mode: "number" }).notNull(),
  geofence: jsonb("geofence"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: createdAt(),
});

export const vehicleCredentials = pgTable("vehicle_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").notNull(),
  vehicleType: varchar("vehicle_type", { length: 30 }).notNull(),
  plateNumber: varchar("plate_number", { length: 20 }).notNull().unique(),
  seatCapacity: integer("seat_capacity").notNull(),
  verificationStatus: varchar("verification_status", { length: 20 }).notNull().default("PENDING"),
  operatorName: varchar("operator_name", { length: 120 }).notNull().default("Verified operator"),
  createdAt: createdAt(),
});

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  vehicleId: uuid("vehicle_id"),
  driverId: text("driver_id"),
  dispatcherId: text("dispatcher_id"),
  originParkId: uuid("origin_park_id"),
  destinationParkId: uuid("destination_park_id"),
  destinationLabel: varchar("destination_label", { length: 150 }).notNull(),
  stateCode: varchar("state_code", { length: 8 }).notNull(),
  baseFare: numeric("base_fare", { precision: 10, scale: 2, mode: "number" }).notNull(),
  totalSeats: integer("total_seats").notNull(),
  bookedSeats: integer("booked_seats").notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("BOARDING"),
  gpsSource: varchar("gps_source", { length: 20 }).notNull().default("MANUAL"),
  currentLatitude: numeric("current_latitude", { precision: 10, scale: 7, mode: "number" }),
  currentLongitude: numeric("current_longitude", { precision: 10, scale: 7, mode: "number" }),
  scheduledDepartureAt: timestamp("scheduled_departure_at", { withTimezone: true }).notNull(),
  actualDepartedAt: timestamp("actual_departed_at", { withTimezone: true }),
  arrivedAt: timestamp("arrived_at", { withTimezone: true }),
  lastStatusUpdatedAt: timestamp("last_status_updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: createdAt(),
}, (table) => [index("trips_departure_idx").on(table.status, table.scheduledDepartureAt)]);

export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull(),
  tripId: uuid("trip_id").notNull(),
  seatNumber: integer("seat_number").notNull(),
  baseFare: numeric("base_fare", { precision: 10, scale: 2, mode: "number" }).notNull(),
  platformFee: numeric("platform_fee", { precision: 10, scale: 2, mode: "number" }).notNull().default(20),
  paymentFee: numeric("payment_fee", { precision: 10, scale: 2, mode: "number" }).notNull().default(0),
  status: varchar("status", { length: 20 }).notNull().default("PENDING_PAYMENT"),
  holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [unique("bookings_trip_seat_unique").on(table.tripId, table.seatNumber), index("bookings_user_created_idx").on(table.userId, table.createdAt)]);

export const walletTransactions = pgTable("wallet_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2, mode: "number" }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("NGN"),
  kind: varchar("kind", { length: 30 }).notNull(),
  reference: varchar("reference", { length: 120 }).unique(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
});

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull(),
  tier: varchar("tier", { length: 40 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("ACTIVE"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const ameboTokenLedger = pgTable("amebo_token_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull().unique(),
  dailyFreeTokens: integer("daily_free_tokens").notNull().default(10),
  purchasedTokens: integer("purchased_tokens").notNull().default(0),
  dailyTokensResetAt: timestamp("daily_tokens_reset_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tripChatMessages = pgTable("trip_chat_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id").notNull(),
  userId: text("userId").notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
  disputeFrozen: boolean("dispute_frozen").notNull().default(false),
});

export const ameboConversations = pgTable("amebo_conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("userId").notNull(),
  title: varchar("title", { length: 160 }).notNull().default("Amebo chat"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const ameboMessages = pgTable("amebo_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id").notNull(),
  userId: text("userId").notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content").notNull(),
  createdAt: createdAt(),
});
