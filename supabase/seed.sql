-- Seed rows: the first version's items, so the demo starts from the same shelf.
-- Run after schema.sql. Uncounted rows start as Out (0).
insert into items (id, name, category, unit, qty) values
('egg','Eggs','Dairy & Eggs','eggs',0),
('milk','Milk','Dairy & Eggs','jugs',1),
('banana','Banana','Produce','bananas',0),
('canned-bean','Canned Beans','Canned','cans',0),
('rice','Rice','Grains & Pasta','bags',0),
('cereal','Cereal','Grains & Pasta','boxes',3),
('peanut-butter','Peanut Butter','Protein','jars',8)
on conflict (id) do nothing;
