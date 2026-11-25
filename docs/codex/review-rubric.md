# Review Rubric

## P0 — Stop Immediately

- A client secret, cloud credential, or privileged token reaches the browser or repository.
- A UI action bypasses API authorization or can mutate another scope unintentionally.

## P1 — Must Fix Before Merge

- Global catalog data is incorrectly owned or filtered by an application.
- Application-scoped advertising, campaign, brand, market, or audit data crosses applications.
- Numeric-looking platform identifiers are converted to numbers.
- Upload retries, cancellation, processing state, or destructive actions can corrupt operator intent.

## P2 — Fix or Record Explicitly

- Long episode lists become unusable or lose stable item identity.
- Form controls use free text where the domain has a closed option set.
- Loading, empty, error, localization, keyboard, or responsive states are missing.
- Contract changes lack coordinated API evidence.

## P3 — Maintainability

- Ant Design patterns or existing component boundaries are bypassed without reason.
- Tests assert implementation details instead of operator behavior.
