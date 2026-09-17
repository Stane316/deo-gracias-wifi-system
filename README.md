

````markdown
# Déo Gracias — Wi-Fi Access & Payment System

> Digital system for managing Wi-Fi access, online payments, ticket inventory and MikroTik-based network operations for Déo Gracias.

---

## 1. Project Overview

**Déo Gracias Wi-Fi Access & Payment System** is a digital platform designed to modernize the operation of the Déo Gracias Wi-Fi Zone.

The system is intended to allow customers to:

- connect to the Déo Gracias Wi-Fi network;
- access the captive portal;
- select an available access plan;
- pay online;
- receive a valid Wi-Fi access ticket;
- use the ticket through the existing MikroTik HotSpot infrastructure.

The system also provides a private administration interface for managing:

- orders;
- payments;
- ticket inventory;
- digital and physical ticket batches;
- commercial plans;
- incidents;
- MikroTik/Connector synchronization;
- system monitoring;
- audit logs;
- operational settings.

The project is designed around the existing Déo Gracias network infrastructure rather than replacing it.

The existing MikroTik HotSpot, ticket mechanism and Mikmon workflow remain part of the system during the MVP.

---

# 2. Project Status

## Current status

**Architecture and specification phase: COMPLETED**

The project has gone through a structured documentation and validation process.

All ten project phases have been completed at the specification level and formally validated.

The project is now entering:

> **Implementation & Execution**

This means the repository currently contains the validated project documentation and is about to become the source repository for the actual implementation.

### Important distinction

The project is **not considered production-ready merely because the documentation has been validated**.

The following still have to be implemented and tested:

- frontend;
- backend;
- database;
- payment integration;
- ticket inventory management;
- Connector;
- MikroTik integration;
- administration dashboard;
- automated tests;
- deployment;
- monitoring;
- backup/restore procedures;
- production validation.

---

# 3. Project Phases

The project was designed through the following phases:

| Phase | Title | Status |
|---|---|---|
| Phase 0 | Project Framing | ✅ Validated |
| Phase 1 | Reverse Engineering | ✅ Validated |
| Phase 2 | Payment Study | ✅ Validated |
| Phase 3 | Target Architecture | ✅ Validated |
| Phase 4 | UX & Customer Journeys | ✅ Validated |
| Phase 5 | Data & Backend | ✅ Validated |
| Phase 6 | MikroTik Integration | ✅ Validated |
| Phase 7 | Web Application | ✅ Validated |
| Phase 8 | Admin Dashboard | ✅ Validated |
| Phase 9 | Security, Reliability & Testing | ✅ Validated |
| Phase 10 | Deployment & Operations | ✅ Validated |

The project is therefore no longer in the architecture-definition stage.

Implementation must now follow the decisions documented in these phases.

---

# 4. Documentation — Source of Truth

The `docs/` directory contains the validated specifications of the project.

