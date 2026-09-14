B — BLOCKER

Concrete reproducible counterexample: `verifiedCreateAcknowledgement()` validates catalogId, document id/equivalence, mutationId, revision `1`, and `archivedAt === null`, but it does **not validate the Create origin** (`src/vnext/library/service.ts:215-237`).

Reproduction:

1. First Create returns `AMBIGUOUS_COMMIT_OUTCOME`.
2. Pending attempt has `origin === undefined`.
3. Authoritative GET returns an otherwise exact envelope—same catalog/document/mutation, revision 1, unarchived—but with an unexpected valid `origin`.
4. `parsePersistenceEnvelope()` accepts that origin.
5. `verifiedCreateAcknowledgement()` returns success and clears `pendingCreate`.

Therefore a divergent GET/ACK can be accepted despite not proving the exact logical Create request. This fails questions **5 and 6** and violates the attempt identity contract in question **1**.

The remaining inspected paths—same C1/M1 replay after NOT\_FOUND, transport-unavailable preservation, authority isolation, Father UI projection, and controlled browser replay proof—are consistent with the amendment.