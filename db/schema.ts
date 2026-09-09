import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export * from './schema/crawler';
export const scans = sqliteTable(
  'scans',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    requestId: text('request_id').notNull(),
    status: text('status').notNull(),
    result: text('result'),
    expiresAt: integer('expires_at').notNull(),
  },
  (t) => [
    uniqueIndex('scans_owner_request').on(t.owner, t.requestId),
    index('scans_expiry').on(t.expiresAt),
  ],
);
export const feedback = sqliteTable('feedback', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  modelName: text('model_name'),
  lessonId: text('lesson_id'),
  stepId: text('step_id'),
  message: text('message').notNull(),
  createdAt: text('created_at').notNull(),
});
export const releases = sqliteTable('releases', {
  id: text('id').primaryKey(),
  status: text('status').notNull().default('draft'),
  payload: text('payload').notNull(),
  author: text('author').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
export const reviews = sqliteTable(
  'reviews',
  {
    id: text('id').primaryKey(),
    releaseId: text('release_id')
      .notNull()
      .references(() => releases.id),
    releaseRevision: integer('release_revision').notNull(),
    reviewer: text('reviewer').notNull(),
    evidence: text('evidence').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('reviews_release').on(t.releaseId, t.releaseRevision)],
);
export const auditLog = sqliteTable('audit_log', {
  id: text('id').primaryKey(),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  releaseId: text('release_id').notNull(),
  detail: text('detail').notNull(),
  createdAt: text('created_at').notNull(),
});
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: integer('expires_at').notNull(),
});