```text
docs/
├── 01_PROJECT_FRAMING.md
├── 02_REVERSE_ENGINEERING.md
├── 03_PAYMENT_STUDY.md
├── 04_TARGET_ARCHITECTURE.md
├── 05_UX_CUSTOMER_JOURNEYS.md
├── 06_DATA_BACKEND.md
├── 07_MIKROTIK_INTEGRATION.md
├── 08_WEB_APPLICATION.md
├── 09_ADMIN_DASHBOARD.md
├── 10_SECURITY_RELIABILITY_TESTING.md
└── 11_DEPLOYMENT_OPERATIONS.md
````

## Reading order

An implementation agent MUST read the documentation in the following order before implementing substantial functionality:

```text
01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11
```

The documents are complementary.

A later document must not be interpreted independently from the earlier architecture decisions.

---

# 5. Documentation Responsibilities

## `01_PROJECT_FRAMING.md`

Defines the project context, objectives, scope, constraints and fundamental business problem.

---

## `02_REVERSE_ENGINEERING.md`

Documents the existing Déo Gracias infrastructure and operational reality.

This document is particularly important because the new system must integrate with an existing network rather than assume a greenfield environment.

---

## `03_PAYMENT_STUDY.md`

Documents the payment-provider research, payment requirements, constraints and decision framework.

The payment provider must not be assumed to be permanently fixed unless the documentation or project owner explicitly confirms the final production choice.

---

## `04_TARGET_ARCHITECTURE.md`

Defines the target system architecture and responsibilities of its major components.

This document is the principal architectural reference.

---

## `05_UX_CUSTOMER_JOURNEYS.md`

Defines the customer, payment and administrative journeys, including success, loading, failure and recovery states.

---

## `06_DATA_BACKEND.md`

Defines the data model, backend responsibilities, state machines, business rules, inventory logic, payment states and data integrity requirements.

---

## `07_MIKROTIK_INTEGRATION.md`

Defines how the system interacts with the existing MikroTik infrastructure.

It also defines the role of the local Connector and the boundaries between the cloud system and the local network.

---

## `08_WEB_APPLICATION.md`

Defines the public web application and customer-facing experience.

---

## `09_ADMIN_DASHBOARD.md`

Defines the private administrative application used to operate Déo Gracias digitally.

---

## `10_SECURITY_RELIABILITY_TESTING.md`

Defines security requirements, reliability requirements, testing strategy, failure scenarios, observability and recovery requirements.

---

## `11_DEPLOYMENT_OPERATIONS.md`

Defines deployment, production configuration, monitoring, backups, rollback, incident handling, maintenance and operational procedures.

---

# 6. Core Architectural Principle

The system is not a single application.

It is a coordinated system composed of several components:

```text
                         INTERNET
                            │
                            ▼
                ┌─────────────────────┐
                │   Public Web App    │
                │ Captive Portal / UI │
                └──────────┬──────────┘
                           │ HTTPS
                           ▼
                ┌─────────────────────┐
                │     Cloud Backend   │
                │ Business Logic / API│
                └──────┬───────┬──────┘
                       │       │
             ┌─────────┘       └──────────┐
             ▼                            ▼
      ┌──────────────┐             ┌──────────────┐
      │   Database   │             │    Payment   │
      │   Supabase   │             │   Provider   │
      └──────────────┘             └──────────────┘
                                          
                       HTTPS
                         │
                         ▼
                ┌─────────────────────┐
                │ Local Connector     │
                │ Déo Gracias LAN     │
                └──────────┬──────────┘
                           │
                    RouterOS API/API-SSL
                           │
                           ▼
                ┌─────────────────────┐
                │      MikroTik       │
                │ HotSpot / Network   │
                └─────────────────────┘
```

The exact hosting provider and final payment provider are deployment decisions and must not be invented by an implementation agent.

---

# 7. Responsibilities of Each Component

## Public Web Application

Responsible for:

* customer interface;
* plan presentation;
* order creation;
* payment initiation;
* payment status display;
* ticket display;
* responsive mobile-first experience;
* user feedback and recovery states.

The frontend is **not** the authority for:

* prices;
* payment confirmation;
* ticket validity;
* inventory allocation;
* authorization.

---

## Backend

The backend is responsible for business logic and security-sensitive operations.

It must control:

* commercial plans;
* prices;
* orders;
* payment state;
* ticket allocation;
* ticket inventory;
* batches;
* synchronization state;
* administrative authorization;
* audit events;
* incident state.

Client-side data must never be trusted for business-critical decisions.

---

## Database

The database is the persistent source of truth for application-level business state.

Important entities include concepts such as:

* plans;
* customers;
* tickets;
* ticket batches;
* orders;
* payments;
* payment events;
* audit logs;
* MikroTik synchronization records;
* incidents.

Database integrity must be enforced through appropriate constraints, transactions and state validation.

---

## Payment Provider

The payment provider is responsible for payment processing.

The backend must distinguish between:

```text
Payment initiation
        ↓
Payment pending
        ↓
Payment confirmation
        ↓
Ticket allocation
        ↓
Ticket delivery
```

A payment request being initiated does not mean that the payment is confirmed.

---

## Local Connector

The Connector is the controlled bridge between the cloud application and the local Déo Gracias network.

Its responsibility is to communicate with the MikroTik without exposing the MikroTik directly to the public Internet.

Target communication:

```text
Cloud Backend
      │
      │ HTTPS
      ▼
 Local Connector
      │
      │ RouterOS API/API-SSL
      ▼
 MikroTik
