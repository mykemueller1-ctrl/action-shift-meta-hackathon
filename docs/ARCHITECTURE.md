# Architecture

The front desk runs on localhost port 4330. It serves a small browser interface and accepts only bounded local requests. The earlier Evidence Inbox release is separate and is not a dependency of this package.

`front-desk.mjs` owns the authored facts and versioned case state. Quantities and prices are calculated with integers. A quote binds the request and current facts. Operator approval binds that quote. Simulated kitchen receipts bind the approved version and each separate pull. A change retains the earlier commitment while invalidating current approval.

An operator correction carries a restaurant, date, source and review record. Fact retrieval applies it only inside that scope. The original policy remains visible. Case state and corrections last for the current server process only.

`front-desk-meta.mjs` describes two read only functions to Muse Spark 1.3: retrieve restaurant facts and check item quantities. The application executes those functions. The model returns a structured proposal. It cannot call the restaurant approval, dispatch, cancellation or remedy actions. Tool arguments, source references and loop bounds are checked locally.

New model runs require a separate authorized runner and budget. They are not available through the default browser server. The adapter uses `store:false` and retains encrypted reasoning only for the bounded tool conversation. It does not publish credentials or reasoning in a public replay.

A trusted recorded review provider may load a pinned synthetic response. The browser selects its identifier. It cannot submit a replacement review and label it verified. Human adoption creates a new request version. Price, timing, capacity and kitchen acknowledgment remain separate decisions.

The runtime uses Node built in modules and browser APIs. No dependency installation is required. Tests use local servers and mocked model transports. Source reference checks and passing tests do not prove the model’s interpretation or real restaurant outcomes.
