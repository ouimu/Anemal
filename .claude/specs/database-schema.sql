-- ============================================================
-- Anemal SaaS — Complete Database Schema
-- DB-Agent controlled — DO NOT modify without DB-Agent review
-- Pattern: Shared Database, Shared Schema + tenant_id isolation
-- Database: PostgreSQL 15+
-- Last Updated: 2026-05-30
-- ============================================================

-- ============================================================
-- IRON RULE: Every SELECT/UPDATE/DELETE MUST include
-- WHERE tenant_id = :currentTenantId
-- And branch-scoped tables MUST also include:
-- WHERE branch_id = :currentBranchId
-- ============================================================


-- ============================================================
-- SECTION 1: CORE TENANT & USER MANAGEMENT
-- ============================================================

CREATE TABLE tenants (
    id            SERIAL PRIMARY KEY,
    name          VARCHAR(255) NOT NULL,
    subdomain     VARCHAR(100) UNIQUE NOT NULL,       -- e.g. 'abc-clinic'
    plan          VARCHAR(50) DEFAULT 'starter'
                  CHECK (plan IN ('starter','professional','clinic_plus')),
    is_active     BOOLEAN DEFAULT TRUE,
    settings      JSONB DEFAULT '{}',                 -- clinic configs (logo, timezone, etc.)
    trial_ends_at TIMESTAMP,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE branches (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    phone           VARCHAR(50),
    email           VARCHAR(255),
    address         TEXT,
    operating_hours JSONB DEFAULT '{}',                 -- e.g., {"mon": {"open": "08:00", "close": "20:00"}}
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_branch_name UNIQUE (tenant_id, name)
);

CREATE TABLE users (
    id                 SERIAL PRIMARY KEY,
    tenant_id          INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id          INT REFERENCES branches(id) ON DELETE SET NULL, -- primary branch
    name               VARCHAR(255) NOT NULL,
    email              VARCHAR(255) NOT NULL,
    password_hash      VARCHAR(255) NOT NULL,
    role               VARCHAR(50) NOT NULL
                       CHECK (role IN ('admin','doctor','staff')),
    is_active          BOOLEAN DEFAULT TRUE,
    allowed_start_time TIME DEFAULT NULL,                              -- off-hours access control (NULL = no limit)
    allowed_end_time   TIME DEFAULT NULL,
    last_login_at      TIMESTAMP,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_user_email UNIQUE (tenant_id, email)
);


-- ============================================================
-- SECTION 2: PET & OWNER MANAGEMENT (CRM)
-- ============================================================

CREATE TABLE owners (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    phone            VARCHAR(50) NOT NULL,
    email            VARCHAR(255),
    address          TEXT,
    line_user_id     VARCHAR(255),                       -- LINE Messaging API
    membership_tier  VARCHAR(50) DEFAULT 'Starter'
                     CHECK (membership_tier IN ('Starter','Bronze','Silver','Gold','Platinum')),
    loyalty_points   INT DEFAULT 0,
    is_active        BOOLEAN DEFAULT TRUE,               -- deactivation support
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_owner_phone UNIQUE (tenant_id, phone)
);

CREATE TABLE pets (
    id                    SERIAL PRIMARY KEY,
    tenant_id             INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id              INT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    name                  VARCHAR(100) NOT NULL,
    species               VARCHAR(50) NOT NULL
                          CHECK (species IN ('Dog','Cat','Rabbit','Bird','Reptile','Hamster','Other')),
    breed                 VARCHAR(100),
    birth_date            DATE,
    gender                VARCHAR(10) CHECK (gender IN ('Male','Female','Unknown')),
    color                 VARCHAR(100),
    microchip_id          VARCHAR(100),
    photo_url             VARCHAR(500),
    allergies             TEXT[] DEFAULT '{}',                 -- drug allergy tracking
    underlying_conditions TEXT,                                -- chronic conditions
    is_deceased           BOOLEAN DEFAULT FALSE,
    is_flagged            BOOLEAN DEFAULT FALSE,              -- infectious disease / watch flag
    flag_reason           TEXT,
    notes                 TEXT,
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_pet_microchip UNIQUE (tenant_id, microchip_id)
);


-- ============================================================
-- SECTION 3: APPOINTMENT & SCHEDULING
-- ============================================================

CREATE TABLE appointments (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        INT REFERENCES branches(id) ON DELETE SET NULL,  -- branch context
    pet_id           INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    doctor_id        INT REFERENCES users(id),
    room             VARCHAR(100),
    appointment_date TIMESTAMP NOT NULL,
    duration_min     INT DEFAULT 30,
    reason           TEXT,
    is_walk_in       BOOLEAN DEFAULT FALSE,
    status           VARCHAR(50) DEFAULT 'scheduled'
                     CHECK (status IN (
                       'scheduled','confirmed','in_progress',
                       'completed','cancelled','no_show'
                     )),
    reminder_sent_at TIMESTAMP,
    notes            TEXT,
    created_by       INT REFERENCES users(id),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SECTION 4: ELECTRONIC MEDICAL RECORD (EMR) & CLINICAL
-- ============================================================

CREATE TABLE medical_records (
    id                  SERIAL PRIMARY KEY,
    tenant_id           INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id           INT REFERENCES branches(id) ON DELETE SET NULL,  -- branch context
    pet_id              INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    appointment_id      INT REFERENCES appointments(id),
    doctor_id           INT REFERENCES users(id),
    visit_date          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- SOAP Note
    subjective          TEXT,             -- Chief complaint, history from owner
    objective           TEXT,             -- Physical exam, lab findings (SOAP/Problem Solving)
    assessment          TEXT,             -- Diagnosis / Differential Diagnosis
    plan                TEXT,             -- Treatment plan, follow-up instructions
    -- Vital Signs
    weight_kg           DECIMAL(5,2),
    temperature_c       DECIMAL(4,1),
    heart_rate_bpm      INT,
    resp_rate_rpm       INT,
    -- Anatomy annotation (Konva.js canvas state as JSON)
    anatomy_annotation  JSONB,
    anatomy_species     VARCHAR(50),      -- which anatomy template was used
    -- Status
    status              VARCHAR(50) DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress','completed','billed')),
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vaccinations (
    id                SERIAL PRIMARY KEY,
    tenant_id         INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pet_id            INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    medical_record_id INT REFERENCES medical_records(id),
    vaccine_name      VARCHAR(255) NOT NULL,
    administered_date DATE NOT NULL,
    next_due_date     DATE,
    batch_no          VARCHAR(100),
    administered_by   INT REFERENCES users(id),
    notes             TEXT,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attachments (
    id                SERIAL PRIMARY KEY,
    tenant_id         INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    medical_record_id INT REFERENCES medical_records(id) ON DELETE CASCADE,
    file_name         VARCHAR(255) NOT NULL,
    file_url          VARCHAR(500) NOT NULL,       -- S3 / R2 URL
    file_type         VARCHAR(100),                -- MIME type
    file_size_bytes   INT,
    attachment_type   VARCHAR(50)
                      CHECK (attachment_type IN ('xray','lab_result','photo','document','dicom','other')),
    uploaded_by       INT REFERENCES users(id),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SECTION 5: INVENTORY MANAGEMENT & BRANCH TRANSFERS
-- ============================================================

CREATE TABLE products (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    category        VARCHAR(100)
                    CHECK (category IN ('Medicine','Vaccine','Supply','Food','Equipment','Grooming','Other')),
    sku             VARCHAR(100),
    barcode         VARCHAR(100),
    unit            VARCHAR(50),                  -- 'tablet','ml','bottle','piece','vial'
    unit_price      DECIMAL(10,2) NOT NULL DEFAULT 0,
    cost_price      DECIMAL(10,2) DEFAULT 0,      -- for margin calculation
    description     TEXT,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_product_sku UNIQUE (tenant_id, sku)
);

CREATE TABLE branch_inventory (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id      INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    stock_qty       DECIMAL(10,2) NOT NULL DEFAULT 0,
    min_stock_qty   DECIMAL(10,2) DEFAULT 10,
    lot_no          VARCHAR(100),
    expiry_date     DATE,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_branch_product UNIQUE (tenant_id, branch_id, product_id)
);

CREATE TABLE stock_movements (
    id                    SERIAL PRIMARY KEY,
    tenant_id             INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id             INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE, -- active branch
    product_id            INT NOT NULL REFERENCES products(id),
    movement_type         VARCHAR(50) NOT NULL
                          CHECK (movement_type IN ('in','out','adjustment','expired','transfer_out','transfer_in')),
    qty                   DECIMAL(10,2) NOT NULL,
    reference_type        VARCHAR(50),                                            -- 'prescription','retail','purchase_order','transfer','manual'
    reference_id          INT,
    destination_branch_id INT REFERENCES branches(id) ON DELETE SET NULL,          -- for multi-branch transfers
    notes                 TEXT,
    performed_by          INT REFERENCES users(id),
    created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SECTION 6: PRESCRIPTION (Links EMR → Inventory)
-- ============================================================

CREATE TABLE prescriptions (
    id                SERIAL PRIMARY KEY,
    tenant_id         INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    medical_record_id INT NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    product_id        INT NOT NULL REFERENCES products(id),
    qty               DECIMAL(10,2) NOT NULL,
    dosage_instructions TEXT,                     -- "2 tabs, twice daily after meal"
    duration_days     INT,
    unit_price        DECIMAL(10,2) NOT NULL,     -- price snapshot at time of prescription
    dispensed_at      TIMESTAMP,
    dispensed_by      INT REFERENCES users(id),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SECTION 7: BILLING & POS
-- ============================================================

CREATE TABLE invoices (
    id                SERIAL PRIMARY KEY,
    tenant_id         INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id         INT REFERENCES branches(id) ON DELETE SET NULL,  -- active billing branch
    medical_record_id INT REFERENCES medical_records(id),
    invoice_no        VARCHAR(100) NOT NULL,       -- e.g. "INV-2026-05-0001"
    issued_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    subtotal          DECIMAL(10,2) NOT NULL DEFAULT 0,
    discount          DECIMAL(10,2) DEFAULT 0,
    discount_reason   TEXT,
    tax_rate          DECIMAL(5,2) DEFAULT 7.00,  -- VAT 7%
    tax_amount        DECIMAL(10,2) DEFAULT 0,
    total             DECIMAL(10,2) NOT NULL DEFAULT 0,
    payment_method    VARCHAR(50)
                      CHECK (payment_method IN ('cash','qr_promptpay','credit_card','transfer','other')),
    payment_status    VARCHAR(50) DEFAULT 'unpaid'
                      CHECK (payment_status IN ('unpaid','paid','partial','refunded')),
    paid_at           TIMESTAMP,
    notes             TEXT,
    created_by        INT REFERENCES users(id),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_invoice_no UNIQUE (tenant_id, invoice_no)
);

CREATE TABLE invoice_items (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id      INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description     VARCHAR(255) NOT NULL,
    item_type       VARCHAR(50)
                    CHECK (item_type IN ('service','medicine','vaccine','lab','supply','grooming','retail','other')),
    qty             DECIMAL(10,2) NOT NULL,
    unit_price      DECIMAL(10,2) NOT NULL,
    total_price     DECIMAL(10,2) NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SECTION 8: ADVANCED BUSINESS MODULES
-- ============================================================

-- MODULE: Inpatient (Hospitalization) Care
CREATE TABLE hospitalizations (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id        INT REFERENCES branches(id) ON DELETE SET NULL,
    pet_id           INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    admitted_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    discharged_at    TIMESTAMP,
    reason           TEXT NOT NULL,
    cage_no          VARCHAR(50),
    status           VARCHAR(50) DEFAULT 'admitted'
                     CHECK (status IN ('admitted', 'discharged', 'transferred')),
    doctor_in_charge INT REFERENCES users(id),
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_inpatient_care (
    id                 SERIAL PRIMARY KEY,
    tenant_id          INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    hospitalization_id INT NOT NULL REFERENCES hospitalizations(id) ON DELETE CASCADE,
    recorded_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    time_slot          VARCHAR(50) NOT NULL,                     -- e.g., '08:00', '12:00', '16:00', '20:00'
    temperature_c      DECIMAL(4,1),
    heart_rate_bpm     INT,
    resp_rate_rpm      INT,
    feeding_status     VARCHAR(255),
    medication_given   TEXT,
    notes              TEXT,
    performed_by       INT REFERENCES users(id)
);

-- MODULE: Grooming Queue & Booking
CREATE TABLE grooming_bookings (
    id                   SERIAL PRIMARY KEY,
    tenant_id            INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id            INT REFERENCES branches(id) ON DELETE SET NULL,
    pet_id               INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    appointment_id       INT REFERENCES appointments(id) ON DELETE SET NULL,
    groomer_id           INT REFERENCES users(id),
    service_type         VARCHAR(255) NOT NULL,                  -- e.g. 'Full Grooming', 'Bath & Blow Dry'
    scheduled_at         TIMESTAMP NOT NULL,
    duration_min         INT DEFAULT 60,
    status               VARCHAR(50) DEFAULT 'scheduled'
                         CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    special_instructions TEXT,
    notes                TEXT,
    created_by           INT REFERENCES users(id),
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MODULE: Blood Bank Registry
CREATE TABLE blood_donors (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pet_id           INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    blood_type       VARCHAR(50) NOT NULL,                       -- e.g., 'DEA 1.1 Pos', 'A', 'B'
    last_donation_at TIMESTAMP,
    is_eligible      BOOLEAN DEFAULT TRUE,
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_donor_pet UNIQUE (tenant_id, pet_id)
);

CREATE TABLE blood_donations (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    donor_id         INT NOT NULL REFERENCES blood_donors(id) ON DELETE CASCADE,
    volume_ml        DECIMAL(10,2) NOT NULL,
    collected_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    collected_by     INT REFERENCES users(id),
    expiry_date      DATE NOT NULL,
    status           VARCHAR(50) DEFAULT 'available'
                     CHECK (status IN ('available', 'used', 'expired', 'discarded')),
    notes            TEXT
);

CREATE TABLE blood_transfusions (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    recipient_pet_id INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    donation_id      INT REFERENCES blood_donations(id) ON DELETE SET NULL,
    volume_ml        DECIMAL(10,2) NOT NULL,
    administered_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    administered_by  INT REFERENCES users(id),
    reactions        TEXT,                                       -- anaphylactic/transfusion reactions
    notes            TEXT
);

-- MODULE: Loyalty Points & Membership
CREATE TABLE loyalty_transactions (
    id               SERIAL PRIMARY KEY,
    tenant_id        INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    owner_id         INT NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    invoice_id       INT REFERENCES invoices(id) ON DELETE SET NULL,
    points_earned    INT DEFAULT 0,
    points_redeemed  INT DEFAULT 0,
    transaction_type VARCHAR(50) CHECK (transaction_type IN ('earn', 'redeem', 'adjustment')),
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MODULE: Security Audit Logs
CREATE TABLE audit_logs (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         INT REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(255) NOT NULL,                       -- e.g. 'login', 'prescription_create', 'invoice_refund'
    table_name      VARCHAR(100),
    record_id       INT,
    details         JSONB DEFAULT '{}',                          -- diff / detailed snapshot
    ip_address      VARCHAR(50),
    user_agent      VARCHAR(500),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MODULE: Doctor Shifts (เวรการทำงานรายสาขา)
CREATE TABLE doctor_shifts (
    id              SERIAL PRIMARY KEY,
    tenant_id       INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id       INT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    doctor_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day_of_week     INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = Sunday, 6 = Saturday
    start_time      TIME NOT NULL,
    end_time        TIME NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_tenant_branch_doctor_shift UNIQUE (tenant_id, branch_id, doctor_id, day_of_week)
);

-- MODULE: Proactive Pet Reminders (การแจ้งเตือนสุขภาพเชิงรุก)
CREATE TABLE pet_reminders (
    id             SERIAL PRIMARY KEY,
    tenant_id      INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    pet_id         INT NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
    reminder_type  VARCHAR(100) NOT NULL,                        -- e.g., 'vaccination', 'deworming', 'health_checkup'
    message        TEXT NOT NULL,
    due_date       DATE NOT NULL,
    status         VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'completed', 'cancelled')),
    sent_at        TIMESTAMP,
    channel        VARCHAR(50) DEFAULT 'line' CHECK (channel IN ('line', 'sms', 'email', 'all')),
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================
-- SECTION 9: INDEXES (Performance Optimization)
-- ============================================================

-- Core Multi-Branch & Tenant indexes
CREATE INDEX idx_branches_tenant            ON branches(tenant_id, is_active);
CREATE INDEX idx_users_tenant_branch        ON users(tenant_id, branch_id);

-- Pet & Owner CRM
CREATE INDEX idx_pets_tenant_owner          ON pets(tenant_id, owner_id);
CREATE INDEX idx_pets_tenant_name           ON pets(tenant_id, name);
CREATE INDEX idx_pets_tenant_microchip      ON pets(tenant_id, microchip_id);
CREATE INDEX idx_owners_tenant_phone        ON owners(tenant_id, phone);

-- Appointment & Scheduler per Branch
CREATE INDEX idx_appointments_branch_date   ON appointments(tenant_id, branch_id, appointment_date);
CREATE INDEX idx_appointments_doctor_date   ON appointments(tenant_id, doctor_id, appointment_date);

-- EMR per Branch
CREATE INDEX idx_medical_records_branch     ON medical_records(tenant_id, branch_id, visit_date DESC);
CREATE INDEX idx_medical_records_pet        ON medical_records(tenant_id, pet_id);

-- Branch Inventory & Movement Card
CREATE INDEX idx_branch_inventory_lookup    ON branch_inventory(tenant_id, branch_id, product_id);
CREATE INDEX idx_stock_movements_card       ON stock_movements(tenant_id, branch_id, product_id, created_at DESC);

-- Advanced Operations Indexes
CREATE INDEX idx_hospitalizations_pet       ON hospitalizations(tenant_id, pet_id, status);
CREATE INDEX idx_grooming_bookings_date     ON grooming_bookings(tenant_id, branch_id, scheduled_at);
CREATE INDEX idx_blood_donors_type          ON blood_donors(tenant_id, blood_type);
CREATE INDEX idx_loyalty_transactions_owner ON loyalty_transactions(tenant_id, owner_id);
CREATE INDEX idx_audit_logs_tenant_time     ON audit_logs(tenant_id, created_at DESC);

-- Remediation Optimization Indexes (High-Performance POS, Inpatients, and Reminders)
CREATE INDEX idx_products_tenant_barcode    ON products(tenant_id, barcode) WHERE is_active = TRUE;
CREATE INDEX idx_invoices_branch_date       ON invoices(tenant_id, branch_id, issued_at DESC);
CREATE INDEX idx_vaccinations_pet           ON vaccinations(tenant_id, pet_id);
CREATE INDEX idx_attachments_record         ON attachments(tenant_id, medical_record_id);
CREATE INDEX idx_prescriptions_record       ON prescriptions(tenant_id, medical_record_id);
CREATE INDEX idx_hospitalizations_br_stat   ON hospitalizations(tenant_id, branch_id, status);
CREATE INDEX idx_blood_donations_status     ON blood_donations(tenant_id, status, expiry_date);
CREATE INDEX idx_doctor_shifts_lookup       ON doctor_shifts(tenant_id, branch_id, doctor_id);
CREATE INDEX idx_pet_reminders_due          ON pet_reminders(tenant_id, due_date, status);
CREATE INDEX idx_pet_reminders_pet          ON pet_reminders(tenant_id, pet_id);


-- ============================================================
-- SECTION 10: ROW-LEVEL SECURITY (RLS Isolation)
-- ============================================================

ALTER TABLE tenants               ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE owners                ENABLE ROW LEVEL SECURITY;
ALTER TABLE pets                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescriptions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_inventory      ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices              ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaccinations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE attachments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE hospitalizations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_inpatient_care  ENABLE ROW LEVEL SECURITY;
ALTER TABLE grooming_bookings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_donors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_donations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_transfusions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE loyalty_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE doctor_shifts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_reminders         ENABLE ROW LEVEL SECURITY;

-- Dynamic tenant security context policy generators
CREATE POLICY tenant_isolation_tenants ON tenants
    USING (id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_branches ON branches
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_owners ON owners
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_pets ON pets
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_appointments ON appointments
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_medical_records ON medical_records
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_prescriptions ON prescriptions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_products ON products
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_branch_inventory ON branch_inventory
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_stock_movements ON stock_movements
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_invoices ON invoices
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_invoice_items ON invoice_items
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_vaccinations ON vaccinations
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_attachments ON attachments
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_hospitalizations ON hospitalizations
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_daily_inpatient_care ON daily_inpatient_care
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_grooming_bookings ON grooming_bookings
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_blood_donors ON blood_donors
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_blood_donations ON blood_donations
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_blood_transfusions ON blood_transfusions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_loyalty_transactions ON loyalty_transactions
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_audit_logs ON audit_logs
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_doctor_shifts ON doctor_shifts
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);

CREATE POLICY tenant_isolation_pet_reminders ON pet_reminders
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::INT);