```

The Connector must use a dedicated technical MikroTik account.

The `admin` account must not be used by the application.

---

## MikroTik

The MikroTik remains responsible for network-level access enforcement.

It is not the business source of truth for:

* commercial pricing;
* customer orders;
* payment state;
* application inventory.

It remains the network authority for:

* HotSpot access;
* active sessions;
* network authentication;
* ticket enforcement;
* network configuration.

---

# 8. Existing Infrastructure

The project integrates with an existing Déo Gracias network.

The documented infrastructure includes:

* Huawei OptiXstar HG8145V6 GPON terminal/router;
* MikroTik RB951Ui-2HnD;
* RouterOS 6.49.17 stable;
* existing HotSpot;
* DHCP;
* DNS;
* NAT;
* firewall;
* existing ticket workflow;
* Mikmon Server.

The existing infrastructure must not be modified casually.

Before production changes:

1. configuration must be backed up;
2. configuration changes must be documented;
3. changes must be tested;
4. rollback must remain possible.

---

# 9. Ticket System

The MVP uses **pre-generated tickets**.

Mikmon remains the ticket-generation tool during the MVP.

The application does not need to replace Mikmon immediately.

The target workflow is:

```text
Mikmon
   ↓
Generate tickets
   ↓
Create/identify batch
   ↓
Import / associate with application
   ↓
Backend inventory
   ↓
Customer purchase
   ↓
Ticket allocation
   ↓
Ticket delivery
   ↓
Customer uses ticket through MikroTik HotSpot
```

Tickets must be separated by operational destination:

```text
DIGITAL
PHYSICAL
```

This distinction is important because a ticket allocated to online sales must not accidentally become part of the physical ticket inventory.

---

# 10. Ticket Inventory

The conceptual ticket lifecycle is:

```text
AVAILABLE
    ↓
RESERVED
    ↓
ASSIGNED
    ↓
DELIVERED
    ↓
USED
```

Other states may exist where required, such as:

```text
EXPIRED
CANCELLED
REFUNDED
```

The exact implementation must follow the state model defined in the data and security documentation.

Ticket allocation must be atomic and concurrency-safe.

Two customers must never receive the same ticket.

---

# 11. Ticket Batches

Ticket batches are a first-class business concept.

A batch should allow the system to distinguish at least:

* plan;
* quantity;
* destination;
* creation/import information;
* inventory state;
* operational status;
* timestamps.

Example:

```text
Batch #DG-2026-001
├── Plan: 100 FCFA / 5 hours
├── Quantity: 100
├── Destination: DIGITAL
└── Inventory:
    ├── Available
    ├── Reserved
    ├── Assigned
    └── Used
```

The backend must not blindly overwrite MikroTik comments because the existing MikroTik environment contains operational scripts and conventions.

---

# 12. Commercial Source of Truth

The commercial plans defined for Déo Gracias are application-level business data.

The backend/database must be the source of truth for:

* plan;
* price;
* duration;
* availability;
* display order.

The MikroTik configuration must be treated as a technical integration layer.

If a discrepancy exists between:

```text
Commercial plan
```

and:

```text
MikroTik profile
```

the discrepancy must be explicitly mapped and resolved.

It must never be silently ignored.

---

# 13. Payment Integrity

The payment system must be designed around the possibility of partial failure.

For example:

```text
Customer pays
      ↓
Payment confirmed
      ↓
Ticket allocation fails
```

The system must **not** require the customer to pay again.

Instead:

```text
Payment = recorded
Order = paid
Ticket allocation = incident / retry
```

This principle is mandatory.

The system must also handle:

* duplicate webhooks;
* delayed webhooks;
* rejected payments;
* cancelled payments;
* expired payments;
* replayed events;
* provider-side inconsistencies.

---

# 14. Security Principles

Security-sensitive operations must be performed server-side.

The implementation must include appropriate protection for:

* authentication;
* authorization;
* payment confirmation;
* webhook verification;
* idempotency;
* replay protection;
* rate limiting;
* ticket brute-force attempts;
* secrets;
* administrative access;
* audit logs;
* Connector authentication;
* MikroTik credentials.

Secrets must never be committed to Git.

Never place production credentials in:

* source code;
* frontend bundles;
* README files;
* documentation;
* Git history;
* screenshots;
* test fixtures.

Use environment variables or an appropriate secret-management mechanism.

---

# 15. MikroTik Security Boundary

The MikroTik must not be exposed directly to the public Internet for application communication.

The preferred architecture is:

```text
Internet
   X
   │
   └── No direct public MikroTik API
       
Cloud Backend
      ↓
   HTTPS
      ↓
Connector
      ↓
Local RouterOS API/API-SSL
      ↓
