# Working on Shelfwear

Shelfwear is playful, but it should still sound like someone who knows exactly what the Steam data can show. Keep the personality; do not turn it into generic “cozy app” copy.

## Writing voice

- Match the existing voice before rewriting anything.
- Keep useful quirks, contractions and short sentences when they fit.
- Remove padded intros, obvious transitions and repeated explanations.
- Replace vague adjectives with the actual thing the feature does.
- Do not manufacture jokes, cuteness, enthusiasm or sentiment that was not already there.
- Avoid stock product language such as “seamless”, “robust”, “comprehensive”, “unlock”, “empower”, “leveraging” and “designed to” unless it is the clearest option.
- Never invent Steam data, usage statistics, user reactions, personality claims or community consensus.

The goal is not perfect polish. The copy should feel deliberate and specific to Shelfwear.

## Data boundaries

Local Steam files and public-profile data expose different fields. Keep that distinction explicit instead of filling gaps with guesses.

The familiar can describe observable library/playtime patterns, not the person behind the account. Synthetic sample data must stay clearly labeled. Public-profile sharing stays stateless unless a future product decision changes that.

## UI fit

Cards, share builders and analytics panels should handle long game titles without pushing buttons outside their containers. Artwork should use contained, centered sizing before cropping. Dense controls should wrap cleanly at narrow widths.

## Verification

Run the existing tests/build for code changes. For visual changes, inspect both desktop and mobile widths and verify exported cards still render at the intended size.