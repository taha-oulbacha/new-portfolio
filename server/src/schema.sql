-- Leads captured by the multi-step form on taha-oulbacha.com
CREATE TABLE IF NOT EXISTS leads (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_token   CHAR(32)     NOT NULL,
  name           VARCHAR(120) NOT NULL,
  email          VARCHAR(190) NOT NULL,
  phone          VARCHAR(40)      NULL,
  company        VARCHAR(120)     NULL,
  project_type   ENUM('website','ecommerce','webapp','dashboard','redesign','automation','other')
                 NOT NULL DEFAULT 'other',
  budget         ENUM('under_1k','1k_3k','3k_7k','7k_plus','not_sure')
                 NOT NULL DEFAULT 'not_sure',
  timeline       ENUM('asap','1_month','1_3_months','flexible')
                 NOT NULL DEFAULT 'flexible',
  details        TEXT             NULL,
  status         ENUM('new','contacted','qualified','won','lost')
                 NOT NULL DEFAULT 'new',
  booked         TINYINT(1)   NOT NULL DEFAULT 0,
  booked_at      DATETIME         NULL,
  source         VARCHAR(60)      NULL,
  referrer       VARCHAR(255)     NULL,
  ip_hash        CHAR(64)         NULL,
  user_agent     VARCHAR(255)     NULL,
  notes          TEXT             NULL,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_public_token (public_token),
  KEY idx_created_at (created_at),
  KEY idx_status (status),
  KEY idx_email (email),
  KEY idx_project_type (project_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Who can open the dashboard
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  last_login_at DATETIME         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail so the dashboard can show what happened to each lead
CREATE TABLE IF NOT EXISTS lead_events (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id    INT UNSIGNED NOT NULL,
  type       VARCHAR(40)  NOT NULL,
  detail     VARCHAR(255)     NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_lead (lead_id),
  CONSTRAINT fk_events_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Client reviews shown on the About page. Nothing is public until it is both
-- email-verified (when submitted by a client) and approved in the dashboard.
CREATE TABLE IF NOT EXISTS reviews (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_name  VARCHAR(120) NOT NULL,
  author_role  VARCHAR(140)     NULL,
  email        VARCHAR(190)     NULL,
  project_type ENUM('website','ecommerce','webapp','dashboard','redesign','automation','other')
               NOT NULL DEFAULT 'other',
  rating       TINYINT UNSIGNED NOT NULL DEFAULT 5,
  body         TEXT         NOT NULL,
  avatar_mime  VARCHAR(40)      NULL,
  avatar_data  MEDIUMBLOB       NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  source       ENUM('admin','client') NOT NULL DEFAULT 'admin',
  email_verified TINYINT(1) NOT NULL DEFAULT 0,
  verify_token CHAR(32)         NULL,
  ip_hash      CHAR(64)         NULL,
  sort_order   INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_status (status),
  KEY idx_verify (verify_token),
  KEY idx_public (status, sort_order, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- A person Taha actually works with. Either a lead that was won, or someone
-- who came from Upwork, a referral or real life and never touched the site.
CREATE TABLE IF NOT EXISTS clients (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lead_id     INT UNSIGNED     NULL,
  name        VARCHAR(120) NOT NULL,
  company     VARCHAR(140)     NULL,
  email       VARCHAR(190)     NULL,
  phone       VARCHAR(40)      NULL,
  country     VARCHAR(80)      NULL,
  source      ENUM('website','upwork','referral','direct','other') NOT NULL DEFAULT 'website',
  notes       TEXT             NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_client_lead (lead_id),
  KEY idx_client_name (name),
  CONSTRAINT fk_client_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One piece of work. A client can have several over time.
CREATE TABLE IF NOT EXISTS projects (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  client_id    INT UNSIGNED NOT NULL,
  title        VARCHAR(180) NOT NULL,
  project_type ENUM('website','ecommerce','webapp','dashboard','redesign','automation','other')
               NOT NULL DEFAULT 'other',
  stage        ENUM('brief','proposal','agreed','building','review','delivered','cancelled')
               NOT NULL DEFAULT 'brief',
  progress     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  price_total  DECIMAL(10,2) NOT NULL DEFAULT 0,
  currency     CHAR(3)      NOT NULL DEFAULT 'USD',
  brief        TEXT             NULL,
  requirements TEXT             NULL,
  started_at   DATE             NULL,
  due_at       DATE             NULL,
  delivered_at DATE             NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project_client (client_id),
  KEY idx_project_stage (stage),
  CONSTRAINT fk_project_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Money actually received. Revenue is the sum of these, never of price_total.
CREATE TABLE IF NOT EXISTS payments (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  amount     DECIMAL(10,2) NOT NULL,
  kind       ENUM('deposit','milestone','final','other') NOT NULL DEFAULT 'milestone',
  method     VARCHAR(60)      NULL,
  note       VARCHAR(255)     NULL,
  paid_at    DATE         NOT NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_payment_project (project_id),
  KEY idx_payment_date (paid_at),
  CONSTRAINT fk_payment_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The running log shown on the project report.
CREATE TABLE IF NOT EXISTS project_updates (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id INT UNSIGNED NOT NULL,
  note       TEXT             NULL,
  stage_to   VARCHAR(30)      NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_update_project (project_id),
  CONSTRAINT fk_update_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