MikroTik
```

The Connector must use a dedicated technical account with the minimum permissions required.

The exact permissions must be verified through controlled testing.

---

# 16. RouterOS Compatibility

The existing MikroTik runs:

```text
RouterOS 6.49.17
```

Therefore the implementation must respect the capabilities and API model of RouterOS 6.x.

The integration must use the appropriate classic RouterOS API/API-SSL mechanism.

The implementation must not assume that RouterOS REST API is available.

Any RouterOS change must be tested against the actual hardware and software version.

---

# 17. Existing MikroTik Configuration

The following existing network components are considered sensitive and must not be replaced casually:

* HotSpot;
* DHCP;
* DNS;
* NAT;
* firewall;
* mangle;
* existing authentication;
* existing profiles;
* existing ticket mechanism;
* Mikmon workflow;
* existing On-Login script.

Existing behavior must be preserved unless a documented implementation decision explicitly requires a change.

---

# 18. Existing On-Login Logic

The existing MikroTik environment contains an On-Login script.

This script uses ticket/user comments and creates operational information related to ticket expiration.

Therefore:

> MikroTik comments must not be treated as an arbitrary metadata field.

Any modification of ticket comments must first be analyzed against the existing script behavior.

The implementation agent must not remove or rewrite this script without explicit authorization and a documented migration plan.

---

# 19. UX Principles

The customer experience must be:

* mobile-first;
* clear;
* responsive;
* accessible;
* fast;
* predictable;
* explicit about payment state;
* explicit about ticket state;
* resilient to network or provider failures.

The interface must explicitly support states such as:

```text
Loading
Loaded
Empty
Error
Success
Disabled
Offline
Pending
```

The visual system must prioritize:

```text
Clarity
    ↓
Hierarchy
    ↓
Consistency
    ↓
Interaction
    ↓
Motion
```

Motion and visual effects must serve the experience rather than obscure the task.

---

# 20. Administration

The private administration dashboard is a separate operational area.

It must provide appropriate management for:

* dashboard overview;
* orders;
* payments;
* tickets;
* ticket inventory;
* physical/digital distinction;
* ticket batches;
* commercial plans;
* incidents;
* Connector/system status;
* audit logs;
* settings.

Administrative actions must be authorized server-side.

An administrator must not be able to manually fabricate a successful payment state through an unsafe frontend-only action.

---

# 21. Observability

The production system must provide sufficient visibility to answer questions such as:

```text
Is the frontend available?
Is the backend available?
Is the database available?
Are payments working?
Are webhooks being received?
Is the Connector online?
Can the Connector reach MikroTik?
Is ticket inventory healthy?
Are incidents accumulating?
```

Health checks and operational logs must be implemented progressively during development.

---

# 22. Reliability

The system must assume that components can fail.

Important scenarios include:

* frontend unavailable;
* backend unavailable;
* database unavailable;
* payment provider unavailable;
* webhook delayed;
* webhook duplicated;
* Connector offline;
* MikroTik unavailable;
* ticket inventory exhausted;
* ticket allocation failure;
* customer payment confirmed but ticket delivery delayed.

The implementation must provide controlled recovery paths.

---

# 23. Backup & Recovery

Production backups must exist for critical application data and configuration.

The project must not rely on the assumption:

> "The server provider will handle everything."

Recovery procedures must be documented and tested.

A backup is not considered operationally valid until a restoration procedure has been verified.

---

# 24. Deployment Principles

Deployment must be controlled.

The target lifecycle is:

```text
Development
    ↓
Validation
    ↓
Staging
    ↓
Production
```

Production secrets must remain isolated from development.

Production deployment must include:

* build validation;
* tests;
* migration control;
* configuration validation;
* health checks;
* rollback strategy;
* post-deployment verification.

The project does not require a complex zero-downtime infrastructure for the MVP.

The priority is:

> controlled deployment + observability + fast recovery.

---

# 25. Technology Decisions

Some technology choices are already constrained by the project context, while others remain open.

### Current implementation direction

* **Development environment:** VS Code
* **Source control:** Git + GitHub
* **Database/backend platform:** Supabase is the intended database platform unless a documented architectural decision changes this.
* **Frontend:** to be implemented according to the validated web application specification.
* **Backend:** to be implemented according to the validated backend architecture.
* **MikroTik integration:** local Connector + RouterOS API/API-SSL.
* **Payment:** provider selected according to the validated payment study and final onboarding conditions.
* **Deployment:** provider to be selected during implementation/deployment according to the requirements defined in the deployment documentation.

### Important

An implementation agent must not invent a technology merely because it is familiar with it.

Every major technology decision must be:

1. supported by the documentation;
2. compatible with the existing architecture;
3. justified if it changes an existing decision;
4. documented before being introduced.

---

# 26. Development Philosophy

This project follows a documentation-first engineering approach.

The expected sequence is:

```text
Understand
   ↓
