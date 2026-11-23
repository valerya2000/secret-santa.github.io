import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// Рабочее пространство прототипа «Тайный Санта»:
// один документ со всеми играми браузера (резервная копия localStorage).
// Клиент сам управляет содержимым, сервер хранит снимок целиком.
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
