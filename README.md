# लोकसेवा | Lokseva

## Try the application

Sign in with **officer** and **Kenpath2026!**. Each browser profile gets its own sample queue. Use fictional remarks when exploring.

1. Open **INC-2026-0418**. Inspect the missing income proof and ask the assistant what needs attention. Return the case with a specific reason.
2. Open the returned case. Record a corrected submission, mark the supplied document and review the evidence again.
3. For a decision-ready file, open **INC-2026-0421**. Compare the declared amount with the scrutiny figure, inspect the history, and record your own reason before deciding.

## Run locally

Install Node.js 22.13 or newer, extract or clone this repository, and run these commands at its root. No npm install or external service is required.

```sh
node server.mjs
```

Open http://127.0.0.1:3000 and use the reviewer credentials above. The first login creates eleven synthetic cases. Local data persists in `data/lokseva.sqlite`. A new browser profile creates a fresh queue.

```sh
node --test tests/assist.test.mjs workflow.test.mjs
node scripts/build.mjs
```

## Technical decisions

For a hosted review on Render, create a Blueprint from this repository. The included `render.yaml` selects the free Node web service and runs the tests before starting it. Free instances can sleep and reset their local database on restart or redeploy. Sample cases are recreated on login. Use persistent storage for longer-term use.

The mobile-friendly client is plain HTML, CSS and JavaScript. The same request handler runs in a hosted Worker with D1 and on local Node with SQLite. An atomic write stores the new status, reason and history together. The server compares record versions to prevent a stale browser tab from overwriting another decision. Hashed session tokens and HTTP-only cookies isolate one reviewer's sample queue from another. Desk names identify simulated workflow responsibilities. Deployment for a real office would require individual staff identities, role enforcement, authenticated document storage and an independently retained audit log.

For a Node host, use a persistent volume for `DB_FILE`, set `HOST=0.0.0.0`, `PORT` to the listening port and `PUBLIC_ORIGIN` to the external HTTPS origin. For the Worker target, bind D1 as `DB` and build with `node scripts/build.mjs`. The output is `dist/server/index.js`.

A Marathi officer workbench for income-certificate applications in Satara, Maharashtra. This assessment uses fictional applicants and evidence extracts. It starts after a citizen has filed an application.

## Why this service

A certificate request can reach an officer with evidence from several sources. A salary document, a self-declaration and a land-income report answer different questions. When the file moves to another desk, the next officer needs to see which evidence was reviewed, what still needs checking and how much time remains. The dashboard brings the oldest deadlines into view. The case file keeps evidence, remarks and the decision together.

## Workflow and scope

| Desk | Officer's task | Assistance |
| --- | --- | --- |
| तहसील लिपिक · Intake | Inspect identity, address, declaration and income evidence. Record missing items and return the file for correction, or forward it. | Identify missing items and retrieve a verification question relevant to the declared income source. |
| अव्वल कारकून · Scrutiny | Check the declaration against supporting evidence and record findings. Agricultural evidence can include a Talathi report. | Surface differences in recorded amounts and suggest a question about the evidence. |
| नायब तहसीलदार · Decision | Read earlier remarks and evidence. Record an approval, rejection or request for correction. | Retrieve evidence-specific checks for the final review. The officer chooses the outcome. |

Maharashtra's procedure identifies these three desks and permits a correction request with remarks. Satara lists the service period as 15 days and gives examples of acceptable income documents. The prototype models desk processing. Certificate signing, citizen uploads, fee collection and appeals belong to the external service. The single reviewer login lets a hiring reviewer exercise all three desks. The published workflow and checklist informed the design. Field workers have yet to validate it.

[State Revenue Department procedure (PDF)](https://aaplesarkar.mahaonline.gov.in/pdf/Fees%2C%20Procedure%2C%20Checklist_Income%20Certificate.pdf) · [Satara district checklist](https://www.satara.gov.in/en/service/income-certificate/)

## Where AI helps and why

A clerk reviewing farm income needs a different question from one reviewing a salary. At intake, the assistant uses the income description to suggest what evidence to look for. During scrutiny, it suggests what to verify against the declaration. At final review, it surfaces a question the officer can check against the case history before recording a decision. The officer interprets the evidence, writes the reason and chooses whether to approve, reject or return the application.

The local retrieval model compares Marathi text against labeled synthetic examples for five income sources. Character trigrams and words support partial matches. Inverse-document-frequency weights make distinctive terms more influential. Cosine similarity selects relevant examples. A weak match produces no source-specific prompt. The app separately checks structured amounts and missing documents. This approach keeps sample case data local to the application server, works without an API key and makes it possible to trace a suggestion to its input. Dialect, negation, mixed income and unseen sources can change the meaning. Officers read the evidence before acting. The regression fixtures establish expected behavior on development examples. They do not establish field accuracy.

## How to measure impact

Pilot with a clerk, a scrutiny officer and a designated officer using de-identified historical files. Randomize the order of matched cases between the current process and this workbench. Include agricultural, salary and mixed-income files as well as incomplete files. Record active handling time separately from calendar time awaiting a citizen's response.

| Measure | Calculation | Why it matters |
| --- | --- | --- |
| Handling time | Median and 90th percentile from opening a file to recording a desk action | A single case view should shorten evidence lookup and handoff. |
| Repeat returns | Returned cases requiring another correction / all returned cases | Specific reasons should help applicants correct a file in one visit. |
| Timely disposal | Cases decided within the notified period / cases due during the pilot, including pending overdue cases | Priority ordering should make approaching deadlines visible. |
| Evidence quality | Independent second reviewer scores a sample for unsupported findings and missed evidence | Faster processing should preserve decision quality. |
| Assistance relevance | Officers rate suggestions against the actual record and log irrelevant prompts and missed issues | Tests whether retrieval helps workers across income types and language variants. |

Compare results by desk, case type and phone versus desktop. Look at the individual cases behind slow or incorrect decisions before expanding the pilot. No impact measurements have been collected yet.
