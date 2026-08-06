-- DO $$
-- BEGIN

-- IF NOT EXISTS (SELECT * FROM pg_database WHERE datname = 'verifywise') THEN
-- 	CREATE DATABASE verifywise;
-- ELSE
-- 	RAISE NOTICE 'Database exists';
-- END IF;

-- END
-- $$;

-- Drop all existing tables
DROP TABLE IF EXISTS ai_trust_center_terms_and_contact CASCADE;
DROP TABLE IF EXISTS ai_trust_centre_company_info CASCADE;
DROP TABLE IF EXISTS ai_trust_centre_compliance_badges CASCADE;
DROP TABLE IF EXISTS ai_trust_centre_intro CASCADE;
DROP TABLE IF EXISTS ai_trust_center_overview CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS subtopics CASCADE;
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS projectscopes CASCADE;
DROP TABLE IF EXISTS projects_members CASCADE;
DROP TABLE IF EXISTS vendors_projects CASCADE;
DROP TABLE IF EXISTS vendorrisks CASCADE;
DROP TABLE IF EXISTS projectrisks CASCADE;
DROP TABLE IF EXISTS subcontrols CASCADE;
DROP TABLE IF EXISTS controls CASCADE;
DROP TABLE IF EXISTS controlcategories CASCADE;
DROP TABLE IF EXISTS assessments CASCADE;
DROP TABLE IF EXISTS vendors CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  logo VARCHAR(512),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  description TEXT,
  is_demo BOOLEAN
);

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  surname VARCHAR(255),
  email VARCHAR(255),
  password_hash VARCHAR(255),
  role INT REFERENCES roles(id),
  created_at DATE,
  last_login DATE,
  is_demo BOOLEAN
);

CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  project_title VARCHAR(255),
  owner INTEGER REFERENCES users(id),
  start_date DATE,
  geography INTEGER,
  ai_risk_classification VARCHAR(255),
  type_of_high_risk_role VARCHAR(255),
  goal VARCHAR(255),
  target_industry VARCHAR(255),
  description VARCHAR(255),
  last_updated DATE,
  last_updated_by INTEGER REFERENCES users(id),
  is_demo BOOLEAN
);

CREATE TABLE vendors (
  id SERIAL PRIMARY KEY,
  order_no INT,
  vendor_name VARCHAR(255),
  vendor_provides TEXT,
  assignee INTEGER REFERENCES users(id),
  website VARCHAR(255),
  vendor_contact_person VARCHAR(255),
  review_result VARCHAR(255),
  review_status VARCHAR(255),
  reviewer INTEGER REFERENCES users(id),
  risk_status VARCHAR(255),
  review_date DATE,
  is_demo BOOLEAN
);

CREATE TABLE assessments (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id),
  is_demo BOOLEAN
);

CREATE TABLE controlcategories (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id),
  title TEXT,
  order_no INT,
  is_demo BOOLEAN
);

CREATE TABLE controls (
  id SERIAL PRIMARY KEY,
  title TEXT,
  description TEXT,
  status VARCHAR(255),
  approver INTEGER REFERENCES users(id),
  risk_review TEXT,
  owner INTEGER REFERENCES users(id),
  reviewer INTEGER REFERENCES users(id),
  due_date DATE,
  implementation_details TEXT,
  order_no INT,
  control_category_id INT REFERENCES controlcategories(id),
  is_demo BOOLEAN
);

CREATE TABLE subcontrols (
  id SERIAL PRIMARY KEY,
  control_id INT REFERENCES controls(id),
  title TEXT,
  description TEXT,
  order_no INT,
  status VARCHAR(255),
  approver INTEGER REFERENCES users(id),
  risk_review TEXT,
  owner INTEGER REFERENCES users(id),
  reviewer INTEGER REFERENCES users(id),
  due_date DATE,
  implementation_details TEXT,
  evidence_description TEXT,
  feedback_description TEXT,
  evidence_files TEXT[],
  feedback_files TEXT[],
  is_demo BOOLEAN
);

