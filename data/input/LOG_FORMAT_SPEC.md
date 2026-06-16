# ProcessLog Output Format Specification

**Document Version**: 1.1
**Last Updated**: 2026-04-21
**Purpose**: Interface specification for downstream consumers (e.g., process flow diagram renderers) of ProcessLog-generated event logs

---

## Overview

This document describes the structure and content of event logs generated for process mining and visualization. Event logs represent **business process executions** as sequences of timestamped activities (events) grouped by cases.

**Key Concepts**:
- **Case**: A single process instance (e.g., one permit application, one order, one patient visit)
- **Event**: A single activity execution within a case (e.g., "Application Submitted", "Review in Progress")
- **Trace**: The complete sequence of events for one case, ordered chronologically
- **Resource**: The person, system, or role that performed an activity
- **Lifecycle**: The state of an event (typically "complete", sometimes "start", "suspend", etc.)

---

## Output Formats

Event logs are available in **4 standard formats**, all containing identical data:

| Format | File Extension | Description | Use Case |
|--------|---------------|-------------|----------|
| **CSV** | `.csv` | Comma-separated values | Spreadsheets, simple tools, human inspection |
| **Parquet** | `.parquet` | Columnar binary format | Large datasets, analytics, data warehouses |
| **JSON** | `.json` | NDJSON (newline-delimited) | Web APIs, streaming, JavaScript applications |
| **XES** | `.xes` | XML-based IEEE standard | PM4Py, ProM, Disco, process mining research |

**Compatibility**: All formats follow the **IEEE 1849-2023 XES standard** naming conventions and are directly importable into **PM4Py** without preprocessing.

---

## Data Structure

### Core Schema (Required Fields)

Every event log contains these **5 mandatory columns/fields**:

| Field Name | XES/PM4Py Name | Type | Description | Example |
|------------|----------------|------|-------------|---------|
| **Case ID** | `case:concept:name` | String | Unique identifier for the case | `"case_0001"`, `"order_12345"` |
| **Activity** | `concept:name` | String | Name of the activity performed | `"Application Submitted"`, `"Payment Processed"` |
| **Timestamp** | `time:timestamp` | ISO 8601 DateTime with timezone offset | When the event occurred | `"2024-01-02 09:00:00-05:00"` |
| **Resource** | `org:resource` | String (nullable) | Who/what performed the activity | `"clerk_002"`, `""` (CSV) / `null` (JSON) for automatic |
| **Lifecycle** | `lifecycle:transition` | String | Event state | **Always `"complete"` in ProcessLog v1.0** |

**Notes**:
- **Resource is null/empty** for automatic/system activities (no human involvement). In CSV this is an empty field between commas; in JSON it is `null`; in Parquet it is a null.
- **Timestamps are timezone-aware.** The tz offset (e.g. `-05:00` / `-04:00` around DST transitions for `America/New_York`) is part of the value in every format. The source-of-truth timezone name is recorded under `timezone` in `run_metadata.json`.
- **`lifecycle:transition` is always `"complete"`** in the current generator — there are no paired `start`/`complete` events. Activity durations must be inferred from the gap between consecutive events in a case, not from start/complete pairs.

---

### Custom Attributes (Optional Fields)

Event logs may include **additional domain-specific attributes** with XES namespace prefixes:

#### Common Namespaces:
- `case:*` - Case-level attributes (same value for all events in a case)
- `cost:*` - Cost-related data (e.g., `cost:amount`)
- `org:*` - Organizational data (e.g., `org:department`, `org:role`)
- `perf:*` - Performance metrics (e.g., `perf:duration`)
- `location:*` - Geographic data (e.g., `location:city`)

#### Examples:

**Case-Level Attributes** (constant per case):
```csv
case:priority         # "low", "normal", "high"
case:applicant_type   # "new_business", "existing_business", "renewal"
case:region          # "north", "south", "east", "west"
case:channel         # "online", "phone", "in_person"
```

**Event-Level Attributes** (vary per event):
```csv
cost:amount          # 45.32, 67.89 (processing cost in currency units)
org:department       # "sales", "finance", "operations"
org:role            # "clerk", "manager", "inspector"
```

**Data Types**:
- String: `"value"`
- Float: `45.32`
- Integer: `100`
- Boolean: `true` / `false`
- DateTime: ISO 8601 format

---

## CSV Format Details (Primary Format)

### Structure

**Header Row**: Column names (XES standard names)
**Data Rows**: One row per event, sorted chronologically within each case

### Example

