// Slugs are computed on the fly from a name (no stored `slug` field on clubs/teams) — deterministic,
// so the same name always produces the same URL.
export const slugify = (str) =>
    (str || '')
        .toLowerCase()
        .replace(/['"‘’“”]/g, '')
        .replace(/[^a-z0-9\s-]/gi, ' ')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');

// Matches by slug first, falling back to raw id — a safety net in case two names ever produce the
// same slug, without requiring a stored/unique slug field.
export const findBySlugOrId = (items, slugOrId) =>
    items.find(i => i.id === slugOrId) || items.find(i => slugify(i.name) === slugOrId);