CREATE TABLE projectrisks (
  id SERIAL PRIMARY KEY,
  project_id INT REFERENCES projects(id),
  risk_name VARCHAR(255),
  risk_owner INTEGER REFERENCES users(id),
  ai_lifecycle_phase VARCHAR(255),
  risk_description TEXT,
  risk_category VARCHAR(255),
  impact VARCHAR(255),
  assessment_mapping TEXT,
  controls_mapping TEXT,
  likelihood VARCHAR(255),
  severity VARCHAR(255),
  risk_level_autocalculated VARCHAR(255),
  review_notes TEXT,
  mitigation_status VARCHAR(255),
  current_risk_level VARCHAR(255),
  deadline DATE,
  mitigation_plan TEXT,
  implementation_strategy TEXT,
  mitigation_evidence_document VARCHAR(255),
  likelihood_mitigation VARCHAR(255),
  risk_severity VARCHAR(255),
  final_risk_level VARCHAR(255),
  risk_approval INTEGER REFERENCES users(id),
  approval_status VARCHAR(255),
  date_of_assessment DATE,
  is_demo BOOLEAN
);

CREATE TABLE vendorrisks (
  id SERIAL PRIMARY KEY,
  vendor_id INT REFERENCES vendors(id),
  order_no INT,
  risk_description TEXT,
  impact_description TEXT,
  impact VARCHAR(255),
  likelihood VARCHAR(255),
  risk_severity VARCHAR(255),
  action_plan TEXT,
  action_owner INTEGER REFERENCES users(id),
  risk_level VARCHAR(255),
  is_demo BOOLEAN
);

CREATE TABLE vendors_projects (
  vendor_id INT REFERENCES vendors(id),
  project_id INT REFERENCES projects(id),
  PRIMARY KEY (vendor_id, project_id),
  is_demo BOOLEAN
);

CREATE TABLE projects_members (
  user_id INT REFERENCES users(id),
  project_id INT REFERENCES projects(id),
  PRIMARY KEY (user_id, project_id),
  is_demo BOOLEAN
);

CREATE TABLE projectscopes (
  id SERIAL PRIMARY KEY,
  assessment_id INT REFERENCES assessments(id),
  describe_ai_environment TEXT,
  is_new_ai_technology BOOLEAN,
  uses_personal_data BOOLEAN,
  project_scope_documents VARCHAR(255),
  technology_type VARCHAR(255),
  has_ongoing_monitoring BOOLEAN,
  unintended_outcomes TEXT,
  technology_documentation VARCHAR(255),
  is_demo BOOLEAN
);

CREATE TABLE topics (
  id SERIAL PRIMARY KEY,
  assessment_id INT REFERENCES assessments(id),
  title TEXT,
  order_no INT,
  is_demo BOOLEAN
);

CREATE TABLE subtopics (
  id SERIAL PRIMARY KEY,
  topic_id INT REFERENCES topics(id),
  title TEXT,
  order_no INT,
  is_demo BOOLEAN
);

CREATE TABLE questions (
  id SERIAL PRIMARY KEY,
  subtopic_id INT REFERENCES subtopics(id),
  question TEXT,
  answer_type VARCHAR(255),
  evidence_required BOOLEAN,
  hint TEXT,
  is_required BOOLEAN,
  priority_level VARCHAR(255),
  evidence_files TEXT[],
  answer TEXT,
  dropdown_options TEXT[],
  order_no INT,
  input_type VARCHAR(255),
  is_demo BOOLEAN
);

