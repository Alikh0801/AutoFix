-- Jolt — "Digər" is no longer a selectable provider skill.
--
-- It's the customer's catch-all for a problem that doesn't fit the other
-- categories, not a piece of equipment a provider can claim to carry, so the
-- provider "Xidmət növlərim" screen no longer lists it. Drop any rows already
-- stored: without this, a provider who had it switched on would keep the skill
-- forever with no way to see or turn it off, and would keep receiving those
-- requests while nobody else could.
--
-- The customer keeps the category — it's their escape hatch when nothing else
-- fits. Since no provider can hold the matching skill any more, 0024 exempts
-- 'other' from provider_feed's skill matching so every provider sees it.

delete from provider_skills where category_id = 'other';
