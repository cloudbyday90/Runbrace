# Draft matching contracts

**Status:** Proposed under 0018 (design reference omitted from this limited snapshot); no runtime matcher or configuration activation implemented.  
**Updated:** 2026-11-09.

| Artifact | Purpose |
| --- | --- |
| [Rule-set schema](rule-set-v1.schema.json) | Bounded exact/set/presence profile with explicit source/name/state scopes |
| [Example rules](examples/rules.json) | Synthetic recipients and overlapping/unknown/native-code/generation-specific rules |
| [Candidate cases](examples/cases.json) | Complete condition candidates and expected rule/destination sets or invalid-input outcome |
| [Decision schema](decision-v1.schema.json) | Complete journal detail for matched/unrouted outcomes, not an evaluation-error disguise |
| [Matched decision](examples/decision-matched.json) / [unrouted decision](examples/decision-unrouted.json) | Example rule-artifact digests and complete contributing rule IDs |
| Matching architecture (design reference omitted from this limited snapshot) | Semantics, typed fields, activation, union, snapshots, errors, and boundaries |
| Validation plan (design reference omitted from this limited snapshot) | Planned runtime tests and separate artifact evidence |

## Rule semantics

`matching_profile: exact_sets_v1` requires membership in each rule's nonempty source-instance, condition-name, and condition-state sets. Optional `when.any` ORs alternatives; every nonempty `all` list ANDs its predicates. With `when` absent, only the mandatory scopes apply. Rule order and IDs imply no priority. Disabled rules cannot match.

`eq` has one string `value`; `in` has nonempty unique string `values`; `exists` has a Boolean `value` and only targets optional native state/code. Required selector values receive additional semantic typing checks: generation UUIDv7, registered lowercase service/kind, and the severity enum. Native strings remain exact and bounded. Selectors are enum tokens, not arbitrary paths. No implicit negation, regex, wildcard, numerical threshold, message/attribute matching, or bare native-resource-ID lookup is specified.

Schema validation checks structure. Activation additionally checks reference authority/existence, unique rule IDs, typed values, contradictory conjunctions, artifact byte/destination limits, and immutable ID/revision/digest binding. `uniqueItems` does not enforce rule-ID uniqueness across different rule objects. All referenced destinations, including disabled-rule references, count toward the pilot's eight-destination artifact cap.

## Result and provenance

All matching rules contribute their destination IDs; select their unique union. One destination gets one handoff even if several rules selected it. The decision records all matched rules and each destination's contributors. No rule can override transport, mutate the condition, or derive a URL/credential/workflow from source text.

The decision schema validates trusted journal details; the existing journal supplies the typed event subject. `event.matched` and `event.unrouted` commit with new events/links/intents. Empty match sets are valid only after successful evaluation. Invalid input/configuration/evaluation instead parks/quarantines receipt processing without creating an event decision that claims successful no-match. Publisher/application checks ensure sorted IDs, exact destination uniqueness, complete contributor correspondence, matching artifact identity, and delivery snapshot agreement.

The example digest is computed from the example rule file's exact bytes. It is neither a runtime activation record nor a compiled implementation digest. Synthetic candidates vary schema-valid fields to probe the interface; they are not all outputs supported by a particular vendor mapper. The three invalid candidate cases deliberately fail the common condition contract. All recipients are fictional IDs without URLs/credentials or live workflow bindings.

## Existing boundaries

Matching consumes complete validated candidates and trusted source membership. Rejected/quarantined/ignored input has no candidate here. Unknown is an explicit condition state; absence of a native code is not null or an evaluator error. Optional null/wrong-type fields are invalid under the current common schema. Destination disablement, retired-generation send gates, field-export authorization, loop prevention, acceptance, and transport retries remain separate controls.

Mappings are pinned at intake; matching captures one immutable snapshot during first publication preparation. A duplicate or already published event retains its original body/routes/decision, including zero-match. New configuration does not reprocess history. Multi-process activation/cutover and destination lifecycle remain separate design work before live support. Detailed research and limits (design reference omitted from this limited snapshot) and validation (design reference omitted from this limited snapshot) distinguish artifact checks from implementation proof.