```csv
case:concept:name,concept:name,time:timestamp,org:resource,lifecycle:transition,case:applicant_type,case:priority,cost:amount
case_0001,submitted,2024-01-02 09:00:00-05:00,,complete,new_business,normal,0.0
case_0001,intake_validation,2024-01-03 15:36:02.533107-05:00,clerk_002,complete,new_business,normal,35.93
case_0001,review_in_progress,2024-01-08 09:22:25.844521-05:00,reviewer_004,complete,new_business,normal,50.50
case_0001,health_inspection,2024-01-11 11:32:40.285949-05:00,inspector_003,complete,new_business,normal,53.80
case_0001,approved,2024-01-18 09:00:00-05:00,,complete,new_business,normal,0.0
case_0002,submitted,2024-01-02 09:00:00-05:00,,complete,renewal,high,0.0
case_0002,intake_validation,2024-01-03 13:46:19.573019-05:00,clerk_001,complete,renewal,high,21.64
case_0002,rejected,2024-01-05 09:00:00-05:00,,complete,renewal,high,0.0
```

> **Note on column order**: the 5 mandatory XES columns come first in the canonical order shown above, then **custom attributes sorted alphabetically by name** (in this example, `case:applicant_type` < `case:priority` < `cost:amount`). This ordering is stable across runs and across the CSV, Parquet, JSON, and XES exporters.

### Characteristics

- **Character Encoding**: UTF-8
- **Line Endings**: Unix (`\n`) or Windows (`\r\n`)
- **Delimiter**: Comma (`,`)
- **Quoting**: Fields with commas/quotes are quoted with double quotes (`"`) — written by pandas, RFC 4180 compliant.
- **Empty Fields**: Represented as empty string (e.g., `,,` for missing resource)
- **Sorting**: Events are sorted by `case:concept:name` (ascending), then `time:timestamp` (ascending). Within a case this gives strictly-non-decreasing timestamps.
- **Column order**: mandatory XES columns first in canonical order, then custom attributes alphabetically — **stable across runs**.

### JSON Format Details

- **Layout**: NDJSON (one JSON object per line), not a JSON array. Read line-by-line.
- **Field order**: pandas preserves the schema's column order when writing, so the same mandatory-then-alphabetical ordering applies.
- **`org:resource`** is written as JSON `null` for automatic activities (not an empty string).
- **Timestamp** is written as a string with tz offset: `"2024-01-02 09:00:00-05:00"`.

### Parquet Format Details

- **Schema**: PyArrow-inferred. `time:timestamp` is `timestamp[ns, tz=...]` (tz-aware); `org:resource` is a nullable `string`.
- **Compression**: default (Snappy) — readable by any Apache Arrow / Parquet client.

### XES Format Details

- **Writer**: `pm4py.write_xes` (IEEE 1849-2023 compliant XML).
- **Consumption**: the intended consumer is `pm4py.read_xes(...)`. Raw XML parsing works but is discouraged — use a PM4Py-compatible reader.

---

## Process Structure Information

### Cases and Traces

**Case Grouping**: Events with the same `case:concept:name` form a single trace (process instance)

**Trace Example** (case_0001):
```
submitted → intake_validation → review_in_progress → health_inspection → approved
```

**Trace Characteristics**:
- **Start Activity**: First event in the trace (e.g., `"submitted"`)
- **End Activity**: Last event in the trace (e.g., `"approved"`, `"rejected"`, `"withdrawn"`)
- **Cycle Time**: Duration from start to end timestamp
- **Event Count**: Number of activities in the trace (typically 3-15 events)

### Process Variants

**Definition**: Unique sequences of activities across cases

**Common Patterns**:
1. **Happy Path**: Direct flow with no rework (e.g., `submitted → review → inspection → approved`)
2. **Rework Loops**: Activities repeated (e.g., `review → request_info → review → request_info → review`)
3. **Early Termination**: Process ends before typical completion (e.g., `submitted → rejected`)
4. **Alternative Paths**: Different branches (e.g., `approved` vs `rejected` vs `withdrawn`)

**Variant Distribution**: Typically 3-10 major variants representing 80%+ of cases

---

## Data Characteristics

### Volume

- **Cases**: Typically 100 - 10,000+ per file
- **Events**: Typically 500 - 100,000+ per file
- **Events per Case**: Average 5-10 events, range 2-30 events

### Temporal Properties

**Timestamps**:
- Strictly increasing within each case (chronological order)
- May overlap across cases (parallel execution)
- Include business hours effects (e.g., no events on weekends/holidays)
- Duration between events: seconds to weeks

**Working Calendar Effects**:
- Events may cluster at business hours (e.g., 9 AM - 5 PM, Monday-Friday)
- Gaps during nights, weekends, holidays
- Timezone-aware (typically single timezone per log)

