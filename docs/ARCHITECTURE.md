# Architecture

The key boundary is the restaurant’s commitment. A guest message or model proposal cannot authorize a kitchen handoff. Every change must stay attached to its source and version.

The front desk runs on localhost port 4330. It serves a small browser interface and accepts bounded local requests. The earlier Evidence Inbox release is separate and is not a dependency. This document describes the v2 event release. Its 90 focused tests and local browser journey verified the boundaries below, including a real server restart.

`front-desk.mjs` owns the authored facts and versioned case state. Quantities and prices are calculated with integers. A quote binds the request and current facts. Operator approval binds that quote. Simulated kitchen receipts bind the approved version and each separate pull. A change retains the earlier commitment while invalidating current approval.

An operator correction carries a restaurant, date, source and review record. Fact retrieval applies it only inside that scope. The original policy remains visible. A rule that permits pickup does not supply the guest’s agreement to change a delivery request.

`front-desk-corrections.mjs` stores only reviewed synthetic corrections in a bounded local JSON file. The default is `.local-state/operator-corrections.json`, excluded from version control. Local launch configuration can set `FRONT_DESK_CORRECTIONS_FILE` to an absolute JSON path outside `public` and `fixtures`. There is no browser reset route. A stopped demonstration can be restarted with a fresh file path when a clean rule set is intended.

The storage adapter validates scope and schema, checks for changes by another writer and replaces the file after a guarded save. Invalid state or a failed save stops the affected operation. It does not silently reset corrections. Restart creates fresh case state and reloads the corrections. Messages, proposals, approvals and simulated receipts remain session state. This is narrow local persistence, not model training, a production database or durable customer history.

The new pickup evaluation loaded the correction through fresh storage and store instances before inference. Independent review then reopened the same file in a separate Node process and confirmed that the rule applied only to the intended restaurant and date. A later browser check stopped the actual server, started a new process with the same file, and observed one correction loaded after refresh. Cases, quotes, approvals and receipts reset. Another restaurant and the next day were unaffected.

`front-desk-meta.mjs` describes two read only functions to Muse Spark 1.3: retrieve restaurant facts and check item quantities. The application executes those functions. The model returns a structured proposal. It cannot call the restaurant approval, dispatch, cancellation or remedy actions. Tool arguments, source references and loop bounds are checked locally.

For new v2 calls, `frontDeskModelInput` selects exactly four fields: `synthetic`, `restaurantId`, `demoNow` and `message`. A `scenarioId` remains in the local trace packet but is removed from the transported guest input. Expectations, setup instructions and evaluation labels are never added to that input. The original ten saved calls retain their original five field inputs, including scenario IDs. Historical evidence is not rewritten to resemble the new protocol.

New model runs require a separate authorized runner and budget. They are not available through the default browser server. The adapter uses `store:false` and retains encrypted reasoning only for the bounded tool conversation. It does not publish credentials or reasoning in a public replay.

A trusted recorded review provider may load a pinned synthetic response. The browser selects its identifier. It cannot submit a replacement review and label it verified. Human adoption creates a new request version. Price, timing, capacity and kitchen acknowledgment remain separate decisions.

The v2 source trail retains the exact recorded guest input, review and response references, original proposal and input digest beside the authored starter conversation. Focused tests and browser review verified that the exact source was displayed before adoption and appended to history afterward. The shorter starter conversation remained separately labeled. A digest demonstrates local integrity, not independent provider attestation.

The app has no general editor for completing missing proposal fields. Such proposals remain blocked from adoption. The supported authored clarification actions operate on an adopted request and must not be described as a general model output repair feature.

Reply editing is a separate verified path. Browser review saved corrected wording separately from the original model reply, with an operator record and unsent status. These edits remain session state. Saving a draft does not route or send a message. In the new delivery example, adoption preserved requested delivery and the restored rule blocked quoting. Only explicit authored guest consent switched the request to pickup and produced a new version.

The runtime uses Node built in modules and browser APIs. No dependency installation is required. Tests use local servers and mocked model transports. Source reference checks and passing tests do not prove the model’s interpretation or real restaurant outcomes.