CREATE TABLE files (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  content BYTEA NOT NULL,
  project_id INT REFERENCES projects(id),
  uploaded_by INTEGER REFERENCES users(id),
  uploaded_time TIMESTAMP,
  is_demo BOOLEAN
);

  CREATE TABLE ai_trust_center_overview (
    id SERIAL PRIMARY KEY,
    intro_visible BOOLEAN,
    purpose_visible BOOLEAN,
    purpose_text TEXT,
    our_statement_visible BOOLEAN,
    our_statement_text TEXT,
    our_mission_visible BOOLEAN,
    our_mission_text TEXT,
    background_visible BOOLEAN,
    background_text TEXT,
    core_benefit_visible BOOLEAN,
    core_benefit_text TEXT,
    compliance_doc_visible BOOLEAN,
    compliance_doc_text TEXT,
    is_demo BOOLEAN
  );

  -- AI Trust Centre Intro table
  CREATE TABLE ai_trust_centre_intro (
    id SERIAL PRIMARY KEY,
    intro_visible BOOLEAN NOT NULL DEFAULT FALSE,
    purpose_visible BOOLEAN NOT NULL DEFAULT FALSE,
    purpose_text TEXT,
    our_statement_visible BOOLEAN NOT NULL DEFAULT FALSE,
    our_statement_text TEXT,
    our_mission_visible BOOLEAN NOT NULL DEFAULT FALSE,
    our_mission_text TEXT,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_org_id_intro UNIQUE (organization_id)
  );

  -- AI Trust Centre Compliance Badges table
  CREATE TABLE ai_trust_centre_compliance_badges (
    id SERIAL PRIMARY KEY,
    badges_visible BOOLEAN NOT NULL DEFAULT FALSE,
    SOC2_Type_I BOOLEAN NOT NULL DEFAULT FALSE,
    SOC2_Type_II BOOLEAN NOT NULL DEFAULT FALSE,
    ISO_27001 BOOLEAN NOT NULL DEFAULT FALSE,
    ISO_42001 BOOLEAN NOT NULL DEFAULT FALSE,
    CCPA BOOLEAN NOT NULL DEFAULT FALSE,
    GDPR BOOLEAN NOT NULL DEFAULT FALSE,
    HIPAA BOOLEAN NOT NULL DEFAULT FALSE,
    EU_AI_Act BOOLEAN NOT NULL DEFAULT FALSE,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_org_id_badges UNIQUE (organization_id)
  );

  -- AI Trust Centre Company Info table
  CREATE TABLE ai_trust_centre_company_info (
    id SERIAL PRIMARY KEY,
    company_info_visible BOOLEAN NOT NULL DEFAULT FALSE,
    background_visible BOOLEAN NOT NULL DEFAULT FALSE,
    background_text TEXT,
    core_benefit_visible BOOLEAN NOT NULL DEFAULT FALSE,
    core_benefit_text TEXT,
    compliance_doc_visible BOOLEAN NOT NULL DEFAULT FALSE,
    compliance_doc_text TEXT,
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_org_id_company_info UNIQUE (organization_id)
  );

  -- AI Trust Center Terms and Contact table
  CREATE TABLE ai_trust_center_terms_and_contact (
    id SERIAL PRIMARY KEY,
    is_visible BOOLEAN NOT NULL DEFAULT FALSE,
    has_terms_of_service BOOLEAN NOT NULL DEFAULT FALSE,
    terms_of_service TEXT,
    has_privacy_policy BOOLEAN NOT NULL DEFAULT FALSE,
    privacy_policy TEXT,
    has_company_email BOOLEAN NOT NULL DEFAULT FALSE,
    company_email VARCHAR(255),
    organization_id INTEGER NOT NULL REFERENCES organizations(id) ON UPDATE CASCADE ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_org_id_terms_and_contact UNIQUE (organization_id)
  );

-- Create trigger function for AI Trust Centre tables
CREATE OR REPLACE FUNCTION update_updated_at_column_ai_trust()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach triggers to AI Trust Centre tables
CREATE TRIGGER set_updated_at_ai_trust_centre_intro
BEFORE UPDATE ON ai_trust_centre_intro
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_ai_trust();

CREATE TRIGGER set_updated_at_ai_trust_centre_compliance_badges
BEFORE UPDATE ON ai_trust_centre_compliance_badges
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_ai_trust();

CREATE TRIGGER set_updated_at_ai_trust_centre_company_info
BEFORE UPDATE ON ai_trust_centre_company_info
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_ai_trust();

CREATE TRIGGER set_updated_at_ai_trust_center_terms_and_contact
BEFORE UPDATE ON ai_trust_center_terms_and_contact
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column_ai_trust();

-- Insert initial data
INSERT INTO organizations (id, name, logo) VALUES (1, 'Default Organization', NULL);

INSERT INTO
  roles(name, description)
  VALUES ('Admin', 'Administrator with full access to the system.'),
  ('Reviewer', 'Reviewer with access to review compliance and reports.'),
  ('Editor', 'Editor with permission to modify and update project details.'),
  ('Auditor', 'Auditor with access to compliance and security audits.');

-- nosemgrep: generic.secrets.security.detected-bcrypt-hash.detected-bcrypt-hash
-- INSERT INTO
--   users(name, surname, email, password_hash, role, created_at, last_login)
--   VALUES
--   ('admin', 'admin', 'admin@gmail.com', '$2b$10$<redacted-demo-bcrypt-hash>', 1, CURRENT_DATE, CURRENT_DATE);