Inspect documentation
   ↓
Inspect repository
   ↓
Plan
   ↓
Implement
   ↓
Test
   ↓
Verify
   ↓
Document
   ↓
Commit
```

Do not begin by writing large amounts of code.

Do not implement the entire system in one step.

---

# 27. Implementation Rules for AI Agents

Any AI development agent working on this repository must follow these rules.

## Rule 1 — Read before coding

Before implementing a feature, read the relevant project documentation.

For the initial project onboarding, read all documents:

```text
docs/01_PROJECT_FRAMING.md
docs/02_REVERSE_ENGINEERING.md
docs/03_PAYMENT_STUDY.md
docs/04_TARGET_ARCHITECTURE.md
docs/05_UX_CUSTOMER_JOURNEYS.md
docs/06_DATA_BACKEND.md
docs/07_MIKROTIK_INTEGRATION.md
docs/08_WEB_APPLICATION.md
docs/09_ADMIN_DASHBOARD.md
docs/10_SECURITY_RELIABILITY_TESTING.md
docs/11_DEPLOYMENT_OPERATIONS.md
```

---

## Rule 2 — Documentation is the primary specification

The agent must treat the validated project documentation as the primary specification.

If the implementation agent discovers a contradiction:

```text
DO NOT silently choose one side.
```

Instead:

1. identify the contradiction;
2. explain it;
3. determine whether it is an implementation detail or architectural decision;
4. propose the smallest necessary resolution;
5. wait for confirmation when the decision materially changes the architecture.

---

## Rule 3 — Do not invent requirements

Do not add features simply because they are technically interesting.

Examples:

```text
No unnecessary microservices.
No unnecessary AI.
No unnecessary payment providers.
No unnecessary real-time infrastructure.
No unnecessary RADIUS migration.
No unnecessary redesign of MikroTik.
No unnecessary SaaS abstraction.
```

The goal is to implement the defined system correctly.

---

## Rule 4 — Preserve existing infrastructure

The existing Déo Gracias network is a real operational environment.

Do not modify the MikroTik configuration blindly.

Any potentially disruptive change must have:

* reason;
* backup;
* test;
* rollback plan.

---

## Rule 5 — Security before convenience

Never bypass:

* authentication;
* authorization;
* webhook verification;
* server-side validation;
* inventory locking;
* payment state validation;
* secret management.

A shortcut that compromises security is not an acceptable implementation shortcut.

---

## Rule 6 — Backend authority

The frontend must never become the authority for:

* price;
* payment confirmation;
* ticket validity;
* ticket allocation;
* administrative authorization.

Those decisions belong to trusted server-side components.

---

## Rule 7 — Test each critical state transition

Critical business flows must be tested.

Examples:

```text
Order creation
Payment pending
Payment success
Payment failure
Webhook duplication
Ticket reservation
Ticket allocation
Ticket delivery
Inventory exhaustion
Connector unavailable
MikroTik unavailable
Payment confirmed + allocation failure
```

---

## Rule 8 — Keep changes reviewable

Prefer small, coherent implementation steps.

Each implementation phase should produce a clear result that can be inspected and tested.

Avoid massive commits containing unrelated changes.

---

# 28. Git Workflow

The repository uses Git as the history of the engineering process.

Recommended structure:

```text
main
  │
  ├── feature/...
  ├── fix/...
  └── chore/...
```

`main` must represent a stable state.

Changes should be:

* focused;
* tested;
* documented when relevant;
* committed with meaningful messages.

Example:

```text
feat: add plan catalog API
feat: implement ticket inventory allocation
fix: prevent duplicate ticket allocation
test: add payment webhook idempotency tests
chore: configure Supabase migrations
docs: update deployment procedure
```

---

# 29. Suggested Development Workflow

The implementation should progressively transform the repository.

A typical implementation sequence is:

```text
1. Repository foundation
        ↓
2. Application structure
        ↓
3. Database / Supabase
        ↓
4. Backend foundation
        ↓
5. Business models and state machines
        ↓
6. Authentication / authorization
        ↓
7. Public web application
        ↓
8. Payment integration
        ↓
