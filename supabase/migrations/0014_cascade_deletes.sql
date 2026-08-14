-- Jolt — let deleting a user cascade through their history.
--
-- Several foreign keys were missing ON DELETE CASCADE, so removing a user from
-- Supabase Auth (which cascades into profiles) failed with a foreign key
-- violation once they had any requests, ratings, or ledger rows. Fine for the
-- current test phase — production will likely want soft-deletes/anonymisation
-- instead of hard deletes, but for now this unblocks cleaning up test users.

alter table requests drop constraint if exists requests_customer_id_fkey;
alter table requests add constraint requests_customer_id_fkey
  foreign key (customer_id) references profiles(id) on delete cascade;

alter table requests drop constraint if exists requests_provider_id_fkey;
alter table requests add constraint requests_provider_id_fkey
  foreign key (provider_id) references provider_profiles(id) on delete cascade;

alter table ratings drop constraint if exists ratings_rater_id_fkey;
alter table ratings add constraint ratings_rater_id_fkey
  foreign key (rater_id) references profiles(id) on delete cascade;

alter table ratings drop constraint if exists ratings_ratee_id_fkey;
alter table ratings add constraint ratings_ratee_id_fkey
  foreign key (ratee_id) references profiles(id) on delete cascade;

alter table commission_ledger drop constraint if exists commission_ledger_request_id_fkey;
alter table commission_ledger add constraint commission_ledger_request_id_fkey
  foreign key (request_id) references requests(id) on delete cascade;
