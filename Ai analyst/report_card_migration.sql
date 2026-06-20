-- ====================================================================
-- JanSamadhan Universal Report Card Schema & Dynamic Scoring Triggers
-- ====================================================================

BEGIN;

-- 1. Create Report Cards Table
DROP TABLE IF EXISTS public.report_cards CASCADE;
CREATE TABLE public.report_cards (
    entity_type TEXT NOT NULL CHECK (entity_type IN ('department', 'worker', 'authority', 'ward', 'category', 'citizen')),
    entity_id TEXT NOT NULL,
    speed_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    quality_score NUMERIC(5,2) NOT NULL DEFAULT 80.00,  -- Default neutral rating
    volume_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    sla_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    composite_score NUMERIC(5,2) NOT NULL DEFAULT 94.00, -- Weighted base average
    grade TEXT NOT NULL DEFAULT 'A',
    total_complaints INT NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (entity_type, entity_id)
);

-- 1.2 Add schema tracking columns to complaints table
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.complaints ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ;

-- 2. Create Rules Registries (Decoupling yaml/logic from trigger code)
CREATE TABLE IF NOT EXISTS public.report_card_rules (
    rule_key TEXT PRIMARY KEY,
    score_type TEXT NOT NULL CHECK (score_type IN ('sla', 'quality', 'speed', 'volume')),
    impact NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS public.report_card_speed_rules (
    transition TEXT NOT NULL,
    min_hours NUMERIC NOT NULL,
    max_hours NUMERIC NOT NULL,
    impact NUMERIC NOT NULL,
    PRIMARY KEY (transition, min_hours, max_hours)
);

-- 3. Seed Rule Values from report_cards.yaml
INSERT INTO public.report_card_rules (rule_key, score_type, impact) VALUES
    ('sla_resolved_on_time', 'sla', 20.00),
    ('sla_resolved_breached', 'sla', -40.00),
    ('sla_became_overdue', 'sla', -10.00),
    ('quality_reopened', 'quality', -30.00),
    ('quality_escalated', 'quality', -15.00),
    ('quality_rejected_no_reason', 'quality', -25.00),
    ('volume_resolution_bonus', 'volume', 5.00)
ON CONFLICT (rule_key) DO UPDATE SET impact = EXCLUDED.impact;

INSERT INTO public.report_card_speed_rules (transition, min_hours, max_hours, impact) VALUES
    ('submitted_to_assigned', 0, 12, 10.00),
    ('submitted_to_assigned', 12, 24, 0.00),
    ('submitted_to_assigned', 24, 48, -15.00),
    ('submitted_to_assigned', 48, 999999, -30.00),
    ('assigned_to_in_progress', 0, 6, 5.00),
    ('assigned_to_in_progress', 6, 24, 0.00),
    ('assigned_to_in_progress', 24, 999999, -10.00),
    ('in_progress_to_resolved', 0, 24, 20.00),
    ('in_progress_to_resolved', 24, 48, 0.00),
    ('in_progress_to_resolved', 48, 72, -20.00),
    ('in_progress_to_resolved', 72, 999999, -40.00)
ON CONFLICT (transition, min_hours, max_hours) DO UPDATE SET impact = EXCLUDED.impact;

-- 4. Unified Update & Grade Function
CREATE OR REPLACE FUNCTION public.update_report_card_metrics(
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_speed_delta NUMERIC,
    p_quality_delta NUMERIC,
    p_volume_delta NUMERIC, -- Kept for interface compatibility but calculated dynamically below
    p_sla_delta NUMERIC,
    p_complaint_increment INT
) RETURNS VOID AS $$
DECLARE
    v_speed NUMERIC;
    v_quality NUMERIC;
    v_volume NUMERIC;
    v_sla NUMERIC;
    v_composite NUMERIC;
    v_grade TEXT;
    
    -- Dynamic workload variables
    v_col TEXT;
    v_active_count INT := 0;
    v_resolved_count INT := 0;
    v_workload_penalty NUMERIC := 0.0;
BEGIN
    -- Exclude UNASSIGNED entries to prevent skewed data
    IF p_entity_id = 'UNASSIGNED' OR p_entity_id IS NULL OR p_entity_id = '' THEN
        RETURN;
    END IF;

    -- Upsert base card if not exists
    INSERT INTO public.report_cards (entity_type, entity_id)
    VALUES (p_entity_type, p_entity_id)
    ON CONFLICT (entity_type, entity_id) DO NOTHING;

    -- Retrieve current scores
    SELECT speed_score, quality_score, sla_score
    INTO v_speed, v_quality, v_sla
    FROM public.report_cards
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id;

    -- Calculate new bounded scores (0 to 100)
    v_speed   := LEAST(100.00, GREATEST(0.00, v_speed + p_speed_delta));
    v_quality := LEAST(100.00, GREATEST(0.00, v_quality + p_quality_delta));
    v_sla     := LEAST(100.00, GREATEST(0.00, v_sla + p_sla_delta));

    -- Determine table column to filter for live dynamic volume
    IF p_entity_type = 'department' THEN v_col := 'assigned_department';
    ELSIF p_entity_type = 'worker' THEN v_col := 'assigned_worker_id';
    ELSIF p_entity_type = 'ward' THEN v_col := 'ward_name';
    ELSIF p_entity_type = 'category' THEN v_col := 'category_id';
    ELSIF p_entity_type = 'authority' THEN v_col := 'assigned_officer_id';
    ELSIF p_entity_type = 'citizen' THEN v_col := 'citizen_id';
    END IF;

    IF v_col IS NOT NULL THEN
        -- Run dynamic queries to get counts from complaints table
        EXECUTE format('SELECT COUNT(*) FROM public.complaints WHERE %I::text = $1 AND status IN (''submitted'', ''assigned'', ''in_progress'', ''escalated'')', v_col)
        INTO v_active_count
        USING p_entity_id;

        EXECUTE format('SELECT COUNT(*) FROM public.complaints WHERE %I::text = $1 AND status = ''resolved''', v_col)
        INTO v_resolved_count
        USING p_entity_id;
    END IF;

    -- Calculate active workload penalty
    IF p_entity_type = 'worker' AND v_active_count > 5 THEN
        v_workload_penalty := (v_active_count - 5) * 10.0;
    ELSIF p_entity_type = 'department' AND v_active_count > 150 THEN
        v_workload_penalty := floor((v_active_count - 150)::NUMERIC / 50.0) * 15.0;
    END IF;

    -- Volume score: base 100 + resolution bonus - workload penalty (bounded 0 to 100)
    v_volume := LEAST(100.00, GREATEST(0.00, 100.00 + (v_resolved_count * 5.0) - v_workload_penalty));

    -- Calculate composite score using weights (40% SLA, 30% Quality, 20% Speed, 10% Volume)
    v_composite := (v_sla * 0.40) + (v_quality * 0.30) + (v_speed * 0.20) + (v_volume * 0.10);

    -- Grade lookup (Policy-defined limits from report_cards.yaml)
    IF v_composite >= 90.00 THEN v_grade := 'A';
    ELSIF v_composite >= 75.00 THEN v_grade := 'B';
    ELSIF v_composite >= 60.00 THEN v_grade := 'C';
    ELSIF v_composite >= 45.00 THEN v_grade := 'D';
    ELSE v_grade := 'F';
    END IF;

    -- Update row
    UPDATE public.report_cards
    SET speed_score = v_speed,
        quality_score = v_quality,
        volume_score = v_volume,
        sla_score = v_sla,
        composite_score = v_composite,
        grade = v_grade,
        total_complaints = GREATEST(0, total_complaints + p_complaint_increment),
        last_updated = now()
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id;
END;
$$ LANGUAGE plpgsql;

-- 4.5. Score Footprint Helper function for reassignments and deletes (resolves based on resolved_at presence)
CREATE OR REPLACE FUNCTION public.calculate_complaint_cumulative_scores(
    p_id UUID,
    p_created_at TIMESTAMPTZ,
    p_assigned_at TIMESTAMPTZ,
    p_in_progress_at TIMESTAMPTZ,
    p_resolved_at TIMESTAMPTZ,
    p_status public.complaint_status,
    p_sla_breached BOOLEAN,
    p_reopen_count INT,
    p_escalation_level INT,
    OUT r_speed NUMERIC,
    OUT r_quality NUMERIC,
    OUT r_sla NUMERIC
) AS $$
DECLARE
    v_hours NUMERIC;
    v_speed_sub NUMERIC := 0.0;
    v_speed_assign NUMERIC := 0.0;
    v_speed_resolve NUMERIC := 0.0;
    v_review_impact NUMERIC := 0.0;
BEGIN
    r_speed := 0.0;
    r_quality := 0.0;
    r_sla := 0.0;

    -- Speed sub-scores calculation
    IF p_assigned_at IS NOT NULL THEN
        v_hours := EXTRACT(EPOCH FROM (p_assigned_at - p_created_at))/3600.0;
        SELECT COALESCE(impact, 0.0) INTO v_speed_sub FROM public.report_card_speed_rules 
        WHERE transition = 'submitted_to_assigned' AND v_hours >= min_hours AND v_hours < max_hours LIMIT 1;
        r_speed := r_speed + COALESCE(v_speed_sub, 0.0);
    END IF;

    IF p_in_progress_at IS NOT NULL AND p_assigned_at IS NOT NULL THEN
        v_hours := EXTRACT(EPOCH FROM (p_in_progress_at - p_assigned_at))/3600.0;
        SELECT COALESCE(impact, 0.0) INTO v_speed_assign FROM public.report_card_speed_rules 
        WHERE transition = 'assigned_to_in_progress' AND v_hours >= min_hours AND v_hours < max_hours LIMIT 1;
        r_speed := r_speed + COALESCE(v_speed_assign, 0.0);
    END IF;

    IF p_resolved_at IS NOT NULL AND p_in_progress_at IS NOT NULL THEN
        v_hours := EXTRACT(EPOCH FROM (p_resolved_at - p_in_progress_at))/3600.0;
        SELECT COALESCE(impact, 0.0) INTO v_speed_resolve FROM public.report_card_speed_rules 
        WHERE transition = 'in_progress_to_resolved' AND v_hours >= min_hours AND v_hours < max_hours LIMIT 1;
        r_speed := r_speed + COALESCE(v_speed_resolve, 0.0);
    END IF;

    -- SLA Compliance calculation
    IF p_resolved_at IS NOT NULL THEN
        IF p_sla_breached = TRUE THEN
            r_sla := -40.0;
        ELSE
            r_sla := 20.0;
        END IF;
    END IF;

    -- Quality deductions
    r_quality := (COALESCE(p_reopen_count, 0) * -30.0) + (COALESCE(p_escalation_level, 0) * -15.0);
    
    -- Citizen reviews for this complaint
    SELECT COALESCE(SUM(((rating::NUMERIC / 5.0) * 100.0) - 80.0), 0.0) INTO v_review_impact 
    FROM public.reviews WHERE complaint_id = p_id;
    
    r_quality := r_quality + v_review_impact;
END;
$$ LANGUAGE plpgsql;

-- 4.6 BEFORE TRIGGER: Correctly computes and writes schema timestamps onto the NEW row
CREATE OR REPLACE FUNCTION public.process_complaint_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'assigned' THEN
            NEW.assigned_at := COALESCE(NEW.assigned_at, now());
        ELSIF NEW.status = 'in_progress' THEN
            NEW.in_progress_at := COALESCE(NEW.in_progress_at, now());
        ELSIF NEW.status = 'resolved' THEN
            NEW.resolved_at := COALESCE(NEW.resolved_at, now());
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- status submitted -> assigned
        IF OLD.status = 'submitted' AND NEW.status = 'assigned' THEN
            NEW.assigned_at := COALESCE(NEW.assigned_at, now());
        -- status assigned -> in_progress
        ELSIF OLD.status = 'assigned' AND NEW.status = 'in_progress' THEN
            NEW.in_progress_at := COALESCE(NEW.in_progress_at, now());
        -- status -> resolved (Excludes spam/rejected from receiving resolved timestamps)
        ELSIF OLD.status <> NEW.status AND NEW.status = 'resolved' THEN
            NEW.resolved_at := COALESCE(NEW.resolved_at, now());
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger Handler Function for complaints updates (AFTER trigger - receives correct saved timestamps)
CREATE OR REPLACE FUNCTION public.process_complaint_report_card_change()
RETURNS TRIGGER AS $$
DECLARE
    v_hours NUMERIC;
    v_speed_impact NUMERIC := 0.00;
    v_quality_impact NUMERIC := 0.00;
    v_volume_impact NUMERIC := 0.00;
    v_sla_impact NUMERIC := 0.00;
    
    -- Cumulative scores for reassignments/deletes
    v_cum_speed NUMERIC := 0.00;
    v_cum_quality NUMERIC := 0.00;
    v_cum_sla NUMERIC := 0.00;
    
    -- Target update entities
    v_dept_new TEXT; v_worker_new TEXT; v_ward_new TEXT; v_category_new TEXT; v_officer_new TEXT; v_citizen_new TEXT;
BEGIN
    -- CASE 1: Ticket Deleted (Decrement counts and roll back scores)
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
        FROM public.calculate_complaint_cumulative_scores(
            OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
        );
        
        IF OLD.assigned_department IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('department', OLD.assigned_department, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
        END IF;
        IF OLD.assigned_worker_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('worker', OLD.assigned_worker_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
        END IF;
        IF OLD.ward_name IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('ward', OLD.ward_name, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
        END IF;
        IF OLD.category_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('category', OLD.category_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
        END IF;
        IF OLD.assigned_officer_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('authority', OLD.assigned_officer_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
        END IF;
        IF OLD.citizen_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('citizen', OLD.citizen_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
        END IF;
        
        RETURN OLD;
    END IF;

    -- CASE 2: New Ticket Registered (Increment counts)
    IF TG_OP = 'INSERT' THEN
        IF NEW.assigned_department IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('department', NEW.assigned_department, 0, 0, 0, 0, 1);
        END IF;
        IF NEW.assigned_worker_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('worker', NEW.assigned_worker_id::TEXT, 0, 0, 0, 0, 1);
        END IF;
        IF NEW.ward_name IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('ward', NEW.ward_name, 0, 0, 0, 0, 1);
        END IF;
        IF NEW.category_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('category', NEW.category_id::TEXT, 0, 0, 0, 0, 1);
        END IF;
        IF NEW.assigned_officer_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('authority', NEW.assigned_officer_id::TEXT, 0, 0, 0, 0, 1);
        END IF;
        IF NEW.citizen_id IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('citizen', NEW.citizen_id::TEXT, 0, 0, 0, 0, 1);
        END IF;
        
        RETURN NEW;
    END IF;

    -- CASE 3: Ticket Updated (Transitions and reassignments)
    IF TG_OP = 'UPDATE' THEN
        -- 3.1 Reassignments (Transfer complete score footprints between old and new entities)
        -- Department
        IF OLD.assigned_department IS DISTINCT FROM NEW.assigned_department THEN
            SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
            FROM public.calculate_complaint_cumulative_scores(
                OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
            );
            IF OLD.assigned_department IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('department', OLD.assigned_department, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
            END IF;
            IF NEW.assigned_department IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('department', NEW.assigned_department, v_cum_speed, v_cum_quality, 0, v_cum_sla, 1);
            END IF;
        END IF;

        -- Worker
        IF OLD.assigned_worker_id IS DISTINCT FROM NEW.assigned_worker_id THEN
            SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
            FROM public.calculate_complaint_cumulative_scores(
                OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
            );
            IF OLD.assigned_worker_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('worker', OLD.assigned_worker_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
            END IF;
            IF NEW.assigned_worker_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('worker', NEW.assigned_worker_id::TEXT, v_cum_speed, v_cum_quality, 0, v_cum_sla, 1);
            END IF;
        END IF;

        -- Ward
        IF OLD.ward_name IS DISTINCT FROM NEW.ward_name THEN
            SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
            FROM public.calculate_complaint_cumulative_scores(
                OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
            );
            IF OLD.ward_name IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('ward', OLD.ward_name, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
            END IF;
            IF NEW.ward_name IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('ward', NEW.ward_name, v_cum_speed, v_cum_quality, 0, v_cum_sla, 1);
            END IF;
        END IF;

        -- Category
        IF OLD.category_id IS DISTINCT FROM NEW.category_id THEN
            SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
            FROM public.calculate_complaint_cumulative_scores(
                OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
            );
            IF OLD.category_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('category', OLD.category_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
            END IF;
            IF NEW.category_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('category', NEW.category_id::TEXT, v_cum_speed, v_cum_quality, 0, v_cum_sla, 1);
            END IF;
        END IF;

        -- Officer (Authority)
        IF OLD.assigned_officer_id IS DISTINCT FROM NEW.assigned_officer_id THEN
            SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
            FROM public.calculate_complaint_cumulative_scores(
                OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
            );
            IF OLD.assigned_officer_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('authority', OLD.assigned_officer_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
            END IF;
            IF NEW.assigned_officer_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('authority', NEW.assigned_officer_id::TEXT, v_cum_speed, v_cum_quality, 0, v_cum_sla, 1);
            END IF;
        END IF;

        -- Citizen
        IF OLD.citizen_id IS DISTINCT FROM NEW.citizen_id THEN
            SELECT * INTO v_cum_speed, v_cum_quality, v_cum_sla 
            FROM public.calculate_complaint_cumulative_scores(
                OLD.id::UUID, OLD.created_at, OLD.assigned_at, OLD.in_progress_at, OLD.resolved_at, OLD.status, OLD.sla_breached, OLD.reopen_count, OLD.escalation_level
            );
            IF OLD.citizen_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('citizen', OLD.citizen_id::TEXT, -v_cum_speed, -v_cum_quality, 0, -v_cum_sla, -1);
            END IF;
            IF NEW.citizen_id IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('citizen', NEW.citizen_id::TEXT, v_cum_speed, v_cum_quality, 0, v_cum_sla, 1);
            END IF;
        END IF;

        -- 3.2 Transition: submitted -> assigned
        IF OLD.status = 'submitted' AND NEW.status = 'assigned' THEN
            v_hours := EXTRACT(EPOCH FROM (NEW.assigned_at - OLD.created_at))/3600.0;
            SELECT impact INTO v_speed_impact FROM public.report_card_speed_rules 
            WHERE transition = 'submitted_to_assigned' AND v_hours >= min_hours AND v_hours < max_hours LIMIT 1;
        END IF;

        -- 3.3 Transition: assigned -> in_progress
        IF OLD.status = 'assigned' AND NEW.status = 'in_progress' THEN
            v_hours := EXTRACT(EPOCH FROM (NEW.in_progress_at - COALESCE(OLD.assigned_at, OLD.created_at)))/3600.0;
            SELECT impact INTO v_speed_impact FROM public.report_card_speed_rules 
            WHERE transition = 'assigned_to_in_progress' AND v_hours >= min_hours AND v_hours < max_hours LIMIT 1;
        END IF;

        -- 3.4 Transition: -> resolved (EXCLUDING spam/rejected to prevent score inflation loopholes)
        IF OLD.status <> NEW.status AND NEW.status = 'resolved' THEN
            -- Resolution Speed Impact
            v_hours := EXTRACT(EPOCH FROM (NEW.resolved_at - COALESCE(OLD.in_progress_at, OLD.assigned_at, OLD.created_at)))/3600.0;
            SELECT impact INTO v_speed_impact FROM public.report_card_speed_rules 
            WHERE transition = 'in_progress_to_resolved' AND v_hours >= min_hours AND v_hours < max_hours LIMIT 1;
            
            -- SLA Impact
            IF NEW.sla_breached = TRUE THEN
                SELECT impact INTO v_sla_impact FROM public.report_card_rules WHERE rule_key = 'sla_resolved_breached';
            ELSE
                SELECT impact INTO v_sla_impact FROM public.report_card_rules WHERE rule_key = 'sla_resolved_on_time';
            END IF;
        END IF;

        -- 3.5 Reopen Penalty
        IF NEW.reopen_count > OLD.reopen_count THEN
            SELECT impact INTO v_quality_impact FROM public.report_card_rules WHERE rule_key = 'quality_reopened';
        END IF;

        -- 3.6 Escalation Penalty
        IF NEW.escalation_level > OLD.escalation_level THEN
            SELECT impact INTO v_quality_impact FROM public.report_card_rules WHERE rule_key = 'quality_escalated';
        END IF;

        -- 3.7 Trigger updates to all currently assigned entities
        IF v_speed_impact <> 0 OR v_quality_impact <> 0 OR v_volume_impact <> 0 OR v_sla_impact <> 0 THEN
            v_dept_new := COALESCE(NEW.assigned_department, OLD.assigned_department);
            v_worker_new := COALESCE(NEW.assigned_worker_id::TEXT, OLD.assigned_worker_id::TEXT);
            v_ward_new := COALESCE(NEW.ward_name, OLD.ward_name);
            v_category_new := COALESCE(NEW.category_id::TEXT, OLD.category_id::TEXT);
            v_officer_new := COALESCE(NEW.assigned_officer_id::TEXT, OLD.assigned_officer_id::TEXT);
            v_citizen_new := COALESCE(NEW.citizen_id::TEXT, OLD.citizen_id::TEXT);

            IF v_dept_new IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('department', v_dept_new, v_speed_impact, v_quality_impact, v_volume_impact, v_sla_impact, 0);
            END IF;
            IF v_worker_new IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('worker', v_worker_new, v_speed_impact, v_quality_impact, v_volume_impact, v_sla_impact, 0);
            END IF;
            IF v_ward_new IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('ward', v_ward_new, v_speed_impact, v_quality_impact, v_volume_impact, v_sla_impact, 0);
            END IF;
            IF v_category_new IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('category', v_category_new, v_speed_impact, v_quality_impact, v_volume_impact, v_sla_impact, 0);
            END IF;
            IF v_officer_new IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('authority', v_officer_new, v_speed_impact, v_quality_impact, v_volume_impact, v_sla_impact, 0);
            END IF;
            IF v_citizen_new IS NOT NULL THEN
                PERFORM public.update_report_card_metrics('citizen', v_citizen_new, v_speed_impact, v_quality_impact, v_volume_impact, v_sla_impact, 0);
            END IF;
        END IF;
        
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 6. Trigger Handler Function for review submissions (rating logic maps dynamically to yaml formula)
CREATE OR REPLACE FUNCTION public.process_review_report_card_change()
RETURNS TRIGGER AS $$
DECLARE
    v_complaint RECORD;
    v_quality_impact NUMERIC := 0.00;
    v_dept TEXT;
    v_worker TEXT;
    v_ward TEXT;
    v_category TEXT;
    v_officer TEXT;
    v_citizen TEXT;
BEGIN
    -- Fetch associated complaint metadata (for NEW on INSERT, or OLD on DELETE)
    IF TG_OP = 'DELETE' THEN
        SELECT assigned_department, assigned_worker_id, ward_name, category_id, assigned_officer_id, citizen_id
        INTO v_complaint
        FROM public.complaints
        WHERE id = OLD.complaint_id;
        
        IF FOUND THEN
            v_dept := v_complaint.assigned_department;
            v_worker := v_complaint.assigned_worker_id::TEXT;
            v_ward := v_complaint.ward_name;
            v_category := v_complaint.category_id::TEXT;
            v_officer := v_complaint.assigned_officer_id::TEXT;
            v_citizen := v_complaint.citizen_id::TEXT;

            -- Dynamic Quality impact calculated from rating relative to baseline 80 (subtracting it on delete)
            v_quality_impact := -(((OLD.rating::NUMERIC / 5.0) * 100.0) - 80.0);
        END IF;
    ELSE
        SELECT assigned_department, assigned_worker_id, ward_name, category_id, assigned_officer_id, citizen_id
        INTO v_complaint
        FROM public.complaints
        WHERE id = NEW.complaint_id;

        IF FOUND THEN
            v_dept := v_complaint.assigned_department;
            v_worker := v_complaint.assigned_worker_id::TEXT;
            v_ward := v_complaint.ward_name;
            v_category := v_complaint.category_id::TEXT;
            v_officer := v_complaint.assigned_officer_id::TEXT;
            v_citizen := v_complaint.citizen_id::TEXT;

            -- Dynamic Quality impact calculated from rating: (rating / 5.0) * 100 relative to baseline 80
            v_quality_impact := ((NEW.rating::NUMERIC / 5.0) * 100.0) - 80.0;
        END IF;
    END IF;

    IF FOUND AND v_quality_impact <> 0 THEN
        IF v_dept IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('department', v_dept, 0, v_quality_impact, 0, 0, 0);
        END IF;
        IF v_worker IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('worker', v_worker, 0, v_quality_impact, 0, 0, 0);
        END IF;
        IF v_ward IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('ward', v_ward, 0, v_quality_impact, 0, 0, 0);
        END IF;
        IF v_category IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('category', v_category, 0, v_quality_impact, 0, 0, 0);
        END IF;
        IF v_officer IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('authority', v_officer, 0, v_quality_impact, 0, 0, 0);
        END IF;
        IF v_citizen IS NOT NULL THEN
            PERFORM public.update_report_card_metrics('citizen', v_citizen, 0, v_quality_impact, 0, 0, 0);
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 7. Register Triggers
DROP TRIGGER IF EXISTS trg_complaint_timestamps ON public.complaints;
CREATE TRIGGER trg_complaint_timestamps
    BEFORE INSERT OR UPDATE ON public.complaints
    FOR EACH ROW
    EXECUTE FUNCTION public.process_complaint_timestamps();

DROP TRIGGER IF EXISTS trg_complaint_report_card ON public.complaints;
CREATE TRIGGER trg_complaint_report_card
    AFTER INSERT OR UPDATE OR DELETE ON public.complaints
    FOR EACH ROW
    EXECUTE FUNCTION public.process_complaint_report_card_change();

DROP TRIGGER IF EXISTS trg_review_report_card ON public.reviews;
CREATE TRIGGER trg_review_report_card
    AFTER INSERT OR DELETE ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.process_review_report_card_change();

COMMIT;