### Resources

**Resource Assignment**:
- Human activities have assigned resources (e.g., `"clerk_002"`, `"Alice Martinez"`)
- Automatic/system activities have empty resources (`""`)
- Resources may be IDs (`"clerk_002"`) or names (`"Alice Martinez"`)
- Same resource may appear across multiple cases (workload distribution)

**Resource Behavior**:
- Performance varies (some faster/slower) — resource `speed` multiplier
- Capacity varies (some handle more cases) — capacity-weighted assignment

> **ProcessLog v1.1.0 note:** *fatigue* (slower over time) is defined in the
> config schema but **not applied** by the generator — the `workload` counter
> is tracked yet never read. Duration variability comes only from the base
> distribution × resource `speed` × `consistency`.

### Anomalies and Realism

**Realistic Variability**:
- **Most events**: Predictable durations (e.g., 1-3 days for review)
- **Spread**: per-activity uniform (`min`/`max`) or gaussian
  (`typical`/`spread`) durations, scaled by each resource's `consistency`

> **ProcessLog v1.1.0 note:** the config schema also defines *random delays*
> (~5% of events 2-4× longer), *peak-time* slowdowns (~30% of cases), and
> extreme *outliers* — and validates them — but the v1.1.0 engine does
> **not** apply them. Observed duration variability is fully determined by
> the base distribution and resource `speed`/`consistency`.

**Cost Distribution** (if present):
- Follows normal distribution with occasional outliers
- Zero cost for automatic activities
- Positive cost for human activities

---

## PM4Py Integration

### Direct Import

All formats can be imported directly into PM4Py:

```python
import pm4py

# CSV format
log = pm4py.read_csv('events.csv')

# XES format
log = pm4py.read_xes('events.xes')

# Parquet format
import pandas as pd
df = pd.read_parquet('events.parquet')
log = pm4py.convert_to_event_log(df)
```

### Supported Analyses

**Process Discovery**:
- Directly Follows Graphs (DFG)
- Petri nets (Alpha Miner, Inductive Miner)
- BPMN diagrams
- Process trees

**Conformance Checking**:
- Token replay
- Alignment-based conformance

**Performance Analysis**:
- Cycle time analysis
- Bottleneck detection
- Resource utilization

**Filtering**:
- Time range filters
- Activity filters
- Variant filters
- Attribute filters

---

## Process Flow Diagram Rendering - Key Data Points

### Node (Activity) Information

**From `concept:name` field**:
- Activity name (e.g., `"Application Submitted"`, `"Review in Progress"`)
- Frequency: Count of events with this activity name
- Resources: Set of unique resources performing this activity

**Suggested Visual Encoding**:
- Node size: Frequency (more frequent = larger)
- Node color: Activity type (start=green, end=red, intermediate=blue)
- Node label: Activity name + frequency count

### Edge (Transition) Information

**Derived from consecutive events within each case**:
- From Activity → To Activity
- Frequency: Count of case transitions between activities
- Average Duration: Mean time between activities
- Duration Range: Min/max time between activities

**Example**:
```
From: "Review in Progress"
To: "Health Inspection"
Frequency: 847 cases
Avg Duration: 2.3 days
Min/Max: 1.2 / 8.5 days
```

**Suggested Visual Encoding**:
- Edge thickness: Frequency (more frequent = thicker)
- Edge color: Average duration (fast=green, slow=red)
- Edge label: Frequency or avg duration

### Start and End Activities

**Start Activities**: Activities that begin cases (first event per case)
- Identify: `MIN(time:timestamp) GROUP BY case:concept:name`
- Typically 1 start activity (e.g., `"submitted"`)

**End Activities**: Activities that terminate cases (last event per case)
- Identify: `MAX(time:timestamp) GROUP BY case:concept:name`
- Typically 2-5 end activities (e.g., `"approved"`, `"rejected"`, `"withdrawn"`)

### Process Variants (Paths)

**Extraction**:
1. Group events by `case:concept:name`
2. Sort by `time:timestamp` (ascending)
3. Extract activity sequence: `[activity_1, activity_2, ..., activity_n]`
4. Group cases by identical sequences

**Example Variants**:
```
Variant 1 (58%): submitted → intake → review → inspection → approved
Variant 2 (24%): submitted → intake → review → request_info → review → inspection → approved
Variant 3 (10%): submitted → intake → review → inspection → rejected
Variant 4 (5%): submitted → intake → review → request_info → withdrawn
Variant 5 (3%): submitted → intake → rejected
```

**Use for Visualization**:
- Highlight most common path (happy path)
- Show variant splits/merges
- Animate case flow along paths

