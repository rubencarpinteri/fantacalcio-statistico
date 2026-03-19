You are a principal full-stack engineer, product architect, UX designer, and database designer.
Build a production-ready web application called "Fantacalcio Statistico" for a private Italian fantasy football league.
Do not implement everything at once. First analyze the specification, propose the architecture, database schema, Mantra formation-slot model, ambiguous role classification model, and a phased implementation plan. Wait for approval before writing code.
This is not a generic fantasy football app.
This is a custom Mantra-style Fantacalcio platform with:
- league-scoped player pool
- roster upload by participants
- Mantra tactical roles
- lineup validation based on Mantra compatibility
- a custom fully transparent statistics-based player rating engine
- admin-managed source ratings and event stats
- audit logs and historical traceability
- versioned calculations
- matchday deadlines and immutable submissions after lock
The application must be modern, elegant, robust, responsive, and easy to maintain.
The product must feel like a real internal tool for a serious private league, not a toy demo.
Do not give me only a high-level concept. Generate the actual application code, schema, migrations, and implementation details.
==================================================
1. PRODUCT CONTEXT
==================================================
A group of friends plays a custom Italian Fantacalcio league.
They do NOT want journalist-based player votes.
They want a fully statistics-based scoring system called "Fantacalcio Statistico".
For each player performance, the app must:
1. collect three external source ratings:
- SofaScore
- WhoScored
- FotMob
2. normalize them because their scales and distributions are different
3. combine them into a custom "Voto Base"
4. apply fantasy bonuses and maluses
5. produce a final "Fantavoto Statistico"
The app is NOT responsible for automatically scraping those sources in v1.
In v1, the league admin manually enters ratings and event stats.
The app calculates everything automatically from those inputs.
The league uses Mantra logic for tactical roles and formation validation.
==================================================
2. PRIMARY OBJECTIVES
==================================================
Build a web app where:
- the admin creates and configures the league
- the admin uploads participant rosters
- the app creates players only from uploaded rosters
- managers submit formations before each matchday deadline
- every submission is timestamped and versioned
- after deadline, submissions are locked
- admins enter ratings and raw stats after matches
- the app calculates Voto Base and Fantavoto automatically
- the app displays full transparent breakdowns
- the app stores history, audit logs, and manual overrides
==================================================
3. MANDATORY TECH STACK
==================================================
Use this stack:
- Next.js with App Router
- React
- TypeScript strict mode
- Tailwind CSS
- Supabase Postgres
- Supabase Auth
- Supabase Storage if useful for CSV templates or imports
- Row Level Security
- Server-side rendering and server actions where appropriate
- Clean modular domain logic
- Strong schema constraints
- End-to-end type safety
Deployment target:
- Vercel for frontend/app
- Supabase for database/auth
Do not use:
- fragile scraping in v1
- paid APIs in v1
- mock-only architecture
- placeholder implementations
- fake static demo logic pretending to be real
==================================================
4. CORE PRODUCT PRINCIPLES
==================================================
The app must optimize for:
- correctness
- traceability
- transparency
- maintainability
- admin efficiency
- strong lineup auditability
- readable calculations
- easy future extension
Do not hide calculations.
Do not simplify the scoring system into a plain average.
Do not hardcode a global Serie A database in v1.
Do not treat Mantra as classic fantasy football roles.
==================================================
5. USER ROLES
==================================================
Implement these user roles:
1. super_admin
2. league_admin
3. manager
Permissions:
super_admin:
- full system access
league_admin:
- manage league settings
- manage managers
- upload rosters
- create and manage matchdays
- configure valid formations
- configure ambiguous role classification
- enter ratings and raw stats
- run calculations
- publish results
- override scores
- reopen locked matchdays
- view all audit logs
manager:
- log in
- view own team
- view own roster
- submit formation
- submit lineup before deadline
- view submission history for own team
- view results, standings, player breakdowns after publication
- cannot edit ratings
- cannot edit calculations
- cannot view other managers’ draft submissions before lock if league rules disable that
==================================================
6. LEAGUE MODEL
==================================================
This app supports one private league in v1.
League settings must include:
- league name
- season name
- timezone
- matchday lock behavior
- whether final fantasy scores are shown with 1 decimal or rounded to nearest 0.5
- whether optional advanced bonuses are enabled
- list of valid Mantra formations
- bench rules
- role classification rules for ambiguous Mantra roles
- scoring mode:
- head-to-head
- points-only
- both, if desired
All settings must be editable by admin and auditable.
==================================================
7. PLAYERS MODEL: LEAGUE-SCOPED ONLY
==================================================
Do NOT create a full global database of all Serie A players by default.
Instead, use a league-scoped player pool.
Required behavior:
- the admin uploads each participant roster via CSV or form input
- the system creates player records only for players appearing in uploaded rosters
- the app must support later manual addition of players for:
- transfers
- repairs
- corrections
- season updates
This is critical.
The database must reflect this:
- players belong to the league context
- team rosters reference league players
- no unnecessary global player catalog is required in v1
==================================================
8. MANTRA ROLES AND STATISTICAL CLASSIFICATION
==================================================
This is a Mantra-style fantasy football app.
Do NOT model players only as GK / DEF / MID / ATT.
Players must support official Mantra tactical roles, including multi-role assignments.
Examples of Mantra roles:
- Por
- Dc
- Dd
- Ds
- E
- M
- C
- W
- T
- A
- Pc
A player may have one or multiple Mantra roles.
Examples:
- ["Dc"]
- ["Dd", "E"]
- ["M", "C"]
- ["W", "T"]
- ["A", "Pc"]
The app must clearly separate:
1. tactical Mantra role(s), used for:
- roster display
- formation validation
- lineup compatibility
2. statistical rating class, used by the custom scoring engine:
- GK
- DEF
- MID
- ATT
Important:
The statistical rating class is NOT always automatically derived from the Mantra role.
Some Mantra roles are ambiguous and must be configurable at league level.
Mandatory rule for v1:
- the role "E" must be configurable by the league admin as either:
- DEF
- MID
This classification affects:
- role multiplier
- defensive correction
- clean sheet logic
- goals conceded malus logic where applicable
Recommended architecture:
- mantra_roles: array field
- primary_mantra_role: optional
- rating_class: GK | DEF | MID | ATT
- role classification settings table for ambiguous roles
Recommended v1:
- E must be configurable
- architecture must allow future extension to other ambiguous roles such as W or A
- all role changes must be logged historically
==================================================
9. FORMATION ENGINE: MANTRA-AWARE
==================================================
The formation engine must be Mantra-aware.
Do not validate lineups only by broad role groups.
Validate lineups using Mantra role compatibility.
The league admin must be able to define valid Mantra formations for the league.
Examples:
- formations are not just numeric classic formations
- the app must support tactical slots or a compatibility matrix based on Mantra roles
Implement the formation system in a configurable way.
Recommended model:
- each formation has named slots
- each slot defines allowed Mantra role compatibility
- each selected player must satisfy one slot
- the lineup validator must verify full compatibility
The system must support:
- starters
- bench
- bench order
- validation errors
- incomplete lineups as draft
- final valid submission before deadline
The app must not assume official Fantacalcio Mantra slot logic unless it is explicitly configured.
Use an admin-configurable formation-slot compatibility model.
==================================================
10. ROSTER IMPORT
==================================================
Admins must be able to import rosters through CSV.
Each uploaded roster row should support at minimum:
- manager/team name
- player full name
- club
- mantra roles
- optional rating class
- optional notes
If rating class is missing:
- derive from default mapping rules where possible
- require explicit admin confirmation for ambiguous roles like E
Import UX requirements:
- preview before confirm
- validation errors
- duplicate detection
- merge/update behavior
- import summary report
- audit log of import action
Also support manual add/edit/remove of players.
==================================================
11. MATCHDAYS
==================================================
The admin must be able to create matchdays manually.
Each matchday must include:
- name or number
- open datetime
- lock datetime
- timezone-aware behavior
- status:
- draft
- open
- locked
- scoring
- published
- archived
Admin actions:
- create matchday
- open matchday
- lock matchday
- reopen matchday with explicit confirmation
- publish scores
- archive matchday
Every state transition must be logged.
==================================================
12. LINEUP SUBMISSION SYSTEM
==================================================
Managers must be able to:
- choose a formation from the valid Mantra formations enabled by the league
- select starters
- assign bench players
- order bench priority
- save lineup draft
- submit lineup before deadline
- resubmit before deadline
After deadline:
- lineup becomes immutable for managers
- admin can still inspect all submitted versions
- admin override must be possible only with full audit log
Each lineup submission must store:
- id
- team_id
- matchday_id
- chosen_formation_id
- lineup status: draft or submitted or locked
- created_at
- updated_at
- submission_number
- submitted_at
- locked_snapshot_json
- source_ip if feasible
- actor user id
Keep full version history.
Do not overwrite old submissions silently.
Lineup audit requirements:
- every version saved
- every resubmission preserved
- clear timestamp history
- visual diff between versions
- admin can inspect all historical versions
- manager can inspect own versions
This is critical because the user had previous problems with submissions not always being recorded correctly.
The app must make missed or overwritten submissions practically impossible.
==================================================
13. MATCH DATA ENTRY
==================================================
League admin must be able to enter player data for each real-world player appearance in a matchday.
Required input groups:
A. source ratings
- sofascore_rating
- whoscored_rating
- fotmob_rating
B. appearance data
- minutes_played
- official season role
- rating_class used by engine for that matchday if needed
C. defensive and goalkeeper metrics
- tackles_won
- interceptions
- clearances
- blocks
- aerial_duels_won
- dribbled_past
- saves
- goals_conceded
- error_leading_to_goal
D. event modifiers
- goals_scored
- assists
- own_goals
- yellow_cards
- red_cards
- penalties_scored
- penalties_missed
- penalties_saved
- clean_sheet_boolean
E. optional advanced bonus inputs
- key_passes
- expected_assists
- successful_dribbles
- dribble_success_rate
- completed_passes
- pass_accuracy
- final_third_passes
- progressive_passes
Admin entry UX must include:
- bulk editable table for whole matchday
- inline editing
- keyboard-friendly workflow
- autosave draft
- validation messages
- import/export CSV
- row status indicators
- completeness indicators
- ability to mark rows as provisional
- final publish action
==================================================
14. CUSTOM RATING ENGINE
==================================================
Implement the rating engine as a pure, deterministic, fully tested domain module.
It must not depend on UI state.
It must not hide intermediate values.
It must always store calculation details.
------------------------------------------
14.1 Step 1: normalize source ratings
------------------------------------------
z_ss = (sofascore_rating - 6.87) / 0.54
z_ws = (whoscored_rating - 6.62) / 0.67
z_fm = (fotmob_rating - 6.87) / 0.79
------------------------------------------
14.2 Step 2: weighted combination
------------------------------------------
z_comb = 0.40 * z_ss + 0.25 * z_ws + 0.35 * z_fm
Rules:
- if one source is missing, use available sources and proportionally rescale weights to sum to 1
- if only one source is available, mark result as provisional and shrink absolute z-score by 25 percent toward zero
------------------------------------------
14.3 Step 3: minutes factor
------------------------------------------
Minutes rules:
- 0 to 9 minutes:
- no rating
- unless decisive event occurred
- if decisive event occurred, assign base 6.0 and apply only bonus/malus
- 10 to 14 minutes:
- factor 0.70
- 15 to 29 minutes:
- factor 0.85
- 30 or more minutes:
- factor 1.00
z_min = minutes_factor * z_comb
------------------------------------------
14.4 Step 4: convert to Italian base scale
------------------------------------------
b0 = 6.0 + 1.15 * z_min
------------------------------------------
14.5 Step 5: role multiplier
------------------------------------------
b1 = 6 + k_pos * (b0 - 6)
k_pos values:
- GK: 1.15
- DEF: 1.10
- MID: 1.00
- ATT: 0.97
Important:
rating_class is the class used here, not the raw Mantra tactical role.
------------------------------------------
14.6 Step 6: defensive correction
------------------------------------------
For defenders and midfielders:
D = 0.08 * tackles_won
+ 0.08 * interceptions
+ 0.04 * clearances
+ 0.10 * blocks
+ 0.03 * aerial_duels_won
- 0.10 * dribbled_past
- 0.60 * error_leading_to_goal
Caps:
- DEF: min -1.0, max +1.5
- MID: min -0.8, max +0.8
For goalkeepers:
D_gk = 0.12 * saves
- 0.15 * goals_conceded
- 0.60 * error_leading_to_goal
Cap:
- GK: min -1.0, max +1.2
For attackers:
- no defensive correction
------------------------------------------
14.7 Step 7: Voto Base
------------------------------------------
voto_base = clamp(b1 + defensive_correction, 3.0, 9.5)
Default display format:
- 1 decimal place
------------------------------------------
14.8 Step 8: bonus and malus
------------------------------------------
Goals:
- attacker goal: +1.8
- midfielder goal: +2.2
- defender goal: +2.8
- goalkeeper goal: +4.0
Penalties:
- penalty scored: normal role goal bonus minus 0.3
- penalty missed: -1.5
- penalty saved by goalkeeper: +2.0
Assists:
- assist: +1.0
Own goals:
- own goal: -1.5
Cards:
- yellow card: -0.3
- red card: -1.5
Clean sheet and goals conceded:
- goalkeeper clean sheet with at least 60 minutes: +0.8
- defender clean sheet with at least 60 minutes: +0.5
- goalkeeper each goal conceded: -0.4
- defender each goal conceded with at least 60 minutes: -0.15
Multi-goal bonuses:
- brace extra bonus: +0.5
- hat-trick extra bonus: +1.0
Optional advanced bonuses, total cap +1.0:
- +0.5 if key_passes >= 5 OR expected_assists >= 0.70
- +0.5 if successful_dribbles >= 6 AND dribble_success_rate >= 60
- +0.5 if completed_passes >= 50 AND pass_accuracy >= 90 AND (final_third_passes >= 8 OR progressive_passes >= 5)
------------------------------------------
14.9 Step 9: final fantasy score
------------------------------------------
fantavoto = voto_base + total_bonus_malus
The app must store:
- all raw inputs
- normalized values
- intermediate values
- final Voto Base
- final Fantavoto
- exact bonus/malus breakdown
- flags such as provisional, override, manual adjustment
==================================================
15. SCORE PUBLICATION AND VERSIONING
==================================================
The calculation flow must support:
- draft calculations
- provisional calculations
- published official calculations
Admins must be able to:
- calculate preview without publishing
- inspect all breakdowns
- publish official matchday results
- republish if needed with versioning
- compare calculation versions
Every publication event must create:
- a version snapshot
- a timestamp
- actor id
- optional admin note
==================================================
16. MANUAL OVERRIDES
==================================================
League admin must be able to manually override a player final score.
Override requirements:
- original calculated score remains visible
- overridden score stored separately
- mandatory textual reason
- override is highlighted in UI
- override is included in audit log
- override affects standings only after publication or explicit recalculation confirmation
==================================================
17. STANDINGS AND SCORING MODES
==================================================
Implement standings logic for:
- head-to-head mode
- points-only mode
- optionally both
Standings data should support:
- points
- wins
- draws
- losses
- goals for
- goals against
- fantasy points for
- fantasy points against
- trend if useful
- matchday breakdown
The app must support recalculation if historical overrides or stats change, with versioned snapshots.
==================================================
18. TRANSPARENCY REQUIREMENTS
==================================================
This is essential.
Every player detail page and every calculation screen must clearly show:
- source ratings entered
- normalized z-scores
- weighted combined score
- minutes factor
- Italian base conversion
- role multiplier
- defensive correction
- bonus/malus
- final Voto Base
- final Fantavoto
- whether result is provisional
- whether an override exists
Math must be human-readable.
Do not hide formula steps behind vague labels.
==================================================
19. AUDIT LOG SYSTEM
==================================================
Build a robust audit system.
Every important action must be auditable:
- roster import
- roster edit
- player creation
- player role change
- rating class change
- matchday creation
- matchday state change
- lineup save
- lineup submission
- lineup lock
- stats edit
- ratings edit
- calculation draft
- calculation publish
- override creation
- override removal
- league settings change
- formation settings change
- ambiguous role classification change
- matchday reopen
Audit log structure must include:
- id
- actor_user_id
- action_type
- entity_type
- entity_id
- before_json
- after_json
- metadata_json
- created_at
Build an audit log viewer UI with filters.
==================================================
20. DATABASE SCHEMA
==================================================
Create a robust Supabase/Postgres schema with migrations.
Required tables should include at least:
- profiles
- leagues
- league_users
- fantasy_teams
- league_players
- player_role_assignments
- team_roster_entries
- roster_import_batches
- matchdays
- formations
- formation_slots
- lineup_submissions
- lineup_submission_players
- player_match_stats
- player_source_ratings
- player_calculations
- player_calculation_versions
- score_overrides
- standings_snapshots
- audit_logs
- app_settings
Recommended design details:
- use foreign keys
- indexes for performance
- enums where suitable
- check constraints
- unique constraints where needed
- timestamps in UTC
- soft delete only where useful
- RLS policies for all sensitive data
==================================================
21. REQUIRED UI SECTIONS
==================================================
Build these main pages:
Public / auth:
- login
- password reset
Private:
- dashboard
- league settings
- managers
- fantasy teams
- roster import page
- league players list
- player detail page
- formations settings
- matchdays list
- matchday detail
- lineup submission page
- own submissions history
- admin ratings/stats entry page
- calculations preview page
- published results page
- standings page
- audit log page
- overrides page
==================================================
22. UX REQUIREMENTS
==================================================
The UI must be premium, clean, and data-dense.
Requirements:
- dark mode by default
- elegant, modern visual design
- responsive layout
- desktop-first workflow
- sticky headers in large tables
- strong filtering and search
- clear status badges
- keyboard-friendly data entry
- bulk editing
- loading states
- empty states
- error states
- confirmation modals for destructive actions
- visual diff views for lineup history and score versioning
The admin panel must feel efficient for repetitive work.
==================================================
23. VALIDATION AND CORRECTNESS
==================================================
Implement validation at multiple layers:
- form validation
- server validation
- database constraints
- lineup compatibility validation
- import validation
- scoring input validation
Important examples:
- no duplicate player in same lineup
- lineup must satisfy selected formation slots
- role classification must exist for ambiguous role mappings
- no scoring publication if critical required data is missing
- matchday cannot be edited by managers after lock
- changes after publication must create new calculation versions, not silently overwrite history
==================================================
24. TESTING REQUIREMENTS
==================================================
Add meaningful tests, especially for:
- rating engine calculations
- missing source handling
- minutes factor logic
- ambiguous role classification logic
- lineup validation
- formation slot compatibility
- import validation
- audit log creation
- versioning behavior
Domain logic must be testable independently from UI.
==================================================
25. SEED DATA AND DEMO CONTENT
==================================================
Provide seed data for a realistic demo league.
Seed must include:
- one league
- multiple managers
- fantasy teams
- sample players with Mantra roles
- sample ambiguous E-role cases
- valid formations
- one or more matchdays
- sample lineup submissions
- sample ratings and player stats
- sample published calculations
- sample standings
- sample audit logs
==================================================
26. IMPORT AND EXPORT FILES
==================================================
Generate sample CSV templates for:
- manager/team import
- roster import
- matchday ratings import
- matchday stats import
The app must support export of:
- lineups
- calculations
- standings
- audit logs
- roster data
==================================================
27. README AND DOCUMENTATION
==================================================
Generate:
1. complete file tree
2. full source code
3. SQL migrations
4. seed script
5. README with local setup instructions
6. environment variables example
7. CSV templates
8. architecture explanation
9. scoring engine explanation
10. checklist of implemented features
11. clear notes about what is v1 and what is intentionally deferred
==================================================
28. NON-FUNCTIONAL REQUIREMENTS
==================================================
- type-safe end to end
- strong separation between UI, domain, and persistence
- maintainable codebase
- no dead code
- no unfinished TODO placeholders
- production-style error handling
- easy deployment
- clean architecture
- stable import workflow
- fast admin UX
==================================================
29. BUILD STRATEGY
==================================================
Work in this order:
1. architecture plan
2. database schema and migrations
3. auth and roles
4. league settings and ambiguous role mapping
5. roster import and league-scoped players
6. Mantra formation engine and slot compatibility model
7. lineup submission with full version history
8. admin ratings/stats entry UI
9. rating engine implementation
10. calculation preview and publication flow
11. standings
12. overrides
13. audit log viewer
14. polish, tests, README
After each major block:
- summarize what was completed
- explain important design decisions
- list what remains
==================================================
30. IMPORTANT IMPLEMENTATION RULES
==================================================
Never do any of the following:
- never replace the custom formulas with a simpler average
- never collapse Mantra roles into only 4 classic roles for lineup logic
- never create a huge unnecessary global Serie A player database in v1
- never hide the rating engine math
- never silently overwrite lineup history
- never silently overwrite published calculations
- never implement ambiguous role mapping as a hardcoded hidden assumption
- never ignore timestamps and auditability
- never build a fake prototype that cannot actually be used
==================================================
31. FINAL OUTPUT EXPECTATION
==================================================
Build this as a real usable product, not a mockup.
Start by:
1. proposing the full architecture
2. defining the database schema
3. defining the Mantra formation-slot model
4. defining the ambiguous role classification model
5. implementing the app step by step
6. generating all required files and code
Be rigorous, precise, and complete.
If a design decision is ambiguous, make the most robust assumption and document it clearly.
Prefer explicitness and maintainability over shortcuts.
When you finish, provide the final file tree first, then the code files in a logical order.
