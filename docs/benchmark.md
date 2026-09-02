# dbtruth benchmark, 2026-09-02

Structural numbers come from the tool's own measurements driven by the schema (every declared foreign key,
every table, every categorical text column), with no model involved. Stale means the newest timestamp is
older than the configured 90 days, which every frozen sample dataset is.

| schema | relations | columns | declared FKs | FKs below 100% | tables without PK | value collisions | empty tables | stale tables | db time |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| chinook | 11 t | 64 | 11 (11 measured) | 0 | 0 | 0 | 0 | 2 | 0.3s |
| northwind | 14 t | 92 | 13 (11 measured) | 0 | 0 | 0 | 2 | 2 | 0.2s |
| sakila | 21 t, 7 v | 165 | 40 (21 measured) | 0 | 6 | 0 | 6 | 15 | 2.4s |
| pagila | 15 t, 7 v, 1 mv, 1 part. | 135 | 18 (17 measured) | 0 | 0 | 0 | 1 | 0 | 7.9s |
| gitea | 116 t | 1072 | 0 (0 measured) | 0 | 0 | 0 | 113 | 0 | 0.6s |
| discourse | 365 t, 1 v | 3370 | 29 (0 measured) | 0 | 19 | 0 | 364 | 0 | 7.7s |
| mastodon | 118 t, 1 v, 1 mv | 1023 | 156 (0 measured) | 0 | 0 | 0 | 117 | 0 | 4.7s |
| metabase | 158 t, 18 v | 1765 | 196 (44 measured) | 0 | 3 | 0 | 119 | 0 | 5.5s |

One full run each with the model, at the effort the schema size selects.

| schema | effort | time | tokens in / out | cost | exit | broken joins (model) | confirmed suspicions (model) | unverifiable | files |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| chinook | low | 52s | 25626 / 6036 | $0.11 | 0 | 0 | 0 | 2 | 13 |
| northwind | low | 63s | 33785 / 7679 | $0.14 | 2 | 0 | 2 | 4 | 16 |
| sakila | medium | 103s | 47765 / 12827 | $0.22 | 2 | 0 | 2 | 3 | 30 |
| pagila | low | 81s | 45826 / 9071 | $0.18 | 2 | 0 | 1 | 5 | 25 |
| gitea | high | 355s | 0 / 0 | $0.00 | 1 (error) | 0 | 0 | 0 | 0 |
| discourse | high | 9s | 0 / 0 | $0.00 | 1 (error) | 0 | 0 | 0 | 0 |

## Details

### chinook

- Stale tables: 2, oldest newest-timestamp 8218 days

### northwind

- Empty tables: 2 (customer_customer_demo, customer_demographics)
- Stale tables: 2, oldest newest-timestamp 11615 days
- Confirmed suspicions: dead_table:customer_customer_demo+customer_demographics; dead_table:orders+order_details

### sakila

- Tables without a primary key: payment_p2007_01, payment_p2007_02, payment_p2007_03, payment_p2007_04, payment_p2007_05, payment_p2007_06
- Empty tables: 6 (payment_p2007_01, payment_p2007_02, payment_p2007_03, payment_p2007_04, payment_p2007_05, payment_p2007_06)
- Stale tables: 15, oldest newest-timestamp 7505 days
- Confirmed suspicions: dead_table:payment_p2007_01+payment_p2007_02+payment_p2007_03+payment_p2007_04+payment_p2007_05+payment_p2007_06; missing_key:payment_p2007_01+payment_p2007_02+payment_p2007_03+payment_p2007_04+payment_p2007_05+payment_p2007_06

### pagila

- Empty tables: 1 (rental_by_category)
- Confirmed suspicions: dead_table:rental_by_category

### gitea

- Empty tables: 113
- Model run failed: {"type":"error","error":{"details":null,"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CefNiz2sQXVVnhj8ong2C"}

### discourse

- Tables without a primary key: ad_plugin_house_ads_categories, ad_plugin_house_ads_groups, ad_plugin_house_ads_routes, categories_web_hooks, chat_mention_notifications, discourse_workflows_execution_data, given_daily_likes, groups_web_hooks, inferred_concept_posts, inferred_concept_topics, nested_hot_post_scores, nested_hot_score_snapshots, poll_votes, post_replies, post_timings, tags_web_hooks, topic_views, user_options, web_hook_event_types_hooks
- Empty tables: 364
- Model run failed: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."},"request_id":"req_011CefNqxrNheW6pWuWRoDhP"}

### mastodon

- Empty tables: 117

### metabase

- Tables without a primary key: databasechangelog, model_index_value, table_privileges
- Empty tables: 119