### Loops and Rework

**Detection**: Same activity appears multiple times in a trace

**Example**:
```
case_0005: submitted → intake → review → request_info → applicant_provided → review → request_info → applicant_provided → review → inspection → approved
                                          ↑                                           ↑
                                          └───────────────── LOOP 1 ─────────────────┘
```

**Metrics**:
- Loop count: Number of times activity repeats
- Rework percentage: Cases with loops / total cases
- Loop duration: Time spent in rework cycles

---

## Example Use Cases

### 1. Process Flow Diagram
- **Nodes**: Unique activities from `concept:name`
- **Edges**: Transitions between consecutive events
- **Metrics**: Frequency, avg duration, bottlenecks

### 2. Timeline Visualization
- **X-axis**: `time:timestamp`
- **Y-axis**: Cases (`case:concept:name`)
- **Events**: Dots/bars colored by activity

### 3. Resource Workload Dashboard
- **Resources**: Unique values from `org:resource`
- **Metrics**: Cases per resource, avg handling time
- **Filters**: Time range, activity type

### 4. Variant Analysis
- **Paths**: Extract trace sequences per case
- **Metrics**: Variant frequency, cycle time by variant
- **Comparison**: Happy path vs rework variants

### 5. Bottleneck Detection
- **Duration**: Time between consecutive events
- **Outliers**: Events with duration > 95th percentile
- **Visualization**: Heatmap of slow transitions

---

## File Layout and Sidecar Metadata

### Run folder layout

Each `processlog generate` invocation creates a timestamped run folder under `output/runs/`:

```
output/runs/20260421_135355_restaurant_permit_n1000_s42/
├── events.csv             # CSV export (if requested)
├── events.parquet         # Parquet export (if requested)
├── events.json            # NDJSON export (if requested)
├── events.xes             # XES export (if requested)
└── run_metadata.json      # Sidecar metadata (always present)
```

The folder name encodes `{YYYYMMDD}_{HHMMSS}_{process_slug}_n{num_cases}_s{seed}`.

### `run_metadata.json`

The sidecar is the **authoritative schema description** for its sibling event files — a downstream consumer does not need to read the source YAML config.

```json
{
  "generator_version": "1.0.0",
  "generated_at": "2026-04-21T13:53:55.123456",
  "generation_duration_seconds": 0.07,
  "seed": 42,
  "process_name": "Restaurant Permit Application",
  "num_cases": 1000,
  "num_events": 7347,
  "start_date": "2024-01-01",
  "end_date": "2024-06-30",
  "timezone": "America/New_York",
  "columns": [
    {"name": "case:concept:name",    "type": "string",   "scope": "event_mandatory"},
    {"name": "concept:name",         "type": "string",   "scope": "event_mandatory"},
    {"name": "time:timestamp",       "type": "datetime", "scope": "event_mandatory"},
    {"name": "org:resource",         "type": "string",   "scope": "event_mandatory"},
    {"name": "lifecycle:transition", "type": "string",   "scope": "event_mandatory"},
    {"name": "case:priority",        "type": "string",   "scope": "case_custom"},
    {"name": "case:applicant_type",  "type": "string",   "scope": "case_custom"},
    {"name": "cost:amount",          "type": "float",    "scope": "event_custom"}
  ],
  "statistics": {
    "mean_cycle_time_hours": 501.05,
    "median_cycle_time_hours": 386.71,
    "min_cycle_time_hours": 53.53,
    "max_cycle_time_hours": 1992.0,
    "std_cycle_time_hours": 278.93,
    "mean_events_per_case": 7.35
  },
  "activity_distribution": { "submitted": 1000, "intake_validation": 1000, "approved": 777, "rejected": 151, "...": "..." },
  "resource_utilization":  { "clerk_001": 318, "reviewer_002": 479, "...": "..." },
  "git_commit": "0cce5e1",
  "cli_command": "…/venv/bin/processlog generate -c configs/process_config.yaml -n 1000",
  "config_file": "configs/process_config.yaml"
}
```

**The `columns` block** is the machine-readable schema. For each emitted column:
- `name` — the column name as it appears in every export (CSV header, JSON keys, Parquet schema, XES attribute).
- `type` — one of `string`, `datetime`, `float`, `int`, `bool`.
- `scope` — one of:
  - `event_mandatory` — always present; one of the 5 XES standard columns.
  - `case_custom` — declared under `case_attributes` in the config; the same value repeats for every event in a case.
  - `event_custom` — declared under `event_attributes` in the config; varies per event.

---

## Reference Samples