9. Ticket inventory
        ↓
10. Admin dashboard
        ↓
11. Connector
        ↓
12. MikroTik integration
        ↓
13. Security hardening
        ↓
14. Automated testing
        ↓
15. Deployment
        ↓
16. Production validation
```

The exact sequencing may be refined during implementation if the change is technically justified and does not contradict the validated architecture.

---

# 30. Definition of Done

A feature is not considered complete simply because it works in the developer's browser.

A feature should be considered complete only when the relevant requirements are satisfied:

```text
Implementation
      +
Validation
      +
Testing
      +
Security
      +
Error handling
      +
Documentation
```

For production-critical features, operational considerations must also be included:

```text
Monitoring
      +
Recovery
      +
Rollback
```

---

# 31. What the Agent Must Never Do

The implementation agent must never:

* commit secrets;
* expose MikroTik credentials;
* expose payment credentials;
* expose production environment variables;
* trust frontend payment confirmation;
* manually mark payments as successful through unsafe client-side logic;
* allocate tickets without concurrency protection;
* expose MikroTik directly to the Internet;
* replace the existing HotSpot without authorization;
* delete existing MikroTik scripts without analysis;
* overwrite ticket comments blindly;
* silently change commercial pricing;
* silently change the architecture;
* introduce unnecessary infrastructure;
* declare the system production-ready without running the required validation.

---

# 32. Current Repository Intent

This repository has two roles.

## 1. Engineering repository

It will contain:

* application source code;
* tests;
* configuration;
* database migrations;
* Connector;
* deployment configuration;
* operational tooling.

## 2. Engineering record

It also preserves:

* project decisions;
* architecture;
* security requirements;
* operational procedures;
* implementation history.

The repository should therefore remain understandable to someone who did not participate in the initial development.

---

# 33. Expected Repository Evolution

Initial state:

```text
deo-gracias-wifi-system/
│
├── README.md
├── .gitignore
│
└── docs/
    ├── 01_PROJECT_FRAMING.md
    ├── 02_REVERSE_ENGINEERING.md
    ├── 03_PAYMENT_STUDY.md
    ├── 04_TARGET_ARCHITECTURE.md
    ├── 05_UX_CUSTOMER_JOURNEYS.md
    ├── 06_DATA_BACKEND.md
    ├── 07_MIKROTIK_INTEGRATION.md
    ├── 08_WEB_APPLICATION.md
    ├── 09_ADMIN_DASHBOARD.md
    ├── 10_SECURITY_RELIABILITY_TESTING.md
    └── 11_DEPLOYMENT_OPERATIONS.md
```

During implementation, application directories will be added according to the architecture actually selected and documented.

The final repository structure must emerge from the validated architecture rather than from an arbitrary template.

---

# 34. Project Maturity Model

The project should be considered to move through the following states:

```text
SPECIFICATION
    ↓
IMPLEMENTATION
    ↓
LOCAL VALIDATION
    ↓
INTEGRATION VALIDATION
    ↓
STAGING
    ↓
PRODUCTION
    ↓
OPERATIONS
```

Current state:

```text
SPECIFICATION
      ✅
      ↓
IMPLEMENTATION
      ← CURRENT STAGE
```

---

# 35. Final Principle

The purpose of this project is not simply to create a web page where customers can pay.

The objective is to build a coherent digital system connecting:

```text
Customer
   ↓
Digital Experience
   ↓
Order
   ↓
Payment
   ↓
Ticket Inventory
   ↓
Ticket Delivery
   ↓
MikroTik
   ↓
Wi-Fi Access
```

while giving Déo Gracias an operational layer for:

```text
Administration
   ↓
Monitoring
   ↓
Inventory
   ↓
Payments
   ↓
Incidents
   ↓
Operations
```

The system must therefore be implemented as an engineered product, not as a collection of disconnected features.

---

# 36. First Instruction to an Implementation Agent

Before writing application code:

1. Read this README completely.
2. Read all eleven documents in `docs/`.
3. Build a mental model of the existing infrastructure and target architecture.
4. Identify dependencies between the specifications.
5. Inspect the current repository.
6. Report your understanding of the project.
7. Identify any genuine contradictions or missing implementation decisions.
8. Propose the first implementation step.
9. Wait for approval before starting the next major implementation step.

**Do not skip the documentation review.**

The documentation already represents the result of the project's architecture and specification phases.

The implementation phase begins from this baseline.

````

---

