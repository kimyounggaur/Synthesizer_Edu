CREATE TABLE `content_sources` (
	`content_id` text NOT NULL,
	`document_id` text NOT NULL,
	`page` integer,
	PRIMARY KEY(`content_id`, `document_id`),
	FOREIGN KEY (`document_id`) REFERENCES `manual_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `content_sources_document_idx` ON `content_sources` (`document_id`);--> statement-breakpoint
CREATE TABLE `crawl_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`document_id` text,
	`url` text,
	`reasons` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `crawl_issues_status_idx` ON `crawl_issues` (`status`,`source_id`);--> statement-breakpoint
CREATE TABLE `crawl_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`request_count` integer DEFAULT 0 NOT NULL,
	`bytes_fetched` integer DEFAULT 0 NOT NULL,
	`docs_found` integer DEFAULT 0 NOT NULL,
	`docs_new` integer DEFAULT 0 NOT NULL,
	`docs_changed` integer DEFAULT 0 NOT NULL,
	`errors` text,
	`outcome` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `crawl_runs_source_started_idx` ON `crawl_runs` (`source_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `manual_control_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`review_status` text DEFAULT 'candidate' NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `manual_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `control_candidate_document_name_uniq` ON `manual_control_candidates` (`document_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `control_candidate_review_idx` ON `manual_control_candidates` (`review_status`);--> statement-breakpoint
CREATE TABLE `manual_document_models` (
	`document_id` text NOT NULL,
	`model_id` text NOT NULL,
	`suffix_ambiguous` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`document_id`, `model_id`),
	FOREIGN KEY (`document_id`) REFERENCES `manual_documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_models_model_idx` ON `manual_document_models` (`model_id`);--> statement-breakpoint
CREATE TABLE `manual_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`model_id` text NOT NULL,
	`doc_type` text NOT NULL,
	`language` text NOT NULL,
	`title` text NOT NULL,
	`version` text,
	`published_at` integer,
	`canonical_url` text NOT NULL,
	`mirror_urls` text,
	`mime_type` text NOT NULL,
	`byte_size` integer,
	`sha256` text,
	`page_count` integer,
	`status` text DEFAULT 'draft' NOT NULL,
	`http_etag` text,
	`http_last_modified` text,
	`first_seen_at` integer NOT NULL,
	`last_checked_at` integer NOT NULL,
	`last_changed_at` integer,
	`dead_since` integer,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `docs_url_uniq` ON `manual_documents` (`canonical_url`);--> statement-breakpoint
CREATE INDEX `docs_model_idx` ON `manual_documents` (`model_id`);--> statement-breakpoint
CREATE INDEX `docs_status_idx` ON `manual_documents` (`status`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`app_model_id` text,
	`source_id` text NOT NULL,
	`canonical_name` text NOT NULL,
	`family` text,
	`suffix` text,
	`aliases` text NOT NULL,
	`product_url` text,
	`support_url` text,
	`category` text,
	`discontinued` integer DEFAULT false,
	`first_seen_at` integer NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `models_app_id_uniq` ON `models` (`app_model_id`);--> statement-breakpoint
CREATE INDEX `models_source_idx` ON `models` (`source_id`);--> statement-breakpoint
CREATE INDEX `models_name_idx` ON `models` (`canonical_name`);--> statement-breakpoint
CREATE TABLE `manual_outline` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`depth` integer NOT NULL,
	`order` integer NOT NULL,
	`heading` text NOT NULL,
	`page_start` integer,
	`section_kind` text,
	FOREIGN KEY (`document_id`) REFERENCES `manual_documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outline_document_order_uniq` ON `manual_outline` (`document_id`,`order`);--> statement-breakpoint
CREATE INDEX `outline_document_idx` ON `manual_outline` (`document_id`);--> statement-breakpoint
CREATE TABLE `source_robots_checks` (
	`source_id` text NOT NULL,
	`host` text NOT NULL,
	`checked_at` integer NOT NULL,
	`status_code` integer NOT NULL,
	`allows_root` integer NOT NULL,
	PRIMARY KEY(`source_id`, `host`),
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`archetype` text NOT NULL,
	`base_hosts` text NOT NULL,
	`asset_hosts` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`robots_checked_at` integer,
	`robots_allows` integer,
	`rate_limit_ms` integer DEFAULT 2000 NOT NULL,
	`crawl_budget` integer DEFAULT 200 NOT NULL,
	`last_run_at` integer,
	`notes` text
);