These sample runs are generated by the current codebase (post-fix) and are the recommended test input for downstream projects:

| Path | Cases | Events | Use |
|---|---|---|---|
| `output/runs/20260421_135355_restaurant_permit_n1000_s42/` | 1000 | 7347 | Realistic complexity — variant analysis, layout stress test |
| `output/runs/20260421_135405_restaurant_permit_n5_s42/`   | 5    | 36   | Small fixture for unit tests |
| `output/runs/20260421_135405_restaurant_permit_n3_s42/`   | 3    | 15   | Minimal fixture — 3 full traces |

All three were generated from `configs/process_config.yaml` (the Restaurant Permit Application process) with `seed=42` and `timezone: America/New_York`. To reproduce any of them from the config:

```bash
processlog generate -c configs/process_config.yaml -n 5 -f all
```

---

## Minimum Consumer Pseudocode

The simplest way to consume the CSV, grouped by case:

```python
import json, pandas as pd
from pathlib import Path

run = Path("output/runs/20260421_135405_restaurant_permit_n5_s42")
meta = json.loads((run / "run_metadata.json").read_text())

df = pd.read_csv(run / "events.csv")
df["time:timestamp"] = pd.to_datetime(df["time:timestamp"], format="ISO8601")

for case_id, trace in df.groupby("case:concept:name"):
    activities = trace.sort_values("time:timestamp")["concept:name"].tolist()
    print(case_id, "→", " → ".join(activities))
```

For XES, use PM4Py:

```python
import pm4py
log = pm4py.read_xes(str(run / "events.xes"))
```

---

## Quality Guarantees

**Data Integrity**:
- ✅ All cases have at least one event
- ✅ Timestamps are chronologically ordered within cases
- ✅ All required fields are present (no null values in core schema)
- ✅ Case IDs are unique per case, consistent across events
- ✅ Activity names are non-empty strings

**Semantic Validity**:
- ✅ Each case has exactly one start activity
- ✅ Each case has exactly one end activity
- ✅ All transitions between activities are logically valid (no impossible flows)
- ✅ Resource assignments are consistent (resources don't switch mid-activity)

**Reproducibility**:
- ✅ Same configuration = identical output (seeded generation)
- ✅ Metadata tracks generation parameters

---

## Technical Notes

### Parsing Considerations

**CSV Parsing**:
- Use UTF-8 encoding
- Handle quoted fields (RFC 4180 compliant)
- Empty resource fields are valid (automatic activities)
- Timestamp parsing: ISO 8601 format with microseconds

**Memory Efficiency**:
- CSV: Text-based, ~50-100 MB per 1M events
- Parquet: Binary, ~10-20 MB per 1M events (5-10x compression)
- JSON: Text-based, ~80-120 MB per 1M events
- XES: XML-based, ~100-150 MB per 1M events

**Streaming**:
- CSV/JSON: Can be read line-by-line (streaming)
- Parquet: Columnar, supports chunk reading
- XES: XML requires full parsing (not streaming-friendly)


---

## Known Limitations (design-by-intent, not bugs)

1. **`lifecycle:transition` is always `"complete"`.** There are no paired `start`/`complete` events. Activity durations can only be inferred from the gap between consecutive events within a case, not from lifecycle pairs. A downstream flow-diagram generator that expects lifecycle pairs will have to infer start times.
2. **JSON output is NDJSON, not a JSON array.** Parsers must read line by line.
3. **`org:resource` is nullable** — for automatic activities (e.g., `submitted`, `approved`) it is the empty string in CSV and `null` in JSON/Parquet. Downstream aggregations over resources must explicitly handle this null.
4. **One timezone per log.** The entire log uses the single `timezone` value from the config; no per-event timezones, no mixing.
5. **No inter-case dependencies.** Cases are independent — the simulator does not model queueing between cases. This is a property of the *generator*, not the log format.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | 2026-04-21 | Timestamps are now timezone-aware (offset in every format). Added `columns` schema block to `run_metadata.json`. Custom attribute columns are sorted alphabetically. Clarified that `lifecycle:transition` is always `"complete"` in v1.0. Refreshed CSV example and sidecar JSON example against actual output. |
| 1.0 | 2025-10-12 | Initial specification |

---

## Contact & Support

This specification is designed to be **tool-agnostic** and follows **IEEE 1849-2023 XES standard** conventions for maximum compatibility with process mining tools.

For questions or clarifications, refer to:
- **XES Standard**: IEEE 1849-2023
- **PM4Py Documentation**: https://pm4py.fit.fraunhofer.de/
- **Process Mining Book**: "Process Mining: Data Science in Action" by Wil van der Aalst
