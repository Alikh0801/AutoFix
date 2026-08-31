-- Jolt — "Digər" is no longer a selectable provider skill.
--
-- It's the customer's catch-all for a problem that doesn't fit the other
-- categories, not a piece of equipment a provider can claim to carry, so the
-- provider "Xidmət növlərim" screen no longer lists it. Drop any rows already
-- stored: without this, a provider who had it switched on would keep the skill
-- forever with no way to see or turn it off, and would keep receiving those
-- requests while nobody else could.
--
-- NOTE: no provider can hold this skill any more, and provider_feed only shows
-- a request whose category matches one of the caller's skills — so 'Digər'
-- requests reach nobody. Either hide that category from customers too, or make
-- it visible to every provider regardless of skills.

delete from provider_skills where category_id = 'other';
