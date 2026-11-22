BEGIN;

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA water_monitor;
REVOKE ALL ON SCHEMA water_monitor FROM PUBLIC;

-- Find PostGIS types whether the host installs them in public or extensions.
SELECT pg_catalog.set_config('search_path', pg_catalog.format('pg_catalog, %I', n.nspname), true)
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
WHERE e.extname = 'postgis';

-- Store one owner per site. The API will supply the authenticated user's UUID.
CREATE TABLE water_monitor.sites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL,
    name text NOT NULL
);
CREATE INDEX sites_by_owner ON water_monitor.sites (owner_user_id);

CREATE TABLE water_monitor.water_bodies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES water_monitor.sites (id),
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('storage_tank', 'fish_tank', 'filtration_system', 'reservoir')),
    manual_location geometry(Point, 4326),
    outline geometry(MultiPolygon, 4326)
);
CREATE INDEX water_bodies_by_site ON water_monitor.water_bodies (site_id);

CREATE TABLE water_monitor.devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    water_body_id uuid NOT NULL REFERENCES water_monitor.water_bodies (id),
    name text NOT NULL,
    device_class text NOT NULL CHECK (device_class IN ('compact', 'field')),
    source text NOT NULL CHECK (source IN ('simulated', 'real')),
    location_mode text NOT NULL CHECK (location_mode IN ('manual', 'gps')),
    reporting_interval_seconds integer NOT NULL CHECK (reporting_interval_seconds > 0),
    UNIQUE (id, source),
    UNIQUE (id, water_body_id)
);
CREATE INDEX devices_by_water_body ON water_monitor.devices (water_body_id);

-- Use a consistent unit for calibration output and threshold comparisons.
CREATE TABLE water_monitor.sensor_types (
    code text PRIMARY KEY,
    calibrated_unit text NOT NULL
);
INSERT INTO water_monitor.sensor_types (code, calibrated_unit)
VALUES ('water_depth', 'm'), ('water_temperature', '°C');

-- Keep calibration versions addressable after a device is recalibrated.
CREATE TABLE water_monitor.calibrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES water_monitor.devices (id),
    sensor_code text NOT NULL REFERENCES water_monitor.sensor_types (code),
    version integer NOT NULL CHECK (version > 0),
    calibrated_at timestamptz NOT NULL,
    method text NOT NULL,
    parameters jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(parameters) = 'object'),
    UNIQUE (device_id, sensor_code, version)
);

CREATE TABLE water_monitor.maintenance_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id uuid NOT NULL REFERENCES water_monitor.devices (id),
    occurred_at timestamptz NOT NULL,
    action text NOT NULL,
    notes text
);

-- The device reuses its event ID across retries, including uploads made after an outage.
CREATE TABLE water_monitor.reports (
    device_id uuid NOT NULL,
    event_id uuid NOT NULL,
    water_body_id uuid NOT NULL,
    source text NOT NULL,
    recorded_at timestamptz NOT NULL,
    received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    battery_voltage numeric CHECK (battery_voltage >= 0 AND battery_voltage < 'Infinity'::numeric),
    location geometry(Point, 4326),
    PRIMARY KEY (device_id, event_id),
    UNIQUE (device_id, event_id, water_body_id),
    FOREIGN KEY (device_id, source) REFERENCES water_monitor.devices (id, source),
    FOREIGN KEY (device_id, water_body_id) REFERENCES water_monitor.devices (id, water_body_id)
);
CREATE INDEX reports_by_device_time ON water_monitor.reports (device_id, recorded_at DESC);

-- Raw observations can be stored even when no calibration has been applied.
CREATE TABLE water_monitor.readings (
    device_id uuid NOT NULL,
    event_id uuid NOT NULL,
    sensor_code text NOT NULL REFERENCES water_monitor.sensor_types (code),
    raw_value double precision NOT NULL CHECK (raw_value > '-Infinity' AND raw_value < 'Infinity'),
    raw_unit text NOT NULL CHECK (btrim(raw_unit) <> ''),
    calibrated_value double precision CHECK (calibrated_value > '-Infinity' AND calibrated_value < 'Infinity'),
    calibration_version integer,
    quality_flag text NOT NULL CHECK (quality_flag IN ('unchecked', 'valid', 'suspect', 'invalid')),
    PRIMARY KEY (device_id, event_id, sensor_code),
    FOREIGN KEY (device_id, event_id) REFERENCES water_monitor.reports (device_id, event_id),
    FOREIGN KEY (device_id, sensor_code, calibration_version)
        REFERENCES water_monitor.calibrations (device_id, sensor_code, version),
    CHECK ((calibrated_value IS NULL) = (calibration_version IS NULL))
);

-- Tank limits use the sensor type's calibrated unit. Record where each limit came from.
CREATE TABLE water_monitor.thresholds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    water_body_id uuid NOT NULL REFERENCES water_monitor.water_bodies (id),
    sensor_code text NOT NULL REFERENCES water_monitor.sensor_types (code),
    lower_limit double precision CHECK (lower_limit > '-Infinity' AND lower_limit < 'Infinity'),
    upper_limit double precision CHECK (upper_limit > '-Infinity' AND upper_limit < 'Infinity'),
    source_note text NOT NULL CHECK (btrim(source_note) <> ''),
    UNIQUE (id, water_body_id, sensor_code),
    CHECK (lower_limit IS NOT NULL OR upper_limit IS NOT NULL),
    CHECK (lower_limit <= upper_limit)
);
CREATE INDEX thresholds_by_water_body ON water_monitor.thresholds (water_body_id, sensor_code);

-- A threshold alert must describe a reading from that same tank and sensor type.
CREATE TABLE water_monitor.alerts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    threshold_id uuid NOT NULL,
    water_body_id uuid NOT NULL,
    device_id uuid NOT NULL,
    event_id uuid NOT NULL,
    sensor_code text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    resolved_at timestamptz,
    UNIQUE (threshold_id, device_id, event_id, sensor_code),
    FOREIGN KEY (threshold_id, water_body_id, sensor_code)
        REFERENCES water_monitor.thresholds (id, water_body_id, sensor_code),
    FOREIGN KEY (device_id, event_id, water_body_id)
        REFERENCES water_monitor.reports (device_id, event_id, water_body_id),
    FOREIGN KEY (device_id, event_id, sensor_code)
        REFERENCES water_monitor.readings (device_id, event_id, sensor_code),
    CHECK (resolved_at >= created_at)
);

COMMIT;
